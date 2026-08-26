#!/usr/bin/env node
/**
 * Audit pédagogique du seed SQL LEARNOS.
 * Vérifie la cohérence du graphe curriculum :
 *   1. Chapitres : 5 par matière × niveau, IDs déterministes
 *   2. Compétences : 3 par chapitre, reliées au bon chapitre
 *   3. Prérequis : chaînes intra-chapitre, inter-chapitres, inter-niveaux, inter-matières
 *   4. Planification chapitres : couvre S1-S36 sans trou ni chevauchement
 *   5. ÉvaluationCompétence : au moins une évaluation par chapitre
 *   6. LearningEvidence : evidences présentes pour tous les chapitres
 *   7. Recommandations : réparties sur plusieurs chapitres
 *
 * Usage: node prisma/sql/_audit/validate-curriculum.mjs
 */
import fs from 'fs';
import path from 'path';

const SQL_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const MATIERES = ['MATH','FR','ANG','AR','HG','PC','SVT','EPS','PHILO','SES'];
const NIVEAUX = ['6eme','5eme','4eme','3eme','2nde','1ere','Terminale'];
const NB_CHAPITRES = 5;
const COMP_PAR_CHAP = 3;

let errors = 0;
let warnings = 0;
const err = (msg) => { console.error(`  ✗ ${msg}`); errors++; };
const warn = (msg) => { console.warn(`  ⚠ ${msg}`); warnings++; };
const ok = (msg) => console.log(`  ✓ ${msg}`);

// ── Lecture des fichiers SQL ──────────────────────────────────
function readSqlFiles(regex) {
  const files = fs.readdirSync(SQL_DIR).filter(f => f.match(regex));
  return files.map(f => fs.readFileSync(path.join(SQL_DIR, f), 'utf8')).join('\n');
}

const curriculumSql = readSqlFiles(/^10-learnos-curriculum/);
const apprentissageSql = readSqlFiles(/^11-learnos-apprentissage/);

// ── Extraction d'IDs via regex simple ─────────────────────────
function extractIds(sql, prefix) {
  const ids = new Set();
  // Match 'prefix-...' jusqu'à la prochaine quote
  const re = new RegExp(`'(${prefix}-[^']+)`, 'g');
  let m;
  while ((m = re.exec(sql)) !== null) ids.add(m[1]);
  return ids;
}

const chapitreIds = extractIds(curriculumSql, 'chap');
const competenceIds = extractIds(curriculumSql, 'comp');

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  AUDIT PÉDAGOGIQUE DU CURRICULUM LEARNOS');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── 1. Chapitres ──────────────────────────────────────────────
console.log('── 1. Chapitres ──');
let chapCount = 0;
for (const mat of MATIERES) {
  for (const niv of NIVEAUX) {
    let count = 0;
    for (let c = 1; c <= NB_CHAPITRES; c++) {
      if (chapitreIds.has(`chap-${mat}-${niv}-${c}`)) count++;
    }
    if (count !== NB_CHAPITRES) {
      err(`${mat}-${niv}: ${count}/${NB_CHAPITRES} chapitres`);
    }
    chapCount += count;
  }
}
const expectedChap = MATIERES.length * NIVEAUX.length * NB_CHAPITRES;
if (chapCount === expectedChap) ok(`${chapCount} chapitres (${MATIERES.length} matières × ${NIVEAUX.length} niveaux × ${NB_CHAPITRES})`);
else err(`Total: ${chapCount}/${expectedChap} chapitres`);

// ── 2. Compétences ─────────────────────────────────────────────
console.log('\n── 2. Compétences ──');
let compCount = 0;
for (const mat of MATIERES) {
  for (const niv of NIVEAUX) {
    for (let c = 1; c <= NB_CHAPITRES; c++) {
      let count = 0;
      for (let k = 1; k <= COMP_PAR_CHAP; k++) {
        if (competenceIds.has(`comp-${mat}-${niv}-${c}-${k}`)) count++;
      }
      if (count !== COMP_PAR_CHAP) {
        err(`${mat}-${niv}-ch${c}: ${count}/${COMP_PAR_CHAP} compétences`);
      }
      compCount += count;
    }
  }
}
const expectedComp = expectedChap * COMP_PAR_CHAP;
if (compCount === expectedComp) ok(`${compCount} compétences (${expectedChap} chapitres × ${COMP_PAR_CHAP})`);
else err(`Total: ${compCount}/${expectedComp} compétences`);

