#!/usr/bin/env node
/**
 * Corrige automatiquement les update/delete sans tenantId.
 *
 * Pattern ciblé:
 *   prisma.MODEL.update({ where: { id }, ... })
 *   prisma.MODEL.delete({ where: { id } })
 *   prisma.MODEL.update({ where: { id: someVar }, ... })
 *
 * Devient:
 *   prisma.MODEL.update({ where: { id, tenantId: VAR }, ... })
 *
 * VAR est détecté automatiquement (session.user.tenantId ou tenantId local).
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

const ROOT = "/Users/awalehosman/Projects/SchoolPro";

const TENANT_MODELS = new Set([
  "eleve","parent","eleveParent","classe","matiere","chapitre","competence",
  "note","devoir","evaluation","examen","absence","retard","incident",
  "sanction","convocation","exclusion","passageInfirmerie","ficheSanitaire",
  "bulletin","periode","emploiTemps","seancePedagogique",
  "planificationChapitre","planificationCompetence","evenementCalendaire",
  "facture","paiement","echeancier","depense","budget","remiseCaisse",
  "caisse","inventaire","itemInventaire","fourniture","demandeFourniture",
  "enseignant","ficheRH","absencePersonnel","congePersonnel","bulletinPaie",
  "disponibiliteEnseignant","indisponibiliteEnseignant","remplacementCours",
  "affectationEnseignant","salle","notification","message","conversation",
  "conversationParticipant","tache","invitationReinscription",
  "campagneReinscription","alumni","candidature","admission",
  "mentorat","parcoursScolaire","documentEleve",
  "fichierJoint","syncConfig","moduleActivation","impersonationGrant",
  "patternPedagogique","predictionDifficulte","calibrationSeuil",
  "journalApprentissage","feuilleExercices","question","alerteParent",
  "learnosEventDeadletter","rubriqueEvaluation","trimestre","anneesScolaires",
]);

const cmd = `rg -n "prisma\\.(\\w+)\\.(update|delete|updateMany|deleteMany)\\(" src/ --glob "*.{ts,tsx}" --glob "!*.test.*"`;
const lines = execSync(cmd, { encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 })
  .trim()
  .split("\n")
  .filter(Boolean);

const fileChanges = new Map(); // file -> array of {line, oldStr, newStr}

for (const line of lines) {
  const match = line.match(/^(.+?):(\d+):.*prisma\.(\w+)\.(update|delete|updateMany|deleteMany)\(/);
  if (!match) continue;
  const [, file, lineNum, model, op] = match;
  const ln = parseInt(lineNum);

  if (!TENANT_MODELS.has(model)) continue;

  const content = readFileSync(file, "utf-8");
  const fileLines = content.split("\n");
  const ctx = fileLines.slice(ln - 1, ln + 5).join("\n");

  // Skip si déjà tenantId
  if (ctx.includes("tenantId")) continue;

  // Skip si dans $transaction avec tx.
  const broaderCtx = fileLines.slice(Math.max(0, ln - 15), ln + 5).join("\n");
  if (broaderCtx.includes("$transaction") && broaderCtx.match(/tx\.\w+\.(update|delete)/)) continue;

  // Détecter la variable tenantId disponible
  const fullFile = content;
  let tenantVar = null;
  if (fullFile.includes("session.user.tenantId")) {
    tenantVar = "session.user.tenantId";
  } else if (fullFile.includes("session?.user?.tenantId")) {
    tenantVar = "session?.user?.tenantId";
  } else if (fullFile.match(/\btenantId\b/)) {
    tenantVar = "tenantId";
  }

  if (!tenantVar) {
    console.log(`⚠️  Pas de tenantId trouvé: ${file}:${ln} — ${model}.${op}`);
    continue;
  }

  // Patterns à corriger:
  // 1. where: { id }
  // 2. where: { id: someVar }
  // 3. where: { id: question.id }

  const currentLine = fileLines[ln - 1];
  const nextLines = fileLines.slice(ln, ln + 4).join("\n");
  const fullCtx = currentLine + "\n" + nextLines;

  // Pattern 1: where: { id }
  let fixed = false;
  const patterns = [
    // where: { id } (sur une ligne)
    { regex: /where:\s*\{\s*id\s*\}/g, replacement: `where: { id, tenantId: ${tenantVar} }` },
    // where: { id: VAR }
    { regex: /where:\s*\{\s*id:\s*(\w+)\s*\}/g, replacement: `where: { id: $1, tenantId: ${tenantVar} }` },
    // where: { id: VAR.field }
    { regex: /where:\s*\{\s*id:\s*(\w+\.\w+)\s*\}/g, replacement: `where: { id: $1, tenantId: ${tenantVar} }` },
  ];

  for (const { regex, replacement } of patterns) {
    if (regex.test(fullCtx)) {
      // Appliquer sur les lignes concernées
      const oldCtx = fullCtx;
      const newCtx = fullCtx.replace(regex, replacement);
      if (oldCtx !== newCtx) {
        if (!fileChanges.has(file)) fileChanges.set(file, []);
        fileChanges.get(file).push({ ln, oldCtx, newCtx });
        fixed = true;
        break;
      }
    }
    regex.lastIndex = 0; // reset
  }

  if (!fixed) {
    // Pattern multi-lignes: where: {\n  id\n}
    const multilineMatch = fullCtx.match(/where:\s*\{\s*\n\s*id\s*\n\s*\}/);
    if (multilineMatch) {
      const oldStr = multilineMatch[0];
      const newStr = `where: {\n      id,\n      tenantId: ${tenantVar}\n    }`;
      if (!fileChanges.has(file)) fileChanges.set(file, []);
      fileChanges.get(file).push({ ln, oldStr, newStr });
      fixed = true;
    }
  }

  if (!fixed) {
    console.log(`⚠️  Pattern non reconnu: ${file}:${ln} — ${model}.${op} — ${currentLine.trim()}`);
  }
}

// Appliquer les changements
let totalFixed = 0;
for (const [file, changes] of fileChanges) {
  let content = readFileSync(file, "utf-8");
  for (const { oldStr, newStr } of changes) {
    if (content.includes(oldStr)) {
      content = content.replace(oldStr, newStr);
      totalFixed++;
    } else {
      console.log(`⚠️  Impossible d'appliquer: ${file}`);
    }
  }
  writeFileSync(file, content, "utf-8");
  console.log(`✅ ${file.replace(ROOT + "/", "")} — ${changes.length} correction(s)`);
}

console.log(`\nTotal: ${totalFixed} correction(s) appliquée(s) sur ${fileChanges.size} fichier(s)`);
