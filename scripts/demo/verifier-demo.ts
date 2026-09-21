/**
 * Démo Ambouli — vérification : « à cette date, sous ce rôle, y a-t-il de quoi
 * montrer quelque chose ? »
 *
 * POURQUOI CE SCRIPT
 * Une démonstration ne tombe jamais en panne sur une erreur : elle tombe sur
 * un écran vide. Et un écran vide ne se voit qu'en l'ouvrant — ce qui, pour
 * six dates × quatorze rôles × soixante-dix écrans, n'est pas tenable à la
 * main. Ce script reproduit, requête par requête, ce que chaque espace va
 * chercher, en appliquant la même borne temporelle que l'horizon de
 * démonstration (`src/lib/demo-horizon.ts`) : ce qui n'a pas encore eu lieu à
 * la date choisie n'est pas compté.
 *
 * CE QU'IL NE FAIT PAS
 * Il ne remplace pas `audit-parcours.mjs`, qui ouvre réellement les pages.
 * Celui-ci répond en quelques secondes et dit OÙ regarder ; l'autre prend une
 * heure et dit ce que l'utilisateur verra.
 *
 *   pnpm exec tsx scripts/demo/verifier-demo.ts
 *   pnpm exec tsx scripts/demo/verifier-demo.ts --date octobre-2026
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TENANT = "tenant-ambouli";
const ADMIN = "admin@cite-ambouli.dj";

const DATES: { id: string; date: Date }[] = [
  { id: "octobre-2025", date: new Date("2025-10-15T10:00:00.000Z") },
  { id: "janvier-2026", date: new Date("2026-01-15T10:00:00.000Z") },
  { id: "mars-2026", date: new Date("2026-03-15T10:00:00.000Z") },
  { id: "juin-2026", date: new Date("2026-06-15T10:00:00.000Z") },
  { id: "aout-2026", date: new Date("2026-08-16T10:00:00.000Z") },
  { id: "octobre-2026", date: new Date("2026-10-15T10:00:00.000Z") },
  { id: "reel", date: new Date() },
];

interface Controle {
  role: string;
  ecran: string;
  quoi: string;
  compte: (date: Date, annee: string, ctx: Contexte) => Promise<number>;
  /** En dessous de ce seuil, l'écran est considéré comme vide. */
  minimum?: number;
  /** Écrans dont le vide est normal à cette date (ex. bulletins en septembre). */
  videAcceptableSi?: (date: Date, annee: string) => boolean;
}

interface Contexte {
  enseignantId: string;
  enseignantUserId: string;
  parentId: string;
  eleveIds: string[];
}

/**
 * Sommes-nous entre deux années scolaires ?
 *
 * Du 15 juillet au 2 septembre, l'année précédente est close et la suivante
 * n'a pas commencé : aucune note, aucune absence, aucun incident ne PEUT
 * exister sur l'année active. Un écran vide n'y est donc pas un défaut du jeu
 * de données, mais la réalité d'un établissement en vacances — ce que
 * l'application appelle la phase « estivale » (`getContexteAnnees`).
 */
function entreDeuxAnnees(date: Date): boolean {
  const mois = date.getMonth();
  const jour = date.getDate();
  if (mois === 6) return jour >= 15; // seconde moitié de juillet
  if (mois === 7) return true; // août
  if (mois === 8) return jour < 2; // tout début septembre
  return false;
}

/**
 * Le trimestre vient de commencer : certaines choses n'ont pas encore pu se
 * produire (bulletins publiés, exclusions au terme de trois relances).
 */
function debutAnnee(date: Date): boolean {
  const mois = date.getMonth();
  return mois === 8 || mois === 9; // septembre, octobre
}

/** L'année scolaire active à une date donnée — même règle que `getContexteAnnees`. */
async function anneeActive(date: Date): Promise<string> {
  const annees = await prisma.anneesScolaires.findMany({
    where: { tenantId: TENANT },
    orderBy: { dateDebut: "desc" },
  });
  const contenante = annees.find((a) => a.dateDebut <= date && a.dateFin >= date);
  if (contenante) return contenante.libelle;
  const aVenir = annees.find((a) => a.isCurrent && a.dateDebut > date);
  if (aVenir) return aVenir.libelle;
  return annees.find((a) => a.dateFin < date)?.libelle ?? annees[0]?.libelle ?? "";
}

