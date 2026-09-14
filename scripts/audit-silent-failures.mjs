#!/usr/bin/env node
/**
 * Audit des failures silencieux dans le codebase SchoolPro.
 *
 * Détecte:
 *  1. Filtres site potentiellement bypassés (spread d'objets non typés dans where)
 *  2. catch/try qui avalent les erreurs sans log
 *  3. .catch() qui avalent les rejections sans log
 *  4. Promises non attendés (fire-and-forget) hors transaction
 *  5. as any sur des filtres/where Prisma
 *  6. safeParse sans vérification de .success
 *  7. JSON.parse sans try/catch
 *  8. Requêtes Prisma sans tenantId (sauf super-admin)
 *  9. auditFire/publishEvents sans await (audit fire-and-forget)
 * 10. Filtres conditionnels qui peuvent être undefined/vide
 */
import { execSync } from "child_process";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

// ─── Helpers ───────────────────────────────────────────────
function grep(pattern, opts = {}) {
  const { glob = "*.{ts,tsx}", excludeTests = true, path = SRC } = opts;
  try {
    const cmd = `rg -n --no-heading "${pattern}" "${path}" --glob "${glob}"${
      excludeTests ? ' --glob "!*.test.*"' : ""
    } 2>/dev/null || true`;
    return execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readFileLines(filePath, startLine, endLine) {
  const content = readFileSync(filePath, "utf-8");
  return content.split("\n").slice(startLine - 1, endLine);
}

// ─── Catégorie 1: Filtres site bypassés ────────────────────
function auditSiteFilterBypass() {
  const findings = [];
  // Pattern: spread d'un objet Record<string, unknown> dans un where Prisma
  // sans vérifier qu'il n'est pas vide/undefined
  const spreads = grep("\\.\\.\\.(siteFilter|userFilter|siteWhere|relationScope|niveauFilter|eleveScope|anneeFilter)");
  for (const line of spreads) {
    const [file, lineNum] = line.split(":");
    const ln = parseInt(lineNum);
    // Vérifier si le filtre peut être undefined ou vide
    const ctx = readFileLines(file, Math.max(1, ln - 5), ln + 2).join("\n");
    if (ctx.includes("?? {}") || ctx.includes(": {}") || ctx.includes("|| {}")) {
      findings.push({
        file: relative(ROOT, file),
        line: ln,
        severity: "MEDIUM",
        category: "SITE_FILTER_BYPASS",
        message: "Filtre site peut être vide {} — vérifier que le périmètre est correctement appliqué",
        context: line.split(":").slice(2).join(":"),
      });
    }
  }
  return findings;
}

// ─── Catégorie 2: catch qui avalent les erreurs ────────────
function auditSilentCatch() {
  const findings = [];
  // catch blocks qui ne loggent rien
  const catches = grep("catch\\s*\\(");
  for (const line of catches) {
    const [file, lineNum, ...rest] = line.split(":");
    const ln = parseInt(lineNum);
    const ctx = readFileLines(file, ln, ln + 5).join("\n");
    // Pas de console, throw, audit, logger dans les 5 lignes suivantes
    if (!ctx.includes("console.") && !ctx.includes("throw") && !ctx.includes("audit") && !ctx.includes("logger")) {
      findings.push({
        file: relative(ROOT, file),
        line: ln,
        severity: "HIGH",
        category: "SILENT_CATCH",
        message: "catch block sans log/throw — erreur avalée silencieusement",
        context: rest.join(":").trim(),
      });
    }
  }
  return findings;
}

// ─── Catégorie 3: .catch() sans log ────────────────────────
function auditSilentCatchArrow() {
  const findings = [];
  // .catch(() => {}) ou .catch(() => null) sans log
  const silentCatches = grep("\\.catch\\(\\(\\)\\s*=>\\s*(\\{[^}]*\\}|null|undefined)\\)");
  for (const line of silentCatches) {
    const [file, lineNum, ...rest] = line.split(":");
    const ln = parseInt(lineNum);
    const ctx = readFileLines(file, ln, ln).join("\n");
    if (!ctx.includes("console.") && !ctx.includes("non-fatal")) {
      findings.push({
        file: relative(ROOT, file),
        line: ln,
        severity: "MEDIUM",
        category: "SILENT_CATCH_ARROW",
        message: ".catch() vide — rejection avalée sans trace",
        context: rest.join(":").trim(),
      });
    }
  }
  return findings;
}

// ─── Catégorie 4: Promises non attendés ────────────────────
function auditFireAndForget() {
  const findings = [];
  // auditFire/publishEvents sans await
  const fireForget = grep("(auditFire|publishEvents|notify\\(|sendEmail|sendSMS|sendWhatsApp)\\s*\\(")
    .filter((l) => !l.includes("await") && !l.includes("const ") && !l.includes("let ") && !l.includes("function") && !l.includes("import") && !l.includes("return") && !l.includes("=>"));
  for (const line of fireForget) {
    const [file, lineNum, ...rest] = line.split(":");
    const ln = parseInt(lineNum);
    findings.push({
      file: relative(ROOT, file),
      line: ln,
      severity: "MEDIUM",
      category: "FIRE_AND_FORGET",
      message: "Promise non attendue — si elle échoue, l'échec est silencieux",
      context: rest.join(":").trim(),
    });
  }
  return findings;
}

// ─── Catégorie 5: as any sur filtres ───────────────────────
function auditAsAnyOnFilters() {
  const findings = [];
  const asAny = grep("as any").filter((l) => !l.includes("eslint-disable"));
  for (const line of asAny) {
    const [file, lineNum, ...rest] = line.split(":");
    const ln = parseInt(lineNum);
    const ctx = readFileLines(file, Math.max(1, ln - 3), ln + 3).join("\n");
    const isFilterContext = ctx.includes("where") || ctx.includes("Filter") || ctx.includes("scope") || ctx.includes("prisma.");
    findings.push({
      file: relative(ROOT, file),
      line: ln,
      severity: isFilterContext ? "HIGH" : "LOW",
      category: "AS_ANY",
      message: isFilterContext
        ? "as any sur un contexte de filtre Prisma — risque de bypass silencieux"
        : "as any — type safety affaibli",
      context: rest.join(":").trim(),
    });
  }
  return findings;
}

// ─── Catégorie 6: safeParse sans vérification ──────────────
function auditSafeParseWithoutCheck() {
  const findings = [];
  const safeParses = grep("safeParse\\(");
  for (const line of safeParses) {
    const [file, lineNum, ...rest] = line.split(":");
    const ln = parseInt(lineNum);
    const ctx = readFileLines(file, ln, ln + 5).join("\n");
    // Vérifier si .success est checké dans les 5 lignes suivantes
    if (!ctx.includes(".success") && !ctx.includes("if (!parsed)") && !ctx.includes("if (!result)")) {
      findings.push({
        file: relative(ROOT, file),
        line: ln,
        severity: "HIGH",
        category: "SAFEPARSE_NO_CHECK",
        message: "safeParse sans vérification de .success — données potentiellement invalides utilisées",
        context: rest.join(":").trim(),
      });
    }
  }
  return findings;
}

// ─── Catégorie 7: JSON.parse sans try/catch ────────────────
function auditJsonParseWithoutTryCatch() {
  const findings = [];
  const jsonParses = grep("JSON\\.parse\\(");
  for (const line of jsonParses) {
    const [file, lineNum, ...rest] = line.split(":");
    const ln = parseInt(lineNum);
    const ctx = readFileLines(file, Math.max(1, ln - 5), ln + 2).join("\n");
    if (!ctx.includes("try") && !ctx.includes("catch") && !ctx.includes(".parse(JSON.parse(")) {
      findings.push({
        file: relative(ROOT, file),
        line: ln,
        severity: "MEDIUM",
        category: "JSON_PARSE_NO_TRY",
        message: "JSON.parse sans try/catch — crash si JSON invalide",
        context: rest.join(":").trim(),
      });
    }
  }
  return findings;
}

// ─── Catégorie 8: Requêtes Prisma sans tenantId ────────────
function auditPrismaWithoutTenantId() {
  const findings = [];
  // Chercher les appels prisma.xxx.findMany/findFirst/etc avec where: { ... }
  // et vérifier si tenantId est présent dans le bloc where
  const prismaCalls = grep("prisma\\.\\w+\\.(findMany|findFirst|findUnique|create|update|delete|upsert|count|aggregate|groupBy)\\(");
  const skipModels = ["tenant", "anneesScolaires", "site", "user", "auditLog", "session", "account", "verificationToken", "emailLog", "userTenant", "siteDeletionLog"];
  for (const line of prismaCalls) {
    const [file, lineNum, ...rest] = line.split(":");
    const ln = parseInt(lineNum);
    // Extraire le nom du modèle
    const match = line.match(/prisma\.(\w+)\./);
    if (!match) continue;
    const model = match[1];
    if (skipModels.includes(model)) continue;
    // Vérifier si le fichier est dans super-admin
    if (file.includes("super-admin") || file.includes("SuperAdmin")) continue;
    // Lire les 10 lignes suivantes pour trouver le where
    const ctx = readFileLines(file, ln, ln + 10).join("\n");
    if (!ctx.includes("tenantId")) {
      findings.push({
        file: relative(ROOT, file),
        line: ln,
        severity: "CRITICAL",
        category: "PRISMA_NO_TENANT_ID",
        message: `prisma.${model} sans tenantId dans le where — risque de fuite multi-tenant`,
        context: rest.join(":").trim(),
      });
    }
  }
  return findings;
}

// ─── Catégorie 9: Filtres conditionnels vides ──────────────
function auditConditionalEmptyFilters() {
  const findings = [];
  // Pattern: const xxx = condition ? { ... } : {}
  // Ces filtres peuvent être vides si la condition est fausse
  const conditionalFilters = grep("(const|let)\\s+\\w*(Filter|Scope|Where)\\s*=.*\\?.*\\{.*\\}\\s*:\\s*\\{\\s*\\}");
  for (const line of conditionalFilters) {
    const [file, lineNum, ...rest] = line.split(":");
    const ln = parseInt(lineNum);
    findings.push({
      file: relative(ROOT, file),
      line: ln,
      severity: "LOW",
      category: "CONDITIONAL_EMPTY_FILTER",
      message: "Filtre conditionnel qui peut être vide {} — vérifier que le défaut fermé (fail-closed) est respecté",
      context: rest.join(":").trim(),
    });
  }
  return findings;
}

// ─── Rapport ───────────────────────────────────────────────
function generateReport() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  AUDIT DES FAILURES SILENCIEUX — SchoolPro / LEARNOS       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();

  const audits = [
    ["1. Filtres site bypassés", auditSiteFilterBypass],
    ["2. catch silencieux (erreurs avalées)", auditSilentCatch],
    ["3. .catch() vides (rejections avalées)", auditSilentCatchArrow],
    ["4. Promises non attendues (fire-and-forget)", auditFireAndForget],
    ["5. as any sur filtres/types", auditAsAnyOnFilters],
    ["6. safeParse sans vérification", auditSafeParseWithoutCheck],
    ["7. JSON.parse sans try/catch", auditJsonParseWithoutTryCatch],
    ["8. Prisma sans tenantId", auditPrismaWithoutTenantId],
    ["9. Filtres conditionnels vides", auditConditionalEmptyFilters],
  ];

  const allFindings = [];
  for (const [title, fn] of audits) {
    const findings = fn();
    allFindings.push(...findings);
    const counts = {};
    for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
    const summary = Object.entries(counts).map(([s, c]) => `${c} ${s}`).join(", ") || "0";
    console.log(`\n┌─ ${title}`);
    console.log(`│  ${findings.length} trouvaille(s) — ${summary}`);
    for (const f of findings.slice(0, 5)) {
      console.log(`│  [${f.severity}] ${f.file}:${f.line} — ${f.message}`);
    }
    if (findings.length > 5) {
      console.log(`│  ... et ${findings.length - 5} autre(s)`);
    }
    console.log(`└─`);
  }

  // Résumé par sévérité
  const bySeverity = {};
  for (const f of allFindings) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  const byCategory = {};
  for (const f of allFindings) byCategory[f.category] = (byCategory[f.category] || 0) + 1;

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  RÉSUMÉ                                                      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nTotal: ${allFindings.length} trouvaille(s)`);
  console.log("\nPar sévérité:");
  for (const [sev, count] of Object.entries(bySeverity).sort()) {
    console.log(`  ${sev}: ${count}`);
  }
  console.log("\nPar catégorie:");
  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  // Liste détaillée des CRITICAL
  const criticals = allFindings.filter((f) => f.severity === "CRITICAL");
  if (criticals.length > 0) {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║  CRITIQUES — À TRAITER EN PRIORITÉ                           ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    for (const f of criticals) {
      console.log(`  ${f.file}:${f.line}`);
      console.log(`    ${f.message}`);
      console.log(`    ${f.context}`);
      console.log();
    }
  }

  // Liste détaillée des HIGH
  const highs = allFindings.filter((f) => f.severity === "HIGH");
  if (highs.length > 0) {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║  HAUT RISQUE — À INVESTIGUER                                ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    for (const f of highs.slice(0, 20)) {
      console.log(`  [${f.category}] ${f.file}:${f.line}`);
      console.log(`    ${f.message}`);
    }
    if (highs.length > 20) {
      console.log(`  ... et ${highs.length - 20} autre(s)`);
    }
  }

  return allFindings;
}

const findings = generateReport();
process.exit(findings.some((f) => f.severity === "CRITICAL") ? 1 : 0);