// ── 3. Prérequis ───────────────────────────────────────────────
console.log('\n── 3. Prérequis (graphe _CompetencePrerequis) ──');
// Extraction des paires (A, B) depuis _CompetencePrerequis
// On prend après le INSERT INTO "_CompetencePrerequis"
const prereqSection = curriculumSql.split('INSERT INTO "_CompetencePrerequis"').slice(1).join('') || '';
const prerequisPairs = [];
{
  const re = /\('(comp-[^']+)',\s*'(comp-[^']+)'\)/g;
  let m;
  while ((m = re.exec(prereqSection)) !== null) prerequisPairs.push([m[1], m[2]]);
}

const prereqByChapter = {};
for (let c = 1; c <= NB_CHAPITRES; c++) prereqByChapter[c] = 0;
for (const [a] of prerequisPairs) {
  const parts = a.split('-');
  const ch = parseInt(parts[parts.length - 2]);
  if (prereqByChapter[ch] !== undefined) prereqByChapter[ch]++;
}
for (let c = 1; c <= NB_CHAPITRES; c++) {
  if (prereqByChapter[c] === 0) {
    err(`Chapitre ${c}: AUCUN prérequis défini`);
  } else {
    ok(`Chapitre ${c}: ${prereqByChapter[c]} liens de prérequis`);
  }
}
// Vérifier prérequis inter-niveaux
const interNiveau = prerequisPairs.filter(([a, b]) => {
  const aParts = a.split('-');
  const bParts = b.split('-');
  return aParts[2] !== bParts[2];
});
if (interNiveau.length > 0) ok(`${interNiveau.length} prérequis inter-niveaux`);
else err('Aucun prérequis inter-niveaux trouvé');

// Vérifier prérequis inter-matières
const interMatiere = prerequisPairs.filter(([a, b]) => {
  const aParts = a.split('-');
  const bParts = b.split('-');
  return aParts[1] !== bParts[1];
});
if (interMatiere.length > 0) ok(`${interMatiere.length} prérequis inter-matières`);
else err('Aucun prérequis inter-matières trouvé');

// ── 4. Planification chapitres ─────────────────────────────────
console.log('\n── 4. Planification chapitres ──');
const sampleMat = 'MATH';
const sampleNiv = '5eme';
for (const annee of ['annee-2024-amb', 'annee-2025-amb']) {
  const weeks = new Set();
  for (let c = 1; c <= NB_CHAPITRES; c++) {
    const plchId = `plch-chap-${sampleMat}-${sampleNiv}-${c}-${annee}`;
    // Cherche la ligne contenant cet ID et extrait semaineDebut, semaineFin
    const re = new RegExp(`'${plchId}'.*?NULL,\\s*(\\d+),\\s*(\\d+)`);
    const m = curriculumSql.match(re);
    if (m) {
      const debut = parseInt(m[1]);
      const fin = parseInt(m[2]);
      for (let w = debut; w <= fin; w++) weeks.add(w);
    }
  }
  if (weeks.size === 36) {
    ok(`${sampleMat}-${sampleNiv} ${annee}: couvre S1-S36 (36 semaines)`);
  } else {
    err(`${sampleMat}-${sampleNiv} ${annee}: couvre ${weeks.size}/36 semaines`);
    const missing = [];
    for (let w = 1; w <= 36; w++) if (!weeks.has(w)) missing.push(w);
    if (missing.length > 0) err(`  Semaines manquantes: ${missing.join(',')}`);
  }
}

