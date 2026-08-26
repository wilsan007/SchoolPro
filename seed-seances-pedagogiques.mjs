import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const TENANT_ID = 'tenant-ambouli';
const ANNEE_LIBELLE = '2025-2026';
const ANNEE_ID = 'annee-2025-amb';
const DATE_DEBUT = new Date('2025-09-15');
const DATE_FIN = new Date('2026-07-15');
const DATE_LIMITE = new Date('2026-03-16'); // Date de la démo

// Jour enum → day of week (0=Sunday)
const JOUR_TO_DOW = {
  DIMANCHE: 0, LUNDI: 1, MARDI: 2, MERCREDI: 3, JEUDI: 4, VENDREDI: 5, SAMEDI: 6,
};

// Vacation periods (inclusive)
const VACANCES = [
  { debut: new Date('2025-10-27'), fin: new Date('2025-11-02') },
  { debut: new Date('2025-12-20'), fin: new Date('2026-01-04') },
  { debut: new Date('2026-03-28'), fin: new Date('2026-04-05') },
];

// Exam periods (skip - no regular classes)
const EXAMENS = [
  { debut: new Date('2025-12-08'), fin: new Date('2025-12-12') },
  { debut: new Date('2026-03-23'), fin: new Date('2026-03-27') },
];

function isVacance(date) {
  return VACANCES.some(v => date >= v.debut && date <= v.fin);
}
function isExamen(date) {
  return EXAMENS.some(e => date >= e.debut && date <= e.fin);
}

// Calculate school week number (1-based) from year start
function semaineScolaire(date, debut) {
  const diff = Math.floor((date - debut) / (1000 * 60 * 60 * 24 * 7));
  return Math.max(1, diff + 1);
}

// Parse "08:00" → minutes from midnight
function heureToMinutes(h) {
  const [h2, m] = h.split(':').map(Number);
  return h2 * 60 + m;
}

