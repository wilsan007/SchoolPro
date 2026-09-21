/**
 * Démo Ambouli — étape 1 : les personas du compte de démonstration.
 *
 * POURQUOI CE SCRIPT EXISTE
 * La démonstration se fait avec UN SEUL compte — `admin@cite-ambouli.dj` —
 * qui bascule de rôle (RoleSwitcher) pour montrer l'application vue par un
 * enseignant, un parent, un élève. Or les espaces `/mon-espace`, `/ma-classe`,
 * `/parent` et `/eleve` ne se résolvent pas par le rôle mais par le LIEN
 * RELATIONNEL du compte connecté : enseignant rattaché au `userId`, parent
 * rattaché au `userId`, élève rattaché au `userId`. Tant que ces liens
 * pointent sur des fiches vides, la bascule de rôle ouvre des écrans vides —
 * quel que soit le nombre de données dans l'établissement.
 *
 * CE QU'IL FAIT
 * Il branche le compte de démonstration sur des fiches DÉJÀ PLEINES du jeu de
 * données, plutôt que de fabriquer des données parallèles :
 *
 *   1. Enseignant — le compte prend la place de `ens-ambouli-1` (Ali Waberi),
 *      professeur de mathématiques : 18 classes par année, emploi du temps,
 *      devoirs, séances, et professeur principal de la 2nde D sur les trois
 *      années. L'ancienne fiche « coquille » du compte admin est rendue au
 *      professeur déplacé pour qu'aucun compte ne reste sans fiche.
 *
 *   2. Famille — deux élèves de cette 2nde D deviennent ses enfants : un
 *      élève fort (≈17,8 de moyenne) et une élève en difficulté (≈6,0, douze
 *      absences, deux incidents, une facture impayée, une recommandation
 *      LEARNOS). Même classe, même professeur : la démonstration peut montrer
 *      côte à côte les deux trajectoires dans l'écran de l'enseignant, puis
 *      les mêmes enfants dans l'espace parent.
 *
 *   3. Continuité d'année — les cohortes du jeu de données sont disjointes
 *      (les élèves de 2026-2027 sont d'autres personnes). Deux fiches de la
 *      cohorte 2026-2027 reçoivent donc l'IDENTITÉ des deux enfants : l'élève
 *      fort passe en 1ère S, l'élève en difficulté redouble la 2nde D. La
 *      famille existe alors à toutes les dates de la Time Machine, et le
 *      redoublement donne un visage à l'analyse de cohortes.
 *
 * IDEMPOTENT : rejouable autant de fois que nécessaire, il converge vers le
 * même état et n'écrit que ce qui diffère.
 *
 *   pnpm exec tsx scripts/demo/01-personas.ts
 *   pnpm exec tsx scripts/demo/01-personas.ts --dry-run
 */

import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry-run");

const TENANT = "tenant-ambouli";
const ADMIN_EMAIL = "admin@cite-ambouli.dj";

/** Fiche enseignant reprise par le compte de démonstration. */
const ENSEIGNANT_CIBLE = "ens-ambouli-1";

/** Les deux enfants, dans la cohorte 2025-2026 (classe `2nde D` Ambouli). */
const ENFANT_FORT_2025 = "ele-ambouli-2025-0445"; // Ragueh Omar — 17,75
const ENFANT_FRAGILE_2025 = "ele-ambouli-2025-0421"; // Deqa Yacin — 6,04

/** Nom de famille donné aux deux enfants — celui du compte de démonstration. */
const NOM_FAMILLE = "Mahamoud";

/** Où chacun se retrouve en 2026-2027 (cohorte suivante). */
const CLASSE_FORT_2026 = "cls-ambouli-2026-1ere-S"; // passage
const CLASSE_FRAGILE_2026 = "cls-ambouli-2026-2nde-D"; // redoublement

const journal: string[] = [];
function note(message: string) {
  journal.push(message);
  console.log(message);
}

async function ecrire<T>(libelle: string, action: () => Promise<T>): Promise<T | null> {
  if (DRY) {
    note(`[simulation] ${libelle}`);
    return null;
  }
  const resultat = await action();
  note(`✓ ${libelle}`);
  return resultat;
}

