const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 4 dates + fenêtre d'année scolaire strictement par cohorte
const DATES = [
  { label: '2024-11-15 (T1 N-1)', date: new Date('2024-11-15'), start: new Date('2024-09-01'), end: new Date('2025-07-31'), cohort: '2024' },
  { label: '2025-03-15 (T2 N-1)', date: new Date('2025-03-15'), start: new Date('2024-09-01'), end: new Date('2025-07-31'), cohort: '2024' },
  { label: '2025-11-15 (T1 N)',   date: new Date('2025-11-15'), start: new Date('2025-09-01'), end: new Date('2026-07-31'), cohort: '2025' },
  { label: '2026-03-15 (T2 N)',   date: new Date('2026-03-15'), start: new Date('2025-09-01'), end: new Date('2026-07-31'), cohort: '2025' },
];

const TENANT = 'tenant-ambouli';

// Compte strictement dans la fenêtre de l'année scolaire de la cohorte
async function countInWindow(model, dateField, simDate, start, end, extraWhere = {}) {
  return prisma[model].count({
    where: {
      ...extraWhere,
      [dateField]: {
        gte: start,
        lte: simDate, // seulement ce qui est visible à la date simulée
      },
    },
  });
}

async function avgInWindow(model, valueField, dateField, simDate, start, extraWhere = {}) {
  const result = await prisma[model].aggregate({
    where: {
      ...extraWhere,
      [dateField]: { gte: start, lte: simDate },
    },
    _avg: { [valueField]: true },
    _count: true,
  });
  return { avg: result._avg[valueField], count: result._count };
}

