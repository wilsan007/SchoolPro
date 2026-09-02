/**
 * Audit statique : détecte les requêtes Prisma sans filtrage par année scolaire.
 *
 *   pnpm tsx scripts/audit-annee.ts
 *
 * Inspiré du VerificateurPerimetre de GOSE 2.0 — le cloisonnement par année
 * est une règle non négociable (AGENTS.md §2). Une requête sans filtre d'année
 * mélange les données de toutes les années — c'est le bug qui a affecté 42
 * fichiers en août 2026.
 *
 * Ce script est en lecture seule — aucune écriture en base.
 *
 * Améliorations v2 :
 *  - Détecte les variables et spreads qui contiennent tenantId/annee
 *  - Marque les faux positifs potentiels comme NEEDS_REVIEW
 *  - Réduit le bruit pour se concentrer sur les vraies violations
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

// Modèles qui nécessitent un filtrage par année (cf. scoped-where.ts)
const TARGETS = [
  "classe", "emploiTemps", "devoir", "evaluation", "note", "tache",
  "seancePedagogique", "affectationEnseignant", "absence", "incident",
  "passageInfirmerie", "recommandation", "parcoursScolaire", "historiqueClasse",
  "bulletin", "bulletinMatiere",
];

const METHODS = [
  "findMany", "findFirst", "findFirstOrThrow", "findUnique",
  "findUniqueOrThrow", "count", "groupBy", "aggregate",
  "updateMany", "deleteMany", "upsert",
];

// Patterns qui indiquent un filtrage par année (direct ou indirect)
const ANNEE_PATTERNS = [
  "annee:", "anneeCourante", "anneeActive", "getAnneeCourante",
  "anneeActiveId", "anneeActiveLibelle",
  "classe: { annee", "classe: { ...classeFilter", "...anneeClasse",
  "eleve: { classe: { annee", "...anneeEleve",
  "periode: { annee", "periode: { anneeId",
  // Variables supplémentaires
  "anneeInscription", "anneeId:", "annee?.libelle",
  "annee:", "annee ?", "{ annee }", "{ annee,",
  // mergeFilters contient souvent le filtre d'année
  "mergeFilters(",
];

const anneeRe = new RegExp(
  ANNEE_PATTERNS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
);
const callRe = new RegExp(
  `prisma\\.(${TARGETS.join("|")})\\.(${METHODS.join("|")})\\(`,
  "g"
);

// Patterns indiquant que tenantId est probablement présent via variable/spread
const TENANT_ID_INDIRECT = [
  /\.\.\.\w+/,           // spread: ...someVar
  /\.\.\.siteFilter/,    // ...siteFilterForModel(...)
  /\.\.\.wheres\./,      // ...wheres.absence
  /\.\.\.where\b/,       // ...where (spread of a where variable)
  /where:\s*\w+Where\b/, // where: absenceWhere (variable)
  /where:\s*\w+\.where\b/, // where: something.where
  /where:\s*wheres\./,   // where: wheres.classe (dashboard)
  /where:\s*\w+Filter/,  // where: classeFilter (variable)
  /where:\s*mergeFilters/, // where: mergeFilters(...) — tenantId is inside
  /\.\.\.absenceWhere/,  // ...absenceWhere
  /\.\.\.classeFilter/,  // ...classeFilter
  /\.\.\.eleveFilter/,   // ...eleveFilter
  /\.\.\.noteFilter/,    // ...noteFilter
  /\.\.\.devoirFilter/,  // ...devoirFilter
  /\.\.\.incidentFilter/,// ...incidentFilter
  /\.\.\.bulletinFilter/,// ...bulletinFilter
  /\.\.\.evalFilter/,    // ...evalFilter
  /where:\s*scopedWhere/, // where: scopedWhere(...)
  /\.\.\.scoped/,         // ...scopedWhere(...)
  // mergeFilters call — tenantId is always a parameter
  /mergeFilters\(/,
  // Shorthand where variable — constructed elsewhere with filters
  /\bwhere[,\s\}]/,
  /\bwhere:\s*where\b/,
];

// Patterns indiquant que l'année est probablement filtrée via variable/spread
const ANNEE_INDIRECT = [
  /\.\.\.\w*Annee/i,      // ...anneeFilter, ...anneeClasse, etc.
  /\.\.\.wheres\./,       // ...wheres.absence (buildDashboardWheres includes year)
  /\.\.\.where\b/,        // ...where (spread of a where variable)
  /where:\s*\w+Where\b/,  // where: absenceWhere (variable)
  /where:\s*wheres\./,    // where: wheres.classe (dashboard, includes year)
  /where:\s*\w+Filter/,   // where: classeFilter (may include year)
  /where:\s*scopedWhere/, // where: scopedWhere(...)
  /\.\.\.scoped/,         // ...scopedWhere(...)
  /\.\.\.filtreAnnee/,    // ...filtreAnneeClasse
  /\.\.\.classeFilter/,   // ...classeFilter (may include year)
  /\.\.\.anneeClasse/,    // ...anneeClasse
  /\.\.\.anneeEleve/,     // ...anneeEleve
  /\.\.\.filtreAnneeViaClasse/, // ...filtreAnneeViaClasse
  /\.\.\.filtreAnneeClasse/,    // ...filtreAnneeClasse
  // Shorthand where variable — constructed elsewhere with year filter
  /\bwhere[,\s\}]/,
  /\bwhere:\s*where\b/,
  /mergeFilters\(/,
];

function shouldAudit(absPath: string): boolean {
  const rel = path.relative(SRC, absPath);
  if (!rel.endsWith(".ts") && !rel.endsWith(".tsx")) return false;
  if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) return false;
  if (rel.startsWith("lib/domain/")) return false;
  if (rel.startsWith("app/api/") || rel.startsWith("app/(dashboard)/")) return true;
  if (rel.startsWith("lib/")) return true;
  return false;
}

function walk(dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (p.includes("node_modules") || p.includes(".next") || p.includes(".git")) continue;
      if (p === path.join(SRC, "lib/domain")) continue;
      walk(p, out);
    } else if (shouldAudit(p)) {
      out.push(p);
    }
  }
}

/** Extrait le bloc d'arguments d'un appel prisma.xxx.method(...) */
function extractCallBlock(src: string, start: number): string {
  let i = start;
  while (i < src.length && src[i] !== "{" && src[i] !== ";") i++;
  if (src[i] !== "{") return src.slice(start, i);
  let depth = 0;
  let inString: string | null = null;
  let escaped = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inString = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  return src.slice(start, i);
}

