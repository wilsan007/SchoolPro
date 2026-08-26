import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tenantId = 'tenant-ambouli';
  const anneeLibelle = '2025-2026';

  // 1. Update seances that coincide with evaluations to have content
  const evals = await prisma.evaluation.findMany({
    where: { tenantId, classe: { annee: anneeLibelle } },
    select: { id: true, classeId: true, matiereId: true, date: true, titre: true },
  });
  console.log(`Evaluations à lier: ${evals.length}`);

  let evalLinked = 0;
  for (const e of evals) {
    const dateStr = e.date.toISOString().slice(0, 10);
    const result = await prisma.seancePedagogique.updateMany({
      where: {
        tenantId,
        classeId: e.classeId,
        matiereId: e.matiereId,
        date: { gte: new Date(`${dateStr}T00:00:00`), lt: new Date(`${dateStr}T23:59:59`) },
      },
      data: {
        contenu: `Évaluation: ${e.titre}`,
      },
    });
    evalLinked += result.count;
  }
  console.log(`Séances avec contenu évaluation: ${evalLinked}`);

  // 2. Link remaining devoirs by finding the seance on dateDonne
  const devoirs = await prisma.devoir.findMany({
    where: { tenantId, seanceId: null, classe: { annee: anneeLibelle } },
    select: { id: true, classeId: true, matiereId: true, dateDonne: true },
  });
  console.log(`\nDevoirs non liés restants: ${devoirs.length}`);

  let devoirsLinked = 0;
  for (const d of devoirs) {
    const dateStr = d.dateDonne.toISOString().slice(0, 10);
    const seance = await prisma.seancePedagogique.findFirst({
      where: {
        tenantId,
        classeId: d.classeId,
        matiereId: d.matiereId,
        date: { gte: new Date(`${dateStr}T00:00:00`), lt: new Date(`${dateStr}T23:59:59`) },
      },
      select: { id: true },
    });
    if (seance) {
      await prisma.devoir.update({ where: { id: d.id }, data: { seanceId: seance.id } });
      devoirsLinked++;
    }
  }
  console.log(`Devoirs supplémentaires liés: ${devoirsLinked}`);

  // 3. Generate PLANIFIEE seances for the week AFTER the demo date (March 17-23)
  // This shows upcoming classes in the cahier-journal
  const emplois = await prisma.emploiTemps.findMany({
    where: { tenantId, annee: anneeLibelle },
    select: { id: true, classeId: true, matiereId: true, enseignantId: true, jour: true, heureDebut: true, heureFin: true, salle: true },
  });

  const classes = await prisma.classe.findMany({
    where: { tenantId, annee: anneeLibelle },
    select: { id: true, niveau: true, siteId: true },
  });
  const classMap = new Map(classes.map(c => [c.id, c]));

  const JOUR_TO_DOW = { DIMANCHE: 0, LUNDI: 1, MARDI: 2, MERCREDI: 3, JEUDI: 4, VENDREDI: 5, SAMEDI: 6 };

  // Generate for March 17-23 (week after demo date)
  const weekStart = new Date('2026-03-17');
  const weekEnd = new Date('2026-03-23');

  const planifs = await prisma.planificationChapitre.findMany({
    where: { tenantId, anneeId: 'annee-2025-amb' },
    include: { chapitre: { select: { id: true, matiereId: true, niveau: true, nom: true } } },
  });
  const planifByNiveauMatiere = {};
  for (const p of planifs) {
    if (!p.classeId && p.chapitre) {
      const key = `${p.chapitre.niveau}-${p.chapitre.matiereId}`;
      if (!planifByNiveauMatiere[key]) planifByNiveauMatiere[key] = [];
      planifByNiveauMatiere[key].push(p);
    }
  }

  function semaineScolaire(date, debut) {
    const diff = Math.floor((date - debut) / (1000 * 60 * 60 * 24 * 7));
    return Math.max(1, diff + 1);
  }

  function heureToMinutes(h) {
    const [h2, m] = h.split(':').map(Number);
    return h2 * 60 + m;
  }

  const planifiees = [];
  for (const emploi of emplois) {
    const classe = classMap.get(emploi.classeId);
    if (!classe) continue;
    const dow = JOUR_TO_DOW[emploi.jour];
    if (dow === undefined) continue;

    // Find the date in the week March 17-23 that matches this jour
    const date = new Date(weekStart);
    while (date.getDay() !== dow && date <= weekEnd) {
      date.setDate(date.getDate() + 1);
    }
    if (date > weekEnd) continue;

    const dateStr = date.toISOString().slice(0, 10);
    const semaine = semaineScolaire(date, new Date('2025-09-15'));

    const [h, m] = emploi.heureDebut.split(':').map(Number);
    const seanceDate = new Date(date);
    seanceDate.setHours(h, m, 0, 0);
    const dureePrevue = heureToMinutes(emploi.heureFin) - heureToMinutes(emploi.heureDebut);

    const niveauMatiereKey = `${classe.niveau}-${emploi.matiereId}`;
    const planifsNiveau = planifByNiveauMatiere[niveauMatiereKey] || [];
    const planif = planifsNiveau.find(p => semaine >= p.semaineDebut && semaine <= p.semaineFin);

    const seanceId = `seance-${tenantId}-${dateStr}-${emploi.classeId}-${emploi.matiereId}-${emploi.heureDebut.replace(':', '')}`;

    planifiees.push({
      id: seanceId,
      tenantId,
      siteId: classe.siteId,
      classeId: emploi.classeId,
      matiereId: emploi.matiereId,
      enseignantId: emploi.enseignantId,
      chapitreId: planif?.chapitreId ?? null,
      planificationId: planif?.id ?? null,
      date: seanceDate,
      dureePrevue,
      dureeReelle: null,
      statut: 'PLANIFIEE',
      semaine,
      contenu: null,
      rythme: 'NON_EVALUEE',
      presents: null,
      absents: null,
    });
  }

  console.log(`\nSéances PLANIFIEES (semaine 17-23 mars): ${planifiees.length}`);
  await prisma.seancePedagogique.createMany({ data: planifiees, skipDuplicates: true });
  console.log(`Insérées`);

  // 4. Final verification
  const total = await prisma.seancePedagogique.count({
    where: { tenantId, classe: { annee: anneeLibelle } },
  });
  console.log(`\n=== FINAL ===`);
  console.log(`Total séances: ${total}`);

  const byStatut = await prisma.seancePedagogique.groupBy({
    by: ['statut'],
    where: { tenantId, classe: { annee: anneeLibelle } },
    _count: true,
  });
  for (const s of byStatut) console.log(`  ${s.statut}: ${s._count}`);

  const withContenu = await prisma.seancePedagogique.count({
    where: { tenantId, classe: { annee: anneeLibelle }, contenu: { not: null } },
  });
  console.log(`  Avec contenu: ${withContenu}`);

  const withPlanif = await prisma.seancePedagogique.count({
    where: { tenantId, classe: { annee: anneeLibelle }, planificationId: { not: null } },
  });
  console.log(`  Avec planification: ${withPlanif}`);

  const devoirsWithSeance = await prisma.devoir.count({
    where: { tenantId, seanceId: { not: null } },
  });
  console.log(`  Devoirs liés à séance: ${devoirsWithSeance}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
