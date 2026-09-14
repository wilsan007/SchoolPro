#!/usr/bin/env node
/**
 * find-prisma-no-tenant.mjs — Liste toutes les requêtes Prisma sans tenantId.
 *
 * Améliorations v2 :
 *  - Trace les variables `where` construites en amont (const where = mergeFilters(...),
 *    const where = { tenantId, ... }) et vérifie leur contenu.
 *  - Détecte les commentaires eslint-disable ecolpro/require-tenant-id (exceptions légitimes).
 *  - Élargit la liste des modèles système/globaux à ignorer.
 *  - Détecte les appels qui passent une variable `where` (prisma.x.findMany({ where }))
 *    et remonte jusqu'à sa définition.
 */
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { relative } from "path";

const ROOT = process.cwd();
const SRC = `${ROOT}/src`;

// ------------------------------------------------------------
// Modèles à ignorer : système, globaux, ou protégés par relation
// (pas de colonne tenantId directe, isolation via parent)
// ------------------------------------------------------------
const skipModels = new Set([
  // Modèles globaux/système
  "tenant", "anneesScolaires", "site", "user", "auditLog", "session",
  "account", "verificationToken", "emailLog", "userTenant", "siteDeletionLog",
  "aiCache", "rateLimitCounter", "tacheCronExecution", "module",
  "calendrierOfficiel",
  // Modèles de relation N-N ou enfant protégés par relation parent
  "eleveParent", "conversationParticipant", "enseignantSite", "userSite",
  "sanction", "membreConseil", "objectifMentorat", "seanceMentorat",
  "reunion", "echeancePaiement", "seanceCommentaire",
  // Event bus (cross-tenant par design, handlers vérifient le tenant)
  "learnosEvent", "learnosEventDeadletter",
]);