const CONTROLES: Controle[] = [
  // ── Direction ─────────────────────────────────────────────────────────
  {
    role: "TENANT_ADMIN", ecran: "/direction", quoi: "élèves inscrits",
    compte: (_d, annee) => prisma.eleve.count({ where: { tenantId: TENANT, classe: { annee }, deletedAt: null } }),
    minimum: 100,
  },
  {
    role: "TENANT_ADMIN", ecran: "/direction", quoi: "notes saisies",
    compte: (date, annee) => prisma.note.count({ where: { tenantId: TENANT, classe: { annee }, date: { lte: date } } }),
    minimum: 50,
  },
  {
    role: "TENANT_ADMIN", ecran: "/analytics", quoi: "parcours de l'année précédente",
    compte: (_d, annee) => prisma.parcoursScolaire.count({ where: { tenantId: TENANT, eleve: { classe: { annee } }, annee: { not: annee } } }),
    minimum: 50,
  },
  {
    role: "TENANT_ADMIN", ecran: "/vie-scolaire", quoi: "incidents",
    compte: (date, annee) => prisma.incident.count({ where: { tenantId: TENANT, eleve: { classe: { annee } }, date: { lte: date } } }),
    minimum: 1,
  },

  // ── Enseignant (le compte de démonstration) ───────────────────────────
  {
    role: "TEACHER", ecran: "/mon-espace", quoi: "classes affectées",
    compte: (_d, annee, ctx) => prisma.affectationEnseignant.count({ where: { enseignantId: ctx.enseignantId, classe: { annee } } }),
    minimum: 1,
  },
  {
    role: "TEACHER", ecran: "/mon-emploi", quoi: "créneaux d'emploi du temps",
    compte: (_d, annee, ctx) => prisma.emploiTemps.count({ where: { enseignantId: ctx.enseignantId, annee } }),
    minimum: 1,
  },
  {
    role: "TEACHER", ecran: "/cahier-journal", quoi: "séances faites",
    compte: (date, annee, ctx) => prisma.seancePedagogique.count({ where: { enseignantId: ctx.enseignantId, classe: { annee }, date: { lte: date } } }),
    minimum: 1,
  },
  {
    role: "TEACHER", ecran: "/devoirs", quoi: "devoirs donnés",
    compte: (date, annee, ctx) => prisma.devoir.count({ where: { enseignantId: ctx.enseignantId, classe: { annee }, dateDonne: { lte: date } } }),
    minimum: 1,
  },
  {
    role: "TEACHER", ecran: "/notes", quoi: "notes qu'il a saisies",
    compte: (date, annee, ctx) => prisma.note.count({ where: { saisieParId: ctx.enseignantUserId, classe: { annee }, date: { lte: date } } }),
    minimum: 1,
  },
  {
    role: "TEACHER", ecran: "/evaluations", quoi: "évaluations de ses classes",
    compte: (date, annee, ctx) =>
      prisma.evaluation.count({
        where: {
          tenantId: TENANT, classe: { annee },
          matiere: { affectations: { some: { enseignantId: ctx.enseignantId } } },
          OR: [{ statut: "PLANIFIE" }, { date: { lte: date } }],
        },
      }),
    minimum: 1,
  },
  {
    role: "TEACHER", ecran: "/absences/appel", quoi: "appels déjà faits",
    compte: (date, annee, ctx) => prisma.absence.count({ where: { saisieParId: ctx.enseignantUserId, eleve: { classe: { annee } }, date: { lte: date } } }),
    minimum: 1,
  },
  {
    role: "TEACHER", ecran: "/recommandations", quoi: "recommandations sur ses classes",
    compte: (_d, annee, ctx) =>
      prisma.recommandation.count({
        where: { tenantId: TENANT, eleve: { classe: { annee, affectations: { some: { enseignantId: ctx.enseignantId } } } } },
      }),
    minimum: 1,
  },

  // ── Professeur principal ──────────────────────────────────────────────
  {
    role: "CLASS_TEACHER", ecran: "/ma-classe", quoi: "classe dont il est professeur principal",
    compte: (_d, annee, ctx) => prisma.classe.count({ where: { profPrincipalId: ctx.enseignantId, annee, deletedAt: null } }),
    minimum: 1,
  },
  {
    role: "CLASS_TEACHER", ecran: "/ma-classe", quoi: "élèves de cette classe",
    compte: (_d, annee, ctx) => prisma.eleve.count({ where: { classe: { profPrincipalId: ctx.enseignantId, annee }, deletedAt: null } }),
    minimum: 5,
  },

  // ── Parent ────────────────────────────────────────────────────────────
  {
    role: "PARENT", ecran: "/parent", quoi: "enfants inscrits cette année",
    compte: (_d, annee, ctx) => prisma.eleve.count({ where: { parents: { some: { parentId: ctx.parentId } }, classe: { annee }, deletedAt: null } }),
    minimum: 1,
  },
  {
    role: "PARENT", ecran: "/parent", quoi: "notes de ses enfants",
    compte: (date, annee, ctx) =>
      prisma.note.count({ where: { eleve: { parents: { some: { parentId: ctx.parentId } }, classe: { annee } }, date: { lte: date } } }),
    minimum: 1,
  },
  {
    role: "PARENT", ecran: "/parent", quoi: "absences de ses enfants",
    compte: (date, annee, ctx) =>
      prisma.absence.count({ where: { eleve: { parents: { some: { parentId: ctx.parentId } }, classe: { annee } }, date: { lte: date } } }),
    minimum: 1,
  },
  {
    role: "PARENT", ecran: "/parent/factures", quoi: "factures de la famille",
    compte: (date, annee, ctx) =>
      prisma.facture.count({ where: { eleve: { parents: { some: { parentId: ctx.parentId } }, classe: { annee } }, echeance: { lte: date } } }),
    minimum: 1,
  },

  // ── Élève ─────────────────────────────────────────────────────────────
  {
    role: "STUDENT", ecran: "/eleve", quoi: "ses notes",
    compte: (date, annee, ctx) => prisma.note.count({ where: { eleveId: { in: ctx.eleveIds }, classe: { annee }, date: { lte: date } } }),
    minimum: 1,
  },
  {
    role: "STUDENT", ecran: "/entrainement", quoi: "ses feuilles d'exercices",
    compte: (date, _annee, ctx) => prisma.feuilleExercices.count({ where: { eleveId: { in: ctx.eleveIds }, assigneeLe: { lte: date } } }),
    minimum: 1,
  },
  {
    role: "STUDENT", ecran: "/eleve", quoi: "ses compétences évaluées",
    compte: (date, _annee, ctx) => prisma.learningEvidence.count({ where: { eleveId: { in: ctx.eleveIds }, occurredAt: { lte: date } } }),
    minimum: 1,
  },
  {
    role: "STUDENT", ecran: "/travail", quoi: "devoirs à faire",
    compte: (date, annee, ctx) => prisma.devoir.count({ where: { classe: { annee, eleves: { some: { id: { in: ctx.eleveIds } } } }, dateDonne: { lte: date } } }),
    minimum: 1,
  },

  // ── Vie scolaire, santé, orientation ─────────────────────────────────
  {
    role: "SUPERVISOR", ecran: "/vie-scolaire", quoi: "absences relevées",
    compte: (date, annee) => prisma.absence.count({ where: { tenantId: TENANT, eleve: { classe: { annee } }, date: { lte: date } } }),
    minimum: 10,
  },
  {
    role: "SUPERVISOR", ecran: "/vie-scolaire/exclusions", quoi: "exclusions",
    compte: (date, annee) => prisma.exclusionEleve.count({ where: { tenantId: TENANT, eleve: { classe: { annee } }, dateDebut: { lte: date } } }),
    minimum: 1,
  },
  {
    role: "NURSE", ecran: "/infirmerie", quoi: "passages à l'infirmerie",
    compte: (date, annee) => prisma.passageInfirmerie.count({ where: { tenantId: TENANT, eleve: { classe: { annee } }, date: { lte: date } } }),
    minimum: 1,
  },
  {
    role: "COUNSELOR", ecran: "/conseiller", quoi: "entretiens",
    compte: (date, annee) => prisma.entretienConseiller.count({ where: { tenantId: TENANT, eleve: { classe: { annee } }, date: { lte: date } } }),
    minimum: 1,
  },

  // ── Administration et finances ───────────────────────────────────────
  {
    role: "ACCOUNTANT", ecran: "/facturation", quoi: "factures émises",
    compte: (date, annee) => prisma.facture.count({ where: { tenantId: TENANT, annee: { libelle: annee }, echeance: { lte: date } } }),
    minimum: 10,
  },
  {
    role: "ACCOUNTANT", ecran: "/caisse", quoi: "encaissements",
    compte: (date, annee) => prisma.paiement.count({ where: { facture: { tenantId: TENANT, annee: { libelle: annee } }, date: { lte: date } } }),
    minimum: 10,
  },
  {
    role: "ACCOUNTANT", ecran: "/facturation", quoi: "relances envoyées",
    compte: (date, annee) => prisma.relance.count({ where: { tenantId: TENANT, facture: { annee: { libelle: annee } }, envoyeeLe: { lte: date } } }),
    minimum: 1,
  },
  {
    role: "SECRETARY", ecran: "/secretariat", quoi: "élèves à gérer",
    compte: (_d, annee) => prisma.eleve.count({ where: { tenantId: TENANT, classe: { annee }, deletedAt: null } }),
    minimum: 10,
  },
  {
    role: "SITE_MANAGER", ecran: "/exploitation", quoi: "créneaux à planifier",
    compte: (_d, annee) => prisma.emploiTemps.count({ where: { tenantId: TENANT, annee } }),
    minimum: 10,
  },
  {
    role: "PRINCIPAL", ecran: "/rh", quoi: "bulletins de paie du mois",
    compte: (date) =>
      prisma.bulletinPaie.count({ where: { ficheRH: { tenantId: TENANT }, datePaiement: { lte: date, gte: new Date(date.getFullYear(), date.getMonth() - 2, 1) } } }),
    minimum: 1,
  },
  // ── Préparation de la rentrée (phase estivale) ───────────────────────
  {
    role: "SECRETARY", ecran: "/admissions", quoi: "candidatures de l'année",
    compte: (_d, annee) => prisma.candidature.count({ where: { tenantId: TENANT, annee } }),
    minimum: 1,
    // Les candidatures ne concernent que l'année en préparation.
    videAcceptableSi: (_d, annee) => annee !== "2026-2027",
  },
  {
    role: "SITE_MANAGER", ecran: "/emploi-du-temps", quoi: "emploi du temps prêt pour l'année",
    compte: (_d, annee) => prisma.emploiTemps.count({ where: { tenantId: TENANT, annee } }),
    minimum: 100,
  },
  {
    role: "ACCOUNTANT", ecran: "/facturation", quoi: "frais d'inscription exigibles",
    compte: (date, annee) =>
      prisma.facture.count({ where: { tenantId: TENANT, annee: { libelle: annee }, mois: null, echeance: { lte: date } } }),
    minimum: 10,
    // Avant la première échéance de l'année, rien n'est encore exigible.
    videAcceptableSi: (date, annee) => annee === "2025-2026" && date.getFullYear() === 2025,
  },

  {
    role: "INSPECTOR", ecran: "/inspection", quoi: "bulletins publiés",
    compte: (date, annee) =>
      prisma.bulletin.count({ where: { tenantId: TENANT, periode: { annee: { libelle: annee } }, publishedAt: { lte: date } } }),
    minimum: 1,
    // En début d'année, aucun bulletin n'est encore publié : c'est la réalité
    // d'un 15 octobre, pas un trou dans le jeu de données.
    videAcceptableSi: (date) => date.getMonth() >= 7 && date.getMonth() <= 10,
  },
];