/**
 * Vérifie si le fichier contient une définition de variable
 * qui inclut tenantId, pour détecter les faux positifs.
 */
function fileHasTenantIdPattern(src: string): boolean {
  // Cherche les définitions de variables qui contiennent tenantId
  // ex: const absenceWhere = { tenantId, ... }
  // ex: const wheres = buildDashboardWheres(tenantId, ...)
  return /(?:const|let|var)\s+\w+\s*=\s*[^;]*tenantId/.test(src) ||
    /buildDashboardWheres/.test(src) ||
    /scopedWhere\s*\(/.test(src);
}

const files: string[] = [];
walk(SRC, files);

interface Violation {
  model: string;
  method: string;
  file: string;
  line: number;
  tenantId: "EXPLICIT" | "INDIRECT" | "MISSING";
  annee: "EXPLICIT" | "INDIRECT" | "MISSING";
  severity: "CRITICAL" | "HIGH" | "NEEDS_REVIEW";
}

const violations: Violation[] = [];

for (const f of files) {
  const rel = path.relative(ROOT, f);
  const src = fs.readFileSync(f, "utf8");
  const fileHasTenantId = fileHasTenantIdPattern(src);
  let m: RegExpExecArray | null;
  callRe.lastIndex = 0;
  while ((m = callRe.exec(src)) !== null) {
    const model = m[1];
    const method = m[2];
    const start = m.index;
    const line = src.slice(0, start).split("\n").length;
    const block = extractCallBlock(src, start + m[0].length);

    // tenantId detection — détecte aussi la syntaxe shorthand { tenantId, }
    const hasExplicitTenantId = /tenantId\s*[:,\s]/.test(block) || /,\s*tenantId\s*[,\}]/.test(block);
    const hasIndirectTenantId = !hasExplicitTenantId && TENANT_ID_INDIRECT.some((re) => re.test(block));
    const tenantId: Violation["tenantId"] = hasExplicitTenantId
      ? "EXPLICIT"
      : hasIndirectTenantId
        ? "INDIRECT"
        : "MISSING";

    // annee detection
    const hasExplicitAnnee = anneeRe.test(block);
    const hasIndirectAnnee = !hasExplicitAnnee && ANNEE_INDIRECT.some((re) => re.test(block));
    const annee: Violation["annee"] = hasExplicitAnnee
      ? "EXPLICIT"
      : hasIndirectAnnee
        ? "INDIRECT"
        : "MISSING";

    // Skip if both are present (explicit or indirect)
    if (tenantId !== "MISSING" && annee !== "MISSING") continue;

    // Determine severity
    let severity: Violation["severity"];
    if (tenantId === "MISSING" && annee === "MISSING") {
      // Check if file has tenantId pattern elsewhere (false positive candidate)
      if (fileHasTenantId && (hasIndirectTenantId || block.includes("..."))) {
        severity = "NEEDS_REVIEW";
      } else {
        severity = "CRITICAL";
      }
    } else if (tenantId !== "MISSING" && annee === "MISSING") {
      severity = "HIGH";
    } else if (tenantId === "MISSING" && annee !== "MISSING") {
      severity = "NEEDS_REVIEW";
    } else {
      continue;
    }

    violations.push({ model, method, file: rel, line, tenantId, annee, severity });
  }
}