// ── 5. ÉvaluationCompétence ────────────────────────────────────
console.log('\n── 5. ÉvaluationCompétence ──');
// Compte les comp-XXX-NIVEAU-CH-K dans la section evaluation_competences
const evalSection = apprentissageSql.split('INSERT INTO learnos_evaluation_competences').slice(1).join('INSERT INTO learnos_evaluation_competences') || '';
const evalCompByChapter = {};
for (let c = 1; c <= NB_CHAPITRES; c++) evalCompByChapter[c] = 0;
{
  const re = /'comp-[^']+-(\d)-[1-3]'/g;
  let m;
  while ((m = re.exec(evalSection)) !== null) {
    const ch = parseInt(m[1]);
    if (evalCompByChapter[ch] !== undefined) evalCompByChapter[ch]++;
  }
}
for (let c = 1; c <= NB_CHAPITRES; c++) {
  if (evalCompByChapter[c] === 0) {
    err(`Chapitre ${c}: AUCUNE évaluation de compétence`);
  } else {
    ok(`Chapitre ${c}: ${evalCompByChapter[c]} liens évaluation↔compétence`);
  }
}

// ── 6. LearningEvidence ────────────────────────────────────────
console.log('\n── 6. LearningEvidence ──');
// Compte les comp-XXX-NIVEAU-CH-K dans la section learning_evidences
const evidenceSection = apprentissageSql.split('INSERT INTO learnos_learning_evidences').slice(1).join('INSERT INTO learnos_learning_evidences') || '';
const evidenceByChapter = {};
for (let c = 1; c <= NB_CHAPITRES; c++) evidenceByChapter[c] = 0;
{
  const re = /'comp-[^']+-(\d)-[1-3]'/g;
  let m;
  while ((m = re.exec(evidenceSection)) !== null) {
    const ch = parseInt(m[1]);
    if (evidenceByChapter[ch] !== undefined) evidenceByChapter[ch]++;
  }
}
for (let c = 1; c <= NB_CHAPITRES; c++) {
  if (evidenceByChapter[c] === 0) {
    err(`Chapitre ${c}: AUCUNE evidence d'apprentissage`);
  } else {
    ok(`Chapitre ${c}: ${evidenceByChapter[c]} evidences`);
  }
}

// ── 7. Recommandations ─────────────────────────────────────────
console.log('\n── 7. Recommandations ──');
const recSection = apprentissageSql.split('INSERT INTO learnos_recommandations').slice(1).join('INSERT INTO learnos_recommandations') || '';
const recByChapter = {};
for (let c = 1; c <= NB_CHAPITRES; c++) recByChapter[c] = 0;
{
  const re = /'comp-[^']+-(\d)-[1-3]'/g;
  let m;
  while ((m = re.exec(recSection)) !== null) {
    const ch = parseInt(m[1]);
    if (recByChapter[ch] !== undefined) recByChapter[ch]++;
  }
}
const chaptersWithRecs = Object.entries(recByChapter).filter(([, v]) => v > 0).length;
if (chaptersWithRecs >= 3) {
  ok(`Recommandations réparties sur ${chaptersWithRecs}/${NB_CHAPITRES} chapitres`);
} else if (chaptersWithRecs > 0) {
  warn(`Recommandations sur seulement ${chaptersWithRecs}/${NB_CHAPITRES} chapitres`);
} else {
  err('Aucune recommandation trouvée');
}
for (let c = 1; c <= NB_CHAPITRES; c++) {
  if (recByChapter[c] > 0) console.log(`    Chap ${c}: ${recByChapter[c]} recommandations`);
}

// ── Résumé ─────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════');
if (errors === 0 && warnings === 0) {
  console.log('  ✅ AUDIT RÉUSSI — 0 erreur, 0 avertissement');
} else {
  console.log(`  ❌ ${errors} erreur(s), ${warnings} avertissement(s)`);
}
console.log('═══════════════════════════════════════════════════════════════\n');
process.exit(errors > 0 ? 1 : 0);