async function main() {
  const colW = 22;
  const header = 'Indicateur'.padEnd(40) + DATES.map(d => d.label.padEnd(colW)).join('');

  console.log('\n' + '═'.repeat(120));
  console.log('DONNÉES VISIBLES PAR COHORTE (filtrage strict année scolaire en cours)');
  console.log('═'.repeat(120) + '\n');
  console.log(header);
  console.log('─'.repeat(header.length));

  // ── Vie scolaire ──
  const indicators = [
    { label: 'Évaluations réalisées',     model: 'evaluation',        dateField: 'date',      where: { tenantId: TENANT } },
    { label: 'Notes saisies',             model: 'note',              dateField: 'date',      where: { tenantId: TENANT } },
    { label: 'Absences enregistrées',     model: 'absence',           dateField: 'date',      where: { tenantId: TENANT } },
    { label: 'Incidents signalés',        model: 'incident',          dateField: 'date',      where: { tenantId: TENANT } },
    { label: 'Passages infirmerie',       model: 'passageInfirmerie', dateField: 'date',      where: { tenantId: TENANT } },
    { label: 'Entretiens conseiller',     model: 'entretienConseiller', dateField: 'date',    where: { tenantId: TENANT } },
    { label: 'Devoirs donnés',            model: 'devoir',            dateField: 'dateDonne', where: { tenantId: TENANT } },
    { label: 'Absences personnel',        model: 'absencePersonnel',  dateField: 'date',      where: { tenantId: TENANT } },
    { label: 'Congés personnel',          model: 'congePersonnel',    dateField: 'dateDebut', where: { tenantId: TENANT } },
    { label: 'Remplacements cours',       model: 'remplacementCours', dateField: 'date',      where: { tenantId: TENANT } },
    { label: 'Événements planifiés',      model: 'evenement',         dateField: 'dateDebut', where: { tenantId: TENANT } },
    { label: 'Tâches (échéance)',         model: 'tache',             dateField: 'echeance',  where: { tenantId: TENANT } },
    { label: 'Relances envoyées',         model: 'relance',           dateField: 'envoyeeLe', where: { tenantId: TENANT } },
    { label: 'Factures émises',           model: 'facture',           dateField: 'createdAt', where: { tenantId: TENANT } },
  ];

  const allCounts = {};
  for (const ind of indicators) {
    try {
      const counts = [];
      for (const d of DATES) {
        const c = await countInWindow(ind.model, ind.dateField, d.date, d.start, d.end, ind.where);
        counts.push(c);
      }
      allCounts[ind.label] = counts;
      console.log(ind.label.padEnd(40) + counts.map(c => String(c).padEnd(colW)).join(''));
    } catch (e) {
      console.log(ind.label.padEnd(40) + DATES.map(() => 'ERR'.padEnd(colW)).join(''));
    }
  }

  // ── LEARNOS ──
  console.log('\n' + '─'.repeat(header.length));
  console.log('WORKFLOW LEARNOS'.padEnd(40));
  console.log('─'.repeat(header.length));

  const learnosIndicators = [
    { label: 'Learning evidences',         model: 'learningEvidence',       dateField: 'occurredAt',  where: { tenantId: TENANT } },
    { label: 'Profils apprentissage',      model: 'studentLearningProfile', dateField: 'computedAt',  where: { tenantId: TENANT } },
    { label: 'Prédictions difficulté',     model: 'predictionDifficulte',   dateField: 'emiseLe',     where: { tenantId: TENANT } },
    { label: 'Interventions',              model: 'studentIntervention',    dateField: 'startDate',   where: { tenantId: TENANT } },
    { label: 'Plans progression',          model: 'planProgression',        dateField: 'dateDebut',   where: { tenantId: TENANT } },
    { label: 'Alertes parent',             model: 'alerteParent',           dateField: 'envoyeeLe',   where: { tenantId: TENANT } },
    { label: 'Échanges parent',            model: 'echangeParent',          dateField: 'createdAt',   where: { tenantId: TENANT } },
    { label: 'Réponses exercices',         model: 'exerciceReponse',        dateField: 'repondueLe',  where: {} },
    { label: 'Journal apprentissage',      model: 'journalApprentissage',   dateField: 'createdAt',   where: { tenantId: TENANT } },
    { label: 'KPI snapshots',              model: 'kpiSnapshot',            dateField: 'createdAt',   where: { tenantId: TENANT } },
  ];

  for (const ind of learnosIndicators) {
    try {
      const counts = [];
      for (const d of DATES) {
        const c = await countInWindow(ind.model, ind.dateField, d.date, d.start, d.end, ind.where);
        counts.push(c);
      }
      allCounts[ind.label] = counts;
      console.log(ind.label.padEnd(40) + counts.map(c => String(c).padEnd(colW)).join(''));
    } catch (e) {
      console.log(ind.label.padEnd(40) + DATES.map(() => 'ERR'.padEnd(colW)).join(''));
    }
  }

  // ── KPI Director Intelligence (6 KPIs) ──
  console.log('\n' + '═'.repeat(120));
  console.log('KPI INTELLIGENCE DIRECTEUR — 6 INDICATEURS À 4 DATES');
  console.log('═'.repeat(120) + '\n');
  console.log('Indicateur'.padEnd(40) + DATES.map(d => d.label.padEnd(colW)).join(''));
  console.log('─'.repeat(header.length));

  // KPI 1: Évaluations réalisées (année en cours seulement)
  const evalCounts = [];
  for (const d of DATES) {
    evalCounts.push(await countInWindow('evaluation', 'date', d.date, d.start, d.end, { tenantId: TENANT }));
  }
  console.log('1. Évaluations (année en cours)'.padEnd(40) + evalCounts.map(c => String(c).padEnd(colW)).join(''));

  // KPI 2: Moyenne générale (année en cours seulement)
  const avgResults = [];
  for (const d of DATES) {
    const r = await avgInWindow('note', 'valeur', 'date', d.date, d.start, { tenantId: TENANT });
    avgResults.push(r.count > 0 ? r.avg.toFixed(2) : 'N/A');
  }
  console.log('2. Moyenne générale (/20)'.padEnd(40) + avgResults.map(v => String(v).padEnd(colW)).join(''));

  // KPI 3: Taux d'absentéisme (absences / élèves inscrits)
  const absCounts = [];
  const totalEleves = await prisma.eleve.count({ where: { tenantId: TENANT } });
  for (const d of DATES) {
    const c = await countInWindow('absence', 'date', d.date, d.start, d.end, { tenantId: TENANT });
    absCounts.push(c);
  }
  const absRates = absCounts.map(c => (c / totalEleves).toFixed(2));
  console.log('3. Absences/élève (année en cours)'.padEnd(40) + absRates.map(v => String(v).padEnd(colW)).join(''));

  // KPI 4: Incidents vie scolaire (année en cours)
  const incCounts = [];
  for (const d of DATES) {
    incCounts.push(await countInWindow('incident', 'date', d.date, d.start, d.end, { tenantId: TENANT }));
  }
  console.log('4. Incidents (année en cours)'.padEnd(40) + incCounts.map(c => String(c).padEnd(colW)).join(''));

  // KPI 5: Evidences LEARNOS (année en cours)
  const evCounts = [];
  for (const d of DATES) {
    evCounts.push(await countInWindow('learningEvidence', 'occurredAt', d.date, d.start, d.end, { tenantId: TENANT }));
  }
  console.log('5. Evidences apprentissage'.padEnd(40) + evCounts.map(c => String(c).padEnd(colW)).join(''));

  // KPI 6: Interventions pédagogiques (année en cours)
  const ivCounts = [];
  for (const d of DATES) {
    ivCounts.push(await countInWindow('studentIntervention', 'startDate', d.date, d.start, d.end, { tenantId: TENANT }));
  }
  console.log('6. Interventions pédagogiques'.padEnd(40) + ivCounts.map(c => String(c).padEnd(colW)).join(''));

  // ── Curriculum ──
  console.log('\n' + '═'.repeat(120));
  console.log('CURRICULUM & PLANIFICATION');
  console.log('═'.repeat(120) + '\n');
  console.log('Indicateur'.padEnd(40) + DATES.map(d => d.label.padEnd(colW)).join(''));
  console.log('─'.repeat(header.length));

  // Chapitres planification par statut
  for (const statut of ['TRAITE', 'EN_COURS', 'PREVU']) {
    const counts = [];
    for (const d of DATES) {
      if (statut === 'TRAITE') {
        counts.push(await prisma.planificationChapitre.count({
          where: { statut, traiteLe: { gte: d.start, lte: d.date } },
        }));
      } else {
        counts.push(await prisma.planificationChapitre.count({ where: { statut } }));
      }
    }
    console.log(`  Chapitres ${statut}`.padEnd(40) + counts.map(c => String(c).padEnd(colW)).join(''));
  }

  // ── Delta ──
  console.log('\n' + '═'.repeat(120));
  console.log('ÉVOLUTION (DELTA) — STRICTEMENT PAR COHORTE');
  console.log('═'.repeat(120) + '\n');
  console.log('Indicateur'.padEnd(30) + 'T1→T2 N-1'.padEnd(18) + 'T2 N-1→T1 N'.padEnd(18) + 'T1→T2 N'.padEnd(18));
  console.log('─'.repeat(84));

  const deltaModels = [
    { label: 'Évaluations', counts: evalCounts },
    { label: 'Absences', counts: absCounts },
    { label: 'Incidents', counts: incCounts },
    { label: 'Evidences', counts: evCounts },
    { label: 'Interventions', counts: ivCounts },
  ];
  for (const d of deltaModels) {
    const d1 = d.counts[1] - d.counts[0];
    const d2 = d.counts[2] - d.counts[1];
    const d3 = d.counts[3] - d.counts[2];
    console.log(d.label.padEnd(30) + `+${d1}`.padEnd(18) + `+${d2}`.padEnd(18) + `+${d3}`.padEnd(18));
  }

  console.log('\n' + '═'.repeat(120));
  console.log('FIN');
  console.log('═'.repeat(120));
}

main().catch(console.error).finally(() => prisma.$disconnect());