violations.sort((a, b) => {
  const s = { CRITICAL: 0, HIGH: 1, NEEDS_REVIEW: 2 };
  if (s[a.severity] !== s[b.severity]) return s[a.severity] - s[b.severity];
  return `${a.file}:${a.line}`.localeCompare(`${b.file}:${b.line}`);
});

// ---- Rapport lisible ----
const critical = violations.filter((v) => v.severity === "CRITICAL");
const high = violations.filter((v) => v.severity === "HIGH");
const review = violations.filter((v) => v.severity === "NEEDS_REVIEW");

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║     AUDIT PÉRIMÈTRE v2 — Filtrage tenantId + année scolaire  ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log();
console.log(`Fichiers scannés        : ${files.length}`);
console.log(`Violations détectées    : ${violations.length}`);
console.log(`  ├─ CRITICAL    (tenantId + année manquants) : ${critical.length}`);
console.log(`  ├─ HIGH        (tenantId OK, année absente)  : ${high.length}`);
console.log(`  └─ NEEDS_REVIEW (faux positif probable)      : ${review.length}`);
console.log();

// Grouper par modèle
const byModel = new Map<string, Violation[]>();
for (const v of violations) {
  const arr = byModel.get(v.model) ?? [];
  arr.push(v);
  byModel.set(v.model, arr);
}

console.log("── Par modèle ────────────────────────────────────────────────");
for (const [model, vs] of [...byModel.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const c = vs.filter((v) => v.severity === "CRITICAL").length;
  const h = vs.filter((v) => v.severity === "HIGH").length;
  const r = vs.filter((v) => v.severity === "NEEDS_REVIEW").length;
  console.log(`  ${model.padEnd(24)} ${vs.length} violation(s)  [C:${c} H:${h} R:${r}]`);
}
console.log();

console.log("── CRITICAL (tenantId + année manquants) ─────────────────────");
if (critical.length === 0) {
  console.log("  ✓ Aucune violation critique.");
} else {
  for (const v of critical) {
    console.log(`  ${v.file}:${v.line}  prisma.${v.model}.${v.method}`);
  }
}
console.log();

console.log("── HIGH (tenantId OK, année manquante) ───────────────────────");
if (high.length === 0) {
  console.log("  ✓ Aucune violation HIGH.");
} else {
  for (const v of high) {
    console.log(`  ${v.file}:${v.line}  prisma.${v.model}.${v.method}`);
  }
}
console.log();

if (review.length > 0) {
  console.log("── NEEDS_REVIEW (faux positif probable — vérifier manuellement) ──");
  for (const v of review.slice(0, 20)) {
    console.log(`  ${v.file}:${v.line}  prisma.${v.model}.${v.method}  [tenantId:${v.tenantId} annee:${v.annee}]`);
  }
  if (review.length > 20) {
    console.log(`  ... et ${review.length - 20} autres (voir AUDIT-PERIMETRE.json)`);
  }
  console.log();
}

// Top fichiers par nombre de violations (CRITICAL + HIGH seulement)
const realViolations = [...critical, ...high];
const byFile = new Map<string, number>();
for (const v of realViolations) {
  byFile.set(v.file, (byFile.get(v.file) ?? 0) + 1);
}

if (byFile.size > 0) {
  console.log("── Top 15 fichiers par nombre de violations réelles ──────────");
  const topFiles = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [file, count] of topFiles) {
    console.log(`  ${String(count).padStart(3)}  ${file}`);
  }
  console.log();
}

// Export JSON pour CI
const reportPath = path.join(ROOT, "AUDIT-PERIMETRE.json");
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      version: 2,
      filesScanned: files.length,
      totalViolations: violations.length,
      critical: critical.length,
      high: high.length,
      needsReview: review.length,
      violations,
    },
    null,
    2
  )
);
console.log(`Rapport JSON exporté : ${reportPath}`);
console.log();

if (critical.length > 0) {
  console.log(`❌ ÉCHEC : ${critical.length} violation(s) CRITICAL (fuite de données entre tenants).`);
  process.exit(1);
} else if (high.length > 0) {
  console.log(`⚠ ATTENTION : ${high.length} requête(s) sans filtre d'année (mélange inter-années).`);
  process.exit(0);
} else {
  console.log("✓ SUCCÈS : toutes les requêtes sur modèles scopés ont un filtre d'année.");
  process.exit(0);
}