// ------------------------------------------------------------------
// 1. L'enseignant
// ------------------------------------------------------------------

async function brancherEnseignant(adminUserId: string) {
  const cible = await prisma.enseignant.findUnique({
    where: { id: ENSEIGNANT_CIBLE },
    select: { id: true, userId: true, user: { select: { id: true, name: true } } },
  });
  if (!cible) throw new Error(`Enseignant ${ENSEIGNANT_CIBLE} introuvable`);

  const ancienUserId = cible.userId;
  if (ancienUserId === adminUserId) {
    note(`· enseignant ${ENSEIGNANT_CIBLE} déjà rattaché au compte de démonstration`);
  } else {
    // Les fiches « coquilles » du compte admin (créées par des scripts
    // antérieurs) sont d'abord libérées, sinon le compte porterait deux
    // fiches enseignant et `findFirst` en choisirait une au hasard.
    const coquilles = await prisma.enseignant.findMany({
      where: { userId: adminUserId, id: { not: ENSEIGNANT_CIBLE } },
      select: { id: true },
    });

    for (const coquille of coquilles) {
      // Son service incohérent (matières hors spécialité, créneaux en double)
      // est supprimé : il ferait apparaître deux professeurs sur les mêmes
      // heures dans l'emploi du temps.
      await ecrire(
        `service de la fiche coquille ${coquille.id} supprimé`,
        async () => {
          await prisma.affectationEnseignant.deleteMany({ where: { enseignantId: coquille.id } });
          await prisma.emploiTemps.updateMany({
            where: { enseignantId: coquille.id },
            data: { enseignantId: null },
          });
        },
      );
      // La coquille revient au professeur déplacé : son compte garde une fiche.
      await ecrire(
        `fiche coquille ${coquille.id} rendue à ${ancienUserId}`,
        () => prisma.enseignant.update({ where: { id: coquille.id }, data: { userId: ancienUserId } }),
      );
    }

    await ecrire(
      `enseignant ${ENSEIGNANT_CIBLE} rattaché au compte de démonstration`,
      () => prisma.enseignant.update({ where: { id: ENSEIGNANT_CIBLE }, data: { userId: adminUserId } }),
    );
  }

  // Les traces d'action portent un `userId`, pas un `enseignantId` : sans
  // cette reprise, « les notes que J'AI saisies » resterait vide alors que le
  // service est bien là.
  if (ancienUserId !== adminUserId) {
    await ecrire("notes saisies reprises au nom du compte de démonstration", async () => {
      await prisma.note.updateMany({ where: { saisieParId: ancienUserId }, data: { saisieParId: adminUserId } });
      await prisma.absence.updateMany({ where: { saisieParId: ancienUserId }, data: { saisieParId: adminUserId } });
    });
  }

  return { ancienUserId };
}

// ------------------------------------------------------------------
// 2. La famille
// ------------------------------------------------------------------

type FicheEleve = {
  id: string;
  nom: string;
  prenom: string;
  dateNaissance: Date;
  sexe: "M" | "F";
  classeId: string | null;
  siteId: string | null;
  tenantId: string;
};

async function renommer(eleveId: string): Promise<FicheEleve> {
  const e = await prisma.eleve.findUnique({
    where: { id: eleveId },
    select: { id: true, nom: true, prenom: true, dateNaissance: true, sexe: true, classeId: true, siteId: true, tenantId: true },
  });
  if (!e) throw new Error(`Élève ${eleveId} introuvable`);
  if (e.nom !== NOM_FAMILLE) {
    await ecrire(`${e.prenom} ${e.nom} → ${e.prenom} ${NOM_FAMILLE}`, () =>
      prisma.eleve.update({ where: { id: eleveId }, data: { nom: NOM_FAMILLE } }),
    );
  } else {
    note(`· ${e.prenom} ${NOM_FAMILLE} porte déjà le nom de famille`);
  }
  return { ...e, nom: NOM_FAMILLE } as FicheEleve;
}