// ------------------------------------------------------------
// Recherche ripgrep
// ------------------------------------------------------------
function grep(pattern) {
  try {
    return execSync(
      `rg -n --no-heading "${pattern}" "${SRC}" --glob "*.{ts,tsx}" --glob "!*.test.*" 2>/dev/null`,
      { encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 }
    ).trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// ------------------------------------------------------------
// Vérifie si une ligne ou ses voisines contient un eslint-disable
// pour require-tenant-id (exception légitime documentée)
// ------------------------------------------------------------
function hasEslintDisable(lines, ln) {
  // Cherche dans les 5 lignes précédant l'appel
  for (let i = Math.max(0, ln - 6); i < ln - 1; i++) {
    if (lines[i] && lines[i].includes("eslint-disable") && lines[i].includes("require-tenant-id")) {
      return true;
    }
  }
  // Ou sur la même ligne
  if (lines[ln - 1] && lines[ln - 1].includes("eslint-disable") && lines[ln - 1].includes("require-tenant-id")) {
    return true;
  }
  return false;
}

// ------------------------------------------------------------
// Cherche la définition d'une variable `where` et vérifie si elle
// contient tenantId. Remonte jusqu'à 80 lignes en arrière.
// ------------------------------------------------------------
function whereVarHasTenantId(lines, callLine, varName) {
  // Cherche la définition de la variable en remontant.
  // La définition peut s'étendre sur plusieurs lignes :
  //   const where = {
  //     tenantId,
  //     ...siteFilter,
  //   };
  // On détecte le début (const/let varName =) puis on lit les 15 lignes
  // suivantes pour vérifier la présence de tenantId.
  const defPattern = new RegExp(`(?:const|let)\\s+${varName}\\s*=`);

  for (let i = callLine - 2; i >= Math.max(0, callLine - 80); i--) {
    const line = lines[i];
    if (!line) continue;
    if (defPattern.test(line)) {
      // Trouvé la définition : lire les 15 lignes suivantes (incluses)
      // pour vérifier la présence de tenantId.
      const block = lines.slice(i, Math.min(lines.length, i + 15)).join("\n");
      if (block.includes("tenantId")) return true;
      // Aussi vérifier mergeFilters (le tenantId peut être dans un objet
      // passé en premier argument, potentiellement sur plusieurs lignes).
      if (block.includes("mergeFilters")) {
        // mergeFilters({ tenantId, ... }, ...) — vérifier les 15 lignes
        if (block.includes("tenantId")) return true;
      }
      return false;
    }
  }
  return false;
}

// ------------------------------------------------------------
// Vérifie si un appel Prisma passe une variable `where` (vs inline)
// ------------------------------------------------------------
function extractWhereVar(callFragment) {
  // Détecte: { where } ou { where, ... } ou ({ where })
  const m = callFragment.match(/\{\s*where\s*[,}]/);
  if (m) return "where";
  // Détecte: { where: <varName>, ... }
  const m2 = callFragment.match(/where:\s*(\w+)\s*[,}]/);
  if (m2 && m2[1] !== "true" && m2[1] !== "false" && m2[1] !== "null" && m2[1] !== "undefined") {
    return m2[1];
  }
  return null;
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
const prismaCalls = grep(
  "prisma\\.\\w+\\.(findMany|findFirst|findUnique|create|update|delete|upsert|count|aggregate|groupBy)\\("
);

const findings = [];
const falsePositives = [];

for (const line of prismaCalls) {
  const [file, lineNum, ...rest] = line.split(":");
  const ln = parseInt(lineNum);
  const match = line.match(/prisma\.(\w+)\./);
  if (!match) continue;
  const model = match[1];
  if (skipModels.has(model)) continue;
  if (file.includes("super-admin") || file.includes("SuperAdmin")) continue;
  if (file.includes("/test/") || file.includes("setup-links")) continue;

  // Lire le fichier et extraire le contexte
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");

  // Ignorer les lignes dans des commentaires JSDoc (commencent par * ou //)
  const callLineContent = lines[ln - 1] ?? "";
  if (callLineContent.trim().startsWith("*") || callLineContent.trim().startsWith("//")) {
    continue;
  }

  // Vérifier eslint-disable nearby
  if (hasEslintDisable(lines, ln)) {
    falsePositives.push({
      file: relative(ROOT, file),
      line: ln,
      model,
      reason: "eslint-disable require-tenant-id",
      context: rest.join(":").trim(),
    });
    continue;
  }

  // Lire 15 lignes suivant l'appel pour vérifier tenantId inline
  const ctx = lines.slice(ln - 1, ln + 14).join("\n");

  // Vérifier si tenantId est présent inline dans l'appel
  if (ctx.includes("tenantId")) continue;

  // Vérifier si l'appel utilise une variable `where` construite en amont
  const callFragment = lines.slice(ln - 1, ln + 4).join("\n");
  const whereVar = extractWhereVar(callFragment);
  if (whereVar && whereVarHasTenantId(lines, ln, whereVar)) {
    continue;
  }

  // Vérifier si l'appel est dans un withSystemContext ou withRlsContext
  // (contexte système légitime)
  let inSystemContext = false;
  for (let i = ln - 2; i >= Math.max(0, ln - 30); i--) {
    const l = lines[i];
    if (l && (l.includes("withSystemContext") || l.includes("withRlsContext"))) {
      inSystemContext = true;
      break;
    }
    // Si on trouve une fermeture de fonction avant le contexte, on arrête
    if (i < ln - 10 && l && l.match(/^\s*\}/)) break;
  }
  if (inSystemContext) {
    falsePositives.push({
      file: relative(ROOT, file),
      line: ln,
      model,
      reason: "withSystemContext/withRlsContext",
      context: rest.join(":").trim(),
    });
    continue;
  }

  findings.push({
    file: relative(ROOT, file),
    line: ln,
    model,
    context: rest.join(":").trim(),
  });
}

// ------------------------------------------------------------
// Rapport
// ------------------------------------------------------------
const byModel = {};
for (const f of findings) {
  byModel[f.model] = byModel[f.model] || [];
  byModel[f.model].push(f);
}

console.log(`\nTotal Prisma calls without tenantId: ${findings.length}`);
console.log(`False positives filtered out: ${falsePositives.length}`);
console.log("");

console.log("By model:");
for (const [model, items] of Object.entries(byModel).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${model}: ${items.length}`);
}

console.log("\n--- Detailed list (potential real violations) ---");
for (const f of findings) {
  console.log(`  ${f.file}:${f.line} — prisma.${f.model} — ${f.context.substring(0, 80)}`);
}

if (falsePositives.length > 0) {
  console.log("\n--- Filtered false positives (for verification) ---");
  for (const f of falsePositives.slice(0, 20)) {
    console.log(`  ${f.file}:${f.line} — prisma.${f.model} — [${f.reason}] — ${f.context.substring(0, 60)}`);
  }
  if (falsePositives.length > 20) {
    console.log(`  ... and ${falsePositives.length - 20} more`);
  }
}
