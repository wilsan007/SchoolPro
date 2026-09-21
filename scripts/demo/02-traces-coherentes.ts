/**
 * Démo Ambouli — étape 2 : rendre les traces d'action cohérentes.
 *
 * LE PROBLÈME
 * Le jeu de données décrit un établissement complet, mais anonyme : les notes
 * n'indiquent pas QUI les a saisies (`saisieParId` vide sur les 89 000 lignes),
 * les appels non plus, et les bulletins portent « Professeur » à la place du
 * nom de l'enseignant. Trois conséquences visibles en démonstration :
 *
 *   • le journal d'activité (`src/lib/activity-feed.ts`) ne montre rien : il
 *     ne retient que les lignes portant un acteur ;
 *   • l'espace enseignant ne peut pas distinguer « mes saisies » du reste ;
 *   • le bulletin imprimé affiche un professeur anonyme sous chaque matière,
 *     alors que l'emploi du temps nomme quelqu'un.
 *
 * LA SOURCE DE VÉRITÉ
 * `AffectationEnseignant` (enseignant × classe × matière) dit qui enseigne
 * quoi, à qui. Tout le reste en découle : l'auteur d'une note est
 * l'enseignant affecté à sa classe et sa matière ; l'auteur d'un appel est le
 * professeur principal de la classe ; le nom porté par le bulletin est celui
 * de l'enseignant affecté. Rien n'est inventé, tout est déduit.
 *
 * IDEMPOTENT : ne réécrit que les lignes encore vides ou divergentes.
 *
 *   pnpm exec tsx scripts/demo/02-traces-coherentes.ts
 *   pnpm exec tsx scripts/demo/02-traces-coherentes.ts --dry-run
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry-run");
const TENANT = "tenant-ambouli";

function log(m: string) {
  console.log(m);
}

async function main() {
  if (DRY) log("=== SIMULATION — aucune écriture ===");

  // --- La table des affectations, lue une fois -----------------------------
  const affectations = await prisma.affectationEnseignant.findMany({
    where: { tenantId: TENANT },
    select: {
      classeId: true,
      matiereId: true,
      enseignant: { select: { id: true, userId: true, user: { select: { name: true } } } },
    },
  });

  /** (classe|matière) → enseignant. Une affectation par couple, par construction. */
  const parCouple = new Map<string, { enseignantId: string; userId: string; nom: string }>();
  for (const a of affectations) {
    parCouple.set(`${a.classeId}|${a.matiereId}`, {
      enseignantId: a.enseignant.id,
      userId: a.enseignant.userId,
      nom: a.enseignant.user?.name ?? "Professeur",
    });
  }
  log(`${parCouple.size} couples classe × matière affectés`);

  // --- 1. L'auteur des notes ----------------------------------------------
  const couplesNotes = await prisma.note.groupBy({
    by: ["classeId", "matiereId"],
    where: { tenantId: TENANT, saisieParId: null },
    _count: { _all: true },
  });

  let notesEcrites = 0;
  let notesOrphelines = 0;
  for (const c of couplesNotes) {
    const prof = parCouple.get(`${c.classeId}|${c.matiereId}`);
    if (!prof) {
      notesOrphelines += c._count._all;
      continue;
    }
    if (!DRY) {
      await prisma.note.updateMany({
        where: { tenantId: TENANT, classeId: c.classeId, matiereId: c.matiereId, saisieParId: null },
        data: { saisieParId: prof.userId },
      });
    }
    notesEcrites += c._count._all;
  }
  log(`notes : ${notesEcrites} attribuées à leur enseignant${notesOrphelines ? `, ${notesOrphelines} sans affectation (laissées telles quelles)` : ""}`);

  // --- 2. L'auteur des appels ---------------------------------------------
  // L'appel est fait par le professeur principal de la classe : c'est lui qui
  // en répond devant la vie scolaire.
  const classes = await prisma.classe.findMany({
    where: { tenantId: TENANT, profPrincipalId: { not: null } },
    select: { id: true, profPrincipal: { select: { userId: true } } },
  });

  let appelsEcrits = 0;
  for (const c of classes) {
    const userId = c.profPrincipal?.userId;
    if (!userId) continue;
    if (DRY) {
      appelsEcrits += await prisma.absence.count({
        where: { tenantId: TENANT, saisieParId: null, eleve: { classeId: c.id } },
      });
      continue;
    }
    const { count } = await prisma.absence.updateMany({
      where: { tenantId: TENANT, saisieParId: null, eleve: { classeId: c.id } },
      data: { saisieParId: userId },
    });
    appelsEcrits += count;
  }
  log(`absences : ${appelsEcrits} attribuées au professeur principal`);

  // --- 3. Le nom porté par le bulletin ------------------------------------
  // `BulletinMatiere.nomProfesseur` est dénormalisé : un bulletin imprimé doit
  // rester lisible même si l'enseignant quitte l'établissement. Il doit donc
  // être écrit, mais il doit dire la vérité — d'où le recalcul depuis les
  // affectations plutôt qu'un « Professeur » générique.
  const lignes = await prisma.bulletinMatiere.findMany({
    where: {
      bulletin: { tenantId: TENANT },
      OR: [{ nomProfesseur: null }, { nomProfesseur: "Professeur" }, { nomProfesseur: "" }],
    },
    select: { id: true, matiereId: true, bulletin: { select: { eleve: { select: { classeId: true } } } } },
    take: 100_000,
  });

  const parNom = new Map<string, string[]>();
  let bulletinsOrphelins = 0;
  for (const l of lignes) {
    const classeId = l.bulletin.eleve.classeId;
    const prof = classeId ? parCouple.get(`${classeId}|${l.matiereId}`) : undefined;
    if (!prof) {
      bulletinsOrphelins++;
      continue;
    }
    const liste = parNom.get(prof.nom) ?? [];
    liste.push(l.id);
    parNom.set(prof.nom, liste);
  }

  let bulletinsEcrits = 0;
  for (const [nom, ids] of parNom) {
    for (let i = 0; i < ids.length; i += 500) {
      const lot = ids.slice(i, i + 500);
      if (!DRY) {
        await prisma.bulletinMatiere.updateMany({ where: { id: { in: lot } }, data: { nomProfesseur: nom } });
      }
      bulletinsEcrits += lot.length;
    }
  }
  log(`bulletins : ${bulletinsEcrits} lignes nommant leur enseignant${bulletinsOrphelins ? `, ${bulletinsOrphelins} sans affectation` : ""}`);

  // --- 4. Les devoirs sans auteur -----------------------------------------
  const devoirsSansProf = await prisma.devoir.groupBy({
    by: ["classeId", "matiereId"],
    where: { tenantId: TENANT, enseignantId: null },
    _count: { _all: true },
  });
  let devoirsEcrits = 0;
  for (const d of devoirsSansProf) {
    const prof = parCouple.get(`${d.classeId}|${d.matiereId}`);
    if (!prof) continue;
    if (!DRY) {
      await prisma.devoir.updateMany({
        where: { tenantId: TENANT, classeId: d.classeId, matiereId: d.matiereId, enseignantId: null },
        data: { enseignantId: prof.enseignantId },
      });
    }
    devoirsEcrits += d._count._all;
  }
  log(`devoirs : ${devoirsEcrits} rattachés à leur enseignant`);

  // --- 5. Les créneaux d'emploi du temps sans enseignant ------------------
  const creneaux = await prisma.emploiTemps.groupBy({
    by: ["classeId", "matiereId"],
    where: { tenantId: TENANT, enseignantId: null },
    _count: { _all: true },
  });
  let creneauxEcrits = 0;
  for (const c of creneaux) {
    const prof = parCouple.get(`${c.classeId}|${c.matiereId}`);
    if (!prof) continue;
    if (!DRY) {
      await prisma.emploiTemps.updateMany({
        where: { tenantId: TENANT, classeId: c.classeId, matiereId: c.matiereId, enseignantId: null },
        data: { enseignantId: prof.enseignantId },
      });
    }
    creneauxEcrits += c._count._all;
  }
  log(`emploi du temps : ${creneauxEcrits} créneaux rattachés à leur enseignant`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