async function main() {
  const filtreDate = process.argv.includes("--date") ? process.argv[process.argv.indexOf("--date") + 1] : null;

  const admin = await prisma.user.findFirst({ where: { email: ADMIN }, select: { id: true } });
  if (!admin) throw new Error(`Compte ${ADMIN} introuvable`);

  const enseignant = await prisma.enseignant.findFirst({ where: { userId: admin.id, tenantId: TENANT }, select: { id: true } });
  const parent = await prisma.parent.findFirst({ where: { userId: admin.id, tenantId: TENANT }, select: { id: true } });
  const eleveRattache = await prisma.eleve.findFirst({
    where: { userId: admin.id, tenantId: TENANT },
    select: { id: true, nom: true, prenom: true, dateNaissance: true },
  });
  if (!enseignant || !parent || !eleveRattache) {
    throw new Error("Personas incomplets — lancer d'abord scripts/demo/01-personas.ts");
  }

  // Le compte élève suit la personne d'une année sur l'autre : toutes ses
  // fiches comptent, pas seulement celle qui porte le `userId`.
  const memePersonne = await prisma.eleve.findMany({
    where: { tenantId: TENANT, nom: eleveRattache.nom, prenom: eleveRattache.prenom, dateNaissance: eleveRattache.dateNaissance },
    select: { id: true },
  });

  const ctx: Contexte = {
    enseignantId: enseignant.id,
    enseignantUserId: admin.id,
    parentId: parent.id,
    eleveIds: memePersonne.map((e) => e.id),
  };

  // Les contrôles portant sur des faits constatés sont muets pendant l'été :
  // c'est à cela que sert la tolérance, plutôt que de retirer ces écrans du
  // contrôle et de ne plus rien vérifier le reste de l'année.
  const FAITS_CONSTATES = new Set([
    "notes saisies", "incidents", "séances faites", "devoirs donnés",
    "notes qu'il a saisies", "appels déjà faits", "notes de ses enfants",
    "absences de ses enfants", "ses notes", "devoirs à faire", "absences relevées",
    "passages à l'infirmerie", "entretiens", "encaissements", "relances envoyées",
    "ses compétences évaluées", "exclusions", "recommandations sur ses classes",
    "évaluations de ses classes", "ses feuilles d'exercices", "factures de la famille",
    "factures émises",
  ]);

  const dates = filtreDate ? DATES.filter((d) => d.id === filtreDate) : DATES;
  let manques = 0;

  for (const d of dates) {
    const annee = await anneeActive(d.date);
    console.log(`\n━━━ ${d.id}  (${d.date.toISOString().slice(0, 10)} — année active ${annee}) ━━━`);

    let roleCourant = "";
    for (const c of CONTROLES) {
      const n = await c.compte(d.date, annee, ctx);
      const seuil = c.minimum ?? 1;
      const tolere =
        (c.videAcceptableSi?.(d.date, annee) ?? false) ||
        (entreDeuxAnnees(d.date) && FAITS_CONSTATES.has(c.quoi)) ||
        (debutAnnee(d.date) && c.quoi === "exclusions");
      const ok = n >= seuil || tolere;
      if (!ok) manques++;
      if (c.role !== roleCourant) {
        roleCourant = c.role;
        console.log(`  ${c.role}`);
      }
      const marque = n >= seuil ? "✓" : tolere ? "·" : "✗";
      console.log(`    ${marque} ${c.ecran.padEnd(24)} ${c.quoi.padEnd(38)} ${n}`);
    }
  }

  console.log(
    manques === 0
      ? "\nTous les écrans contrôlés ont de la matière à toutes les dates.\n"
      : `\n${manques} contrôle(s) à vide — voir les lignes ✗ ci-dessus.\n`,
  );
  process.exitCode = manques === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