/**
 * Donne à une fiche de la cohorte 2026-2027 l'identité d'un des deux enfants.
 *
 * On ne crée pas d'élève : on reprend une fiche existante de la classe visée,
 * déjà pourvue de sa facture de rentrée et de son rattachement de site. C'est
 * la même personne d'une année sur l'autre, ce que le modèle de données
 * n'exprime pas autrement (une fiche par année, cohortes disjointes).
 */
async function incarnerEn2026(
  enfant: FicheEleve,
  classeId: string,
  decision: "Passage" | "Redoublement",
  moyennePrecedente: number,
): Promise<FicheEleve | null> {
  const dejaLa = await prisma.eleve.findFirst({
    where: { tenantId: TENANT, classeId, prenom: enfant.prenom, nom: NOM_FAMILLE, dateNaissance: enfant.dateNaissance },
    select: { id: true, nom: true, prenom: true, dateNaissance: true, sexe: true, classeId: true, siteId: true, tenantId: true },
  });

  let fiche = dejaLa as FicheEleve | null;

  if (!fiche) {
    // Une fiche quelconque de la classe, à l'exclusion de celles déjà
    // enrôlées comme personas : le tri par matricule rend le choix stable.
    const candidate = await prisma.eleve.findFirst({
      where: { tenantId: TENANT, classeId, nom: { not: NOM_FAMILLE }, deletedAt: null },
      orderBy: { matricule: "asc" },
      select: { id: true, nom: true, prenom: true, matricule: true, dateNaissance: true, sexe: true, classeId: true, siteId: true, tenantId: true },
    });
    if (!candidate) throw new Error(`Aucune fiche disponible dans ${classeId}`);

    await ecrire(
      `${candidate.prenom} ${candidate.nom} (${candidate.matricule}) devient ${enfant.prenom} ${NOM_FAMILLE} en ${classeId}`,
      () =>
        prisma.eleve.update({
          where: { id: candidate.id },
          data: {
            nom: NOM_FAMILLE,
            prenom: enfant.prenom,
            dateNaissance: enfant.dateNaissance,
            sexe: enfant.sexe,
          },
        }),
    );
    fiche = { ...candidate, nom: NOM_FAMILLE, prenom: enfant.prenom, dateNaissance: enfant.dateNaissance, sexe: enfant.sexe } as FicheEleve;
  } else {
    note(`· ${enfant.prenom} ${NOM_FAMILLE} déjà présent en ${classeId}`);
  }

  // Le parcours de l'année précédente donne sa cohérence à la décision de
  // passage ou de redoublement affichée partout ailleurs.
  const classePrecedente = await prisma.classe.findUnique({
    where: { id: enfant.classeId! },
    select: { nom: true, niveau: true },
  });

  await ecrire(`parcours 2025-2026 de ${enfant.prenom} ${NOM_FAMILLE} (${decision})`, () =>
    prisma.parcoursScolaire.upsert({
      where: { eleveId_annee: { eleveId: fiche!.id, annee: "2025-2026" } },
      create: {
        tenantId: TENANT,
        eleveId: fiche!.id,
        annee: "2025-2026",
        classe: classePrecedente?.nom ?? "2nde D",
        niveau: classePrecedente?.niveau ?? "Seconde",
        moyenneAnnuelle: moyennePrecedente,
        decision,
      },
      update: { moyenneAnnuelle: moyennePrecedente, decision, classe: classePrecedente?.nom ?? "2nde D" },
    }),
  );

  return fiche;
}