async function main() {
  console.log('=== Génération des séances pédagogiques ===');
  console.log(`Tenant: ${TENANT_ID}, Année: ${ANNEE_LIBELLE}`);
  console.log(`Période: ${DATE_DEBUT.toISOString().slice(0,10)} → ${DATE_LIMITE.toISOString().slice(0,10)}`);

  // 1. Load all emplois du temps
  const emplois = await prisma.emploiTemps.findMany({
    where: { tenantId: TENANT_ID, annee: ANNEE_LIBELLE },
    select: { id: true, classeId: true, matiereId: true, enseignantId: true, jour: true, heureDebut: true, heureFin: true, salle: true },
  });
  console.log(`Emplois du temps: ${emplois.length}`);

  // 2. Load classes with niveau and siteId
  const classes = await prisma.classe.findMany({
    where: { tenantId: TENANT_ID, annee: ANNEE_LIBELLE },
    select: { id: true, nom: true, niveau: true, siteId: true },
  });
  const classMap = new Map(classes.map(c => [c.id, c]));
  console.log(`Classes: ${classes.length}`);

  // 3. Load planifications with chapitre info
  const planifs = await prisma.planificationChapitre.findMany({
    where: { tenantId: TENANT_ID, anneeId: ANNEE_ID },
    include: { chapitre: { select: { id: true, matiereId: true, niveau: true, nom: true } } },
  });
  console.log(`Planifications: ${planifs.length}`);

  // Map: classeId+matiereId → planifs sorted by semaineDebut
  // But planifs are by chapitre (not by classe), so we need to match by niveau
  // Planif without classeId = applies to all classes of that niveau
  const planifByNiveauMatiere = {};
  for (const p of planifs) {
    if (!p.classeId && p.chapitre) {
      const key = `${p.chapitre.niveau}-${p.chapitre.matiereId}`;
      if (!planifByNiveauMatiere[key]) planifByNiveauMatiere[key] = [];
      planifByNiveauMatiere[key].push(p);
    }
  }
  // Also planifs with classeId
  const planifByClasseMatiere = {};
  for (const p of planifs) {
    if (p.classeId) {
      const key = `${p.classeId}-${p.chapitre?.matiereId}`;
      if (!planifByClasseMatiere[key]) planifByClasseMatiere[key] = [];
      planifByClasseMatiere[key].push(p);
    }
  }
  console.log(`Planif par niveau+matiere: ${Object.keys(planifByNiveauMatiere).length}`);
  console.log(`Planif par classe+matiere: ${Object.keys(planifByClasseMatiere).length}`);

  // 4. Load devoirs to link seances
  const devoirs = await prisma.devoir.findMany({
    where: { tenantId: TENANT_ID, classe: { annee: ANNEE_LIBELLE } },
    select: { id: true, classeId: true, matiereId: true, dateDonne: true, titre: true },
  });
  console.log(`Devoirs: ${devoirs.length}`);

  // Map: classeId+matiereId+dateStr → devoirs
  const devoirMap = new Map();
  for (const d of devoirs) {
    const dateStr = d.dateDonne.toISOString().slice(0, 10);
    const key = `${d.classeId}-${d.matiereId}-${dateStr}`;
    if (!devoirMap.has(key)) devoirMap.set(key, []);
    devoirMap.get(key).push(d);
  }

  // 5. Load evaluations to set content
  const evals = await prisma.evaluation.findMany({
    where: { tenantId: TENANT_ID, classe: { annee: ANNEE_LIBELLE } },
    select: { id: true, classeId: true, matiereId: true, date: true, titre: true, statut: true },
  });
  console.log(`Evaluations: ${evals.length}`);

  // Map: classeId+matiereId+dateStr → evals
  const evalMap = new Map();
  for (const e of evals) {
    const dateStr = e.date.toISOString().slice(0, 10);
    const key = `${e.classeId}-${e.matiereId}-${dateStr}`;
    if (!evalMap.has(key)) evalMap.set(key, []);
    evalMap.get(key).push(e);
  }

  // 6. Generate seances
  const seances = [];
  const seanceCompetences = [];
  let seanceIdCounter = 0;

  // For each emploi slot, generate seances for each week
  for (const emploi of emplois) {
    const classe = classMap.get(emploi.classeId);
    if (!classe) continue;

    const dow = JOUR_TO_DOW[emploi.jour];
    if (dow === undefined) continue;

    // Find all dates for this day-of-week from year start to demo date
    let currentDate = new Date(DATE_DEBUT);
    currentDate.setHours(0, 0, 0, 0);

    // Advance to first occurrence of this day-of-week
    while (currentDate.getDay() !== dow) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Generate one seance per occurrence
    while (currentDate <= DATE_LIMITE) {
      // Skip vacations and exam periods
      if (isVacance(currentDate) || isExamen(currentDate)) {
        currentDate.setDate(currentDate.getDate() + 7);
        continue;
      }

      // Skip if before year start
      if (currentDate < DATE_DEBUT) {
        currentDate.setDate(currentDate.getDate() + 7);
        continue;
      }

      const dateStr = currentDate.toISOString().slice(0, 10);
      const semaine = semaineScolaire(currentDate, DATE_DEBUT);

      // Determine status: EFFECTUEE if past, PLANIFIEE if future
      const isPast = currentDate < DATE_LIMITE;
      const statut = isPast ? 'EFFECTUEE' : 'PLANIFIEE';

      // Find planification for this week
      const niveauMatiereKey = `${classe.niveau}-${emploi.matiereId}`;
      const classeMatiereKey = `${emploi.classeId}-${emploi.matiereId}`;
      
      const planifsNiveau = planifByNiveauMatiere[niveauMatiereKey] || [];
      const planifsClasse = planifByClasseMatiere[classeMatiereKey] || [];
      const allPlanifs = [...planifsNiveau, ...planifsClasse];
      
      const planif = allPlanifs.find(p => 
        semaine >= p.semaineDebut && semaine <= p.semaineFin
      );

      // Check for devoirs on this date
      const devoirKey = `${emploi.classeId}-${emploi.matiereId}-${dateStr}`;
      const devoirsDuJour = devoirMap.get(devoirKey) || [];

      // Check for evaluations on this date
      const evalKey = `${emploi.classeId}-${emploi.matiereId}-${dateStr}`;
      const evalsDuJour = evalMap.get(evalKey) || [];

      // Build seance date with time
      const [h, m] = emploi.heureDebut.split(':').map(Number);
      const seanceDate = new Date(currentDate);
      seanceDate.setHours(h, m, 0, 0);

      const dureePrevue = heureToMinutes(emploi.heureFin) - heureToMinutes(emploi.heureDebut);

      // Determine content based on planification
      let contenu = null;
      let rythme = 'NON_EVALUEE';
      let presents = null;
      let absents = null;
      let planificationId = null;
      let chapitreId = null;

      if (planif) {
        planificationId = planif.id;
        chapitreId = planif.chapitreId;
        
        if (isPast) {
          // Content based on chapter and week
          const chapNom = planif.chapitre?.nom || 'Chapitre';
          contenu = `Séance sur ${chapNom} - semaine ${semaine}`;
          
          // Rythme based on planif status
          if (planif.statut === 'TRAITE') {
            rythme = 'A_TEMPS';
          } else if (planif.statut === 'EN_COURS') {
            rythme = Math.random() > 0.7 ? 'EN_RETARD' : 'A_TEMPS';
          } else if (planif.statut === 'PREVU') {
            rythme = Math.random() > 0.5 ? 'EN_RETARD' : 'A_TEMPS';
          }
          
          // Random presence (most students present)
          const effectif = 28; // average class size
          const absent = Math.floor(Math.random() * 4);
          presents = effectif - absent;
          absents = absent;
        }
      }

      // If evaluation on this date, note it in content
      if (evalsDuJour.length > 0 && isPast) {
        contenu = `Évaluation: ${evalsDuJour[0].titre}`;
        presents = 28 - Math.floor(Math.random() * 2);
        absents = 28 - presents;
      }

      // Generate ID
      const seanceId = `seance-${TENANT_ID}-${dateStr}-${emploi.classeId}-${emploi.matiereId}-${emploi.heureDebut.replace(':', '')}`;
      seanceIdCounter++;

      seances.push({
        id: seanceId,
        tenantId: TENANT_ID,
        siteId: classe.siteId,
        classeId: emploi.classeId,
        matiereId: emploi.matiereId,
        enseignantId: emploi.enseignantId,
        chapitreId,
        planificationId,
        date: seanceDate,
        dureePrevue,
        dureeReelle: isPast ? dureePrevue : null,
        statut,
        semaine,
        contenu,
        rythme,
        presents,
        absents,
        objectifs: isPast && planif ? JSON.stringify([`Objectif: ${planif.chapitre?.nom || 'Cours'}`]) : null,
        activites: isPast ? JSON.stringify([
          { nom: 'Cours magistral', duree: Math.floor(dureePrevue * 0.4), type: 'magistral' },
          { nom: 'Exercices', duree: Math.floor(dureePrevue * 0.4), type: 'pratique' },
          { nom: 'Synthèse', duree: Math.floor(dureePrevue * 0.2), type: 'synthese' },
        ]) : null,
      });

      // Link devoirs to this seance (update later)
      for (const d of devoirsDuJour) {
        d._seanceId = seanceId;
      }

      currentDate.setDate(currentDate.getDate() + 7);
    }
  }

  console.log(`\nSéances générées: ${seances.length}`);
  console.log(`  EFFECTUEE: ${seances.filter(s => s.statut === 'EFFECTUEE').length}`);
  console.log(`  PLANIFIEE: ${seances.filter(s => s.statut === 'PLANIFIEE').length}`);
  console.log(`  Avec planification: ${seances.filter(s => s.planificationId).length}`);
  console.log(`  Avec contenu: ${seances.filter(s => s.contenu).length}`);

  // 7. Insert seances in batches
  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < seances.length; i += BATCH_SIZE) {
    const batch = seances.slice(i, i + BATCH_SIZE);
    await prisma.seancePedagogique.createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += batch.length;
    console.log(`  Inserté: ${inserted}/${seances.length}`);
  }

  // 8. Link devoirs to their seances
  let devoirsLinked = 0;
  for (const d of devoirs) {
    if (d._seanceId) {
      await prisma.devoir.update({
        where: { id: d.id },
        data: { seanceId: d._seanceId },
      });
      devoirsLinked++;
    }
  }
  console.log(`\nDevoirs liés à une séance: ${devoirsLinked}`);

  // 9. Verify
  const total = await prisma.seancePedagogique.count({
    where: { tenantId: TENANT_ID, classe: { annee: ANNEE_LIBELLE } },
  });
  console.log(`\n=== VÉRIFICATION ===`);
  console.log(`Total séances en base: ${total}`);

  const byStatut = await prisma.seancePedagogique.groupBy({
    by: ['statut'],
    where: { tenantId: TENANT_ID, classe: { annee: ANNEE_LIBELLE } },
    _count: true,
  });
  for (const s of byStatut) {
    console.log(`  ${s.statut}: ${s._count}`);
  }

  const byMois = await prisma.seancePedagogique.groupBy({
    by: ['semaine'],
    where: { tenantId: TENANT_ID, classe: { annee: ANNEE_LIBELLE }, date: { gte: new Date('2026-03-01'), lt: new Date('2026-04-01') } },
    _count: true,
  });
  console.log(`  Séances en mars 2026: ${byMois.reduce((a, b) => a + b._count, 0)}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