async function rattacherAuParent(parentId: string, eleves: FicheEleve[]) {
  for (const e of eleves) {
    const existe = await prisma.eleveParent.findUnique({
      where: { eleveId_parentId: { eleveId: e.id, parentId } },
    });
    if (existe) {
      note(`· ${e.prenom} ${e.nom} (${e.id}) déjà rattaché au compte parent`);
      continue;
    }
    await ecrire(`${e.prenom} ${e.nom} (${e.id}) rattaché au compte parent`, () =>
      prisma.eleveParent.create({
        data: { eleveId: e.id, parentId, lien: "PERE", isGardien: true },
      }),
    );
  }

  // Les rattachements hérités de scripts antérieurs (sept enfants sans lien
  // de famille, répartis sur deux années) sont retirés : l'espace parent doit
  // montrer une famille, pas un échantillon.
  const aRetirer = await prisma.eleveParent.findMany({
    where: { parentId, eleveId: { notIn: eleves.map((e) => e.id) } },
    select: { eleveId: true },
  });
  if (aRetirer.length > 0) {
    await ecrire(`${aRetirer.length} rattachement(s) hérité(s) retiré(s) du compte parent`, () =>
      prisma.eleveParent.deleteMany({
        where: { parentId, eleveId: { in: aRetirer.map((r) => r.eleveId) } },
      }),
    );
  }
}

// ------------------------------------------------------------------
// 3. Le compte élève
// ------------------------------------------------------------------

async function brancherEleve(adminUserId: string, eleveId: string) {
  const actuel = await prisma.eleve.findFirst({ where: { userId: adminUserId }, select: { id: true, matricule: true } });

  if (actuel?.id === eleveId) {
    note("· compte élève déjà rattaché à la bonne fiche");
    return;
  }

  if (actuel) {
    await ecrire(`fiche élève ${actuel.matricule} détachée du compte`, () =>
      prisma.eleve.update({ where: { id: actuel.id }, data: { userId: null } }),
    );
    // La fiche fabriquée pour le compte admin (ELEV-ADMIN-001) n'est pas un
    // élève de l'établissement : elle fausserait les effectifs.
    if (actuel.matricule.startsWith("ELEV-ADMIN")) {
      await ecrire(`fiche fabriquée ${actuel.matricule} archivée`, () =>
        prisma.eleve.update({
          where: { id: actuel.id },
          data: { statut: "TRANSFERE", deletedAt: new Date(), identiteKey: null },
        }),
      );
    }
  }

  await ecrire("compte élève rattaché à l'enfant en difficulté", () =>
    prisma.eleve.update({ where: { id: eleveId }, data: { userId: adminUserId } }),
  );
}

// ------------------------------------------------------------------

async function main() {
  if (DRY) note("=== SIMULATION — aucune écriture ===");

  const admin = await prisma.user.findFirst({
    where: { email: ADMIN_EMAIL },
    select: { id: true, name: true, role: true },
  });
  if (!admin) throw new Error(`Compte ${ADMIN_EMAIL} introuvable`);
  note(`Compte de démonstration : ${admin.name} (${admin.id})`);

  await brancherEnseignant(admin.id);

  const fort = await renommer(ENFANT_FORT_2025);
  const fragile = await renommer(ENFANT_FRAGILE_2025);

  const fort26 = await incarnerEn2026(fort, CLASSE_FORT_2026, "Passage", 17.75);
  const fragile26 = await incarnerEn2026(fragile, CLASSE_FRAGILE_2026, "Redoublement", 6.04);

  // Le compte parent de démonstration.
  let parent = await prisma.parent.findFirst({ where: { tenantId: TENANT, userId: admin.id }, select: { id: true } });
  if (!parent) {
    const cree = await ecrire("compte parent de démonstration créé", () =>
      prisma.parent.create({
        data: {
          tenantId: TENANT,
          userId: admin.id,
          nom: NOM_FAMILLE,
          prenom: admin.name?.split(" ")[0] ?? "Abdillahi",
          phone: "77 00 00 01",
          email: ADMIN_EMAIL,
          profession: "Chef d'établissement",
        },
      }),
    );
    parent = cree ? { id: cree.id } : null;
  }

  if (parent) {
    const enfants = [fort, fragile, fort26, fragile26].filter(Boolean) as FicheEleve[];
    await rattacherAuParent(parent.id, enfants);
  }

  await brancherEleve(admin.id, fragile.id);

  note("");
  note(`${journal.filter((l) => l.startsWith("✓")).length} écriture(s), ${journal.filter((l) => l.startsWith("·")).length} déjà conforme(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
