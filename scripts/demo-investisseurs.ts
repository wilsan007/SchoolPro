/**
 * SchoolPro / LEARNOS — Jeu de démonstration investisseurs
 * ============================================================
 *
 *   npx tsx scripts/demo-investisseurs.ts          → crée le scénario complet
 *   npx tsx scripts/demo-investisseurs.ts --clean  → supprime tout
 *
 * Crée un tenant isolé « demo-investisseurs » avec :
 *   - 3 élèves vedettes (Amina l'excelle, Ibrahim le en difficulté qui remonte,
 *     Fatima la moyenne qui décline)
 *   - 3 enseignants vedettes (Mme Hassan la rigoureuse, M. Waberi le en retard,
 *     Mme Ismael l'innovante)
 *   - 15 élèves d'arrière-plan pour des statistiques réalistes
 *   - 7 matières, curriculum avec prérequis, évaluations, notes T1+T2
 *   - Prédictions émises avant chapitres et vérifiées après
 *   - Plans de progression (remédiation, enrichissement) avec étapes
 *   - Interventions pédagogiques (Ibrahim)
 *   - Exercices (feuilles, assignés, réponses) avec paliers variés
 *   - Alertes parent + échanges parent (bot)
 *   - Absences, incidents, sanctions, entretiens conseiller, fiches sanitaires
 *   - Bulletins T1 + T2 avec moyennes de classe réelles
 *   - Factures + paiements
 *   - KpiSnapshot mensuels
 *   - Comptes pour tous les rôles (15 comptes)
 *
 * Toutes les données portent le tenant « demo-investisseurs », isolé du reste
 * et supprimable d'un seul geste (--clean).
 */

import { PrismaClient, Prisma } from "@prisma/client";

// Pooler en mode SESSION (DIRECT_URL, port 5432) — cf. demo-learnos.ts.
const prisma = new PrismaClient({
  log: [],
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

const SLUG = "demo-investisseurs";
const ANNEE = "2025-2026";
const MOT_DE_PASSE = "Demo@2026!";

// ── Utilitaires ──────────────────────────────────────────────

function titre(texte: string) {
  console.log("\n" + "═".repeat(70));
  console.log("  " + texte);
  console.log("═".repeat(70));
}

function etape(texte: string) {
  console.log(`\n▸ ${texte}`);
}

function ok(texte: string) {
  console.log(`   ✓ ${texte}`);
}

function d(jour: string): Date {
  return new Date(jour);
}

// ── Nettoyage ────────────────────────────────────────────────

async function nettoyer() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: SLUG },
    select: { id: true },
  });
  if (!tenant) {
    console.log("Rien à nettoyer.");
    return;
  }
  const tid = tenant.id;
  // Supprimer d'abord les tables qui référencent Matiere sans cascade
  await prisma.bulletinMatiere.deleteMany({ where: { tenantId: tid } });
  await prisma.evaluationCompetence.deleteMany({ where: { tenantId: tid } });
  // Supprimer les tables qui pourraient avoir des contraintes sans cascade
  await prisma.relance.deleteMany({ where: { tenantId: tid } });
  await prisma.paiement.deleteMany({ where: { facture: { tenantId: tid } } });
  await prisma.facture.deleteMany({ where: { tenantId: tid } });
  await prisma.bulletin.deleteMany({ where: { tenantId: tid } });
  await prisma.note.deleteMany({ where: { tenantId: tid } });
  await prisma.evaluation.deleteMany({ where: { tenantId: tid } });
  await prisma.emploiTemps.deleteMany({ where: { tenantId: tid } });
  await prisma.affectationEnseignant.deleteMany({ where: { tenantId: tid } });
  await prisma.absence.deleteMany({ where: { tenantId: tid } });
  await prisma.incident.deleteMany({ where: { tenantId: tid } });
  await prisma.entretienConseiller.deleteMany({ where: { tenantId: tid } });
  await prisma.passageInfirmerie.deleteMany({ where: { tenantId: tid } });
  await prisma.ficheSanitaire.deleteMany({ where: { tenantId: tid } });
  await prisma.alerteParent.deleteMany({ where: { tenantId: tid } });
  await prisma.echangeParent.deleteMany({ where: { tenantId: tid } });
  await prisma.preferencesParent.deleteMany({ where: { tenantId: tid } });
  await prisma.predictionDifficulte.deleteMany({ where: { tenantId: tid } });
  await prisma.planProgression.deleteMany({ where: { tenantId: tid } });
  await prisma.studentIntervention.deleteMany({ where: { tenantId: tid } });
  await prisma.recommandation.deleteMany({ where: { tenantId: tid } });
  await prisma.learningEvidence.deleteMany({ where: { tenantId: tid } });
  await prisma.studentLearningProfile.deleteMany({ where: { tenantId: tid } });
  await prisma.journalApprentissage.deleteMany({ where: { tenantId: tid } });
  await prisma.kpiSnapshot.deleteMany({ where: { tenantId: tid } });
  await prisma.learnosEvent.deleteMany({ where: { tenantId: tid } });
  await prisma.exerciceReponse.deleteMany({ where: {} });
  await prisma.exerciceAssigne.deleteMany({ where: {} });
  await prisma.feuilleExercices.deleteMany({ where: { tenantId: tid } });
  await prisma.question.deleteMany({ where: { tenantId: tid } });
  await prisma.competence.deleteMany({ where: { tenantId: tid } });
  await prisma.planificationChapitre.deleteMany({ where: { tenantId: tid } });
  await prisma.chapitre.deleteMany({ where: { tenantId: tid } });
  await prisma.bulletinPaie.deleteMany({ where: { ficheRH: { tenantId: tid } } });
  await prisma.ficheRH.deleteMany({ where: { tenantId: tid } });
  await prisma.enseignant.deleteMany({ where: { tenantId: tid } });
  await prisma.eleveParent.deleteMany({ where: { eleve: { tenantId: tid } } });
  await prisma.parent.deleteMany({ where: { tenantId: tid } });
  await prisma.eleve.deleteMany({ where: { tenantId: tid } });
  await prisma.periode.deleteMany({ where: { annee: { tenantId: tid } } });
  await prisma.anneesScolaires.deleteMany({ where: { tenantId: tid } });
  await prisma.classe.deleteMany({ where: { tenantId: tid } });
  await prisma.matiere.deleteMany({ where: { tenantId: tid } });
  await prisma.site.deleteMany({ where: { tenantId: tid } });
  await prisma.user.deleteMany({ where: { tenantId: tid } });
  // Enfin supprimer le tenant
  await prisma.tenant.delete({ where: { id: tid } });
  console.log("Jeu de démonstration supprimé.");
}

// ── Mot de passe ─────────────────────────────────────────────

async function hasherMotDePasse(): Promise<string> {
  const bcrypt = (await import("bcryptjs")).default;
  return bcrypt.hash(MOT_DE_PASSE, 12);
}

// ── Comptes ──────────────────────────────────────────────────

interface CompteSpec {
  email: string;
  prenom: string;
  nom: string;
  role: string;
  siteId?: string;
}

async function creerCompte(
  tenantId: string,
  spec: CompteSpec,
  motDePasseHash: string,
): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: spec.email },
    update: { tenantId, isActive: true, password: motDePasseHash },
    create: {
      tenantId,
      siteId: spec.siteId ?? null,
      email: spec.email,
      password: motDePasseHash,
      name: `${spec.prenom} ${spec.nom}`,
      firstName: spec.prenom,
      lastName: spec.nom,
      role: spec.role as never,
      isActive: true,
    },
    select: { id: true },
  });
  return user.id;
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  if (process.argv.includes("--clean")) return nettoyer();

  titre("CRÉATION DU JEU DE DÉMONSTRATION INVESTISSEURS");

  await nettoyer();
  const motDePasseHash = await hasherMotDePasse();

  // ════════════════════════════════════════════════════════════
  // 1. SOCLE : tenant, site, année, périodes, matières, classe
  // ════════════════════════════════════════════════════════════
  etape("1. Socle : tenant, site, année, périodes, matières, classe");

  const tenant = await prisma.tenant.create({
    data: {
      name: "Lycée Démo Investisseurs",
      slug: SLUG,
      currentYear: ANNEE,
      plan: "PRO",
      status: "ACTIVE",
      country: "DJ",
      currency: "DJF",
      langue: "fr",
      timezone: "Africa/Djibouti",
    },
  });

  const site = await prisma.site.create({
    data: {
      tenantId: tenant.id,
      nom: "Campus Central",
      code: "SITE-01",
      actif: true,
    },
  });

  const annee = await prisma.anneesScolaires.create({
    data: {
      tenantId: tenant.id,
      libelle: ANNEE,
      dateDebut: d("2025-09-01"),
      dateFin: d("2026-07-15"),
      isCurrent: true,
      statut: "OUVERTE",
    },
  });

  const [periodeT1, periodeT2] = await Promise.all([
    prisma.periode.create({
      data: {
        anneeId: annee.id,
        nom: "Trimestre 1",
        numero: 1,
        dateDebut: d("2025-09-01"),
        dateFin: d("2025-12-19"),
        isCurrent: false,
        statut: "CLOTUREE",
        cloturedAt: d("2025-12-20"),
      },
    }),
    prisma.periode.create({
      data: {
        anneeId: annee.id,
        nom: "Trimestre 2",
        numero: 2,
        dateDebut: d("2026-01-05"),
        dateFin: d("2026-04-05"),
        isCurrent: true,
        statut: "OUVERTE",
      },
    }),
  ]);

  // 7 matières
  const matieres = await Promise.all(
    [
      { nom: "Mathématiques", code: "MATH", coef: 4, couleur: "#3b82f6" },
      { nom: "Français", code: "FR", coef: 4, couleur: "#ef4444" },
      { nom: "Sciences Physiques", code: "PHYS", coef: 3, couleur: "#8b5cf6" },
      { nom: "Anglais", code: "ANG", coef: 2, couleur: "#10b981" },
      { nom: "Histoire-Géographie", code: "HG", coef: 2, couleur: "#f59e0b" },
      { nom: "SVT", code: "SVT", coef: 2, couleur: "#22c55e" },
      { nom: "EPS", code: "EPS", coef: 1, couleur: "#6b7280" },
    ].map((m) =>
      prisma.matiere.create({
        data: {
          tenantId: tenant.id,
          siteId: site.id,
          nom: m.nom,
          code: m.code,
          coefficient: m.coef,
          couleur: m.couleur,
        },
      }),
    ),
  );
  const [math, francais, physique] = matieres;

  const classe = await prisma.classe.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      nom: "3ème B",
      niveau: "3ème",
      effectifMax: 40,
      annee: ANNEE,
    },
  });

  ok("tenant, site, année, 2 périodes, 7 matières, classe 3ème B");

  // ════════════════════════════════════════════════════════════
  // 2. ENSEIGNANTS + COMPTES + FICHES RH + BULLETINS DE PAIE
  // ════════════════════════════════════════════════════════════
  etape("2. Enseignants vedettes + arrière-plan + FichesRH + bulletins de paie");

  interface EnsSpec {
    prenom: string;
    nom: string;
    email: string;
    matiereIdx: number;
    isProfPrincipal: boolean;
    typeContrat: "CDI" | "CDD" | "VACATAIRE" | "FONCTIONNAIRE";
    salaire: number;
    diplome: string;
    grade: string;
  }

  const ensSpecs: EnsSpec[] = [
    { prenom: "Khadra", nom: "Hassan", email: "khadra.hassan@demo-investisseurs.test", matiereIdx: 0, isProfPrincipal: true, typeContrat: "FONCTIONNAIRE", salaire: 280000, diplome: "Master Mathématiques", grade: "Professeur certifié" },
    { prenom: "Said", nom: "Waberi", email: "said.waberi@demo-investisseurs.test", matiereIdx: 1, isProfPrincipal: false, typeContrat: "CDI", salaire: 240000, diplome: "Licence Lettres Modernes", grade: "Professeur" },
    { prenom: "Leyla", nom: "Ismael", email: "leyla.ismael@demo-investisseurs.test", matiereIdx: 2, isProfPrincipal: false, typeContrat: "CDI", salaire: 250000, diplome: "Master Physique", grade: "Professeur certifié" },
    { prenom: "Ahmed", nom: "Omar", email: "ahmed.omar@demo-investisseurs.test", matiereIdx: 3, isProfPrincipal: false, typeContrat: "CDD", salaire: 200000, diplome: "Licence Anglais", grade: "Professeur" },
    { prenom: "Mariam", nom: "Ali", email: "mariam.ali@demo-investisseurs.test", matiereIdx: 4, isProfPrincipal: false, typeContrat: "CDI", salaire: 220000, diplome: "Master Histoire", grade: "Professeur" },
    { prenom: "Yousuf", nom: "Mahamoud", email: "yousuf.mahamoud@demo-investisseurs.test", matiereIdx: 5, isProfPrincipal: false, typeContrat: "CDI", salaire: 230000, diplome: "Master SVT", grade: "Professeur certifié" },
    { prenom: "Saido", nom: "Farah", email: "saido.farah@demo-investisseurs.test", matiereIdx: 6, isProfPrincipal: false, typeContrat: "VACATAIRE", salaire: 0, diplome: "BPJEPS", grade: "Intervenant EPS" },
  ];

  const enseignants: { id: string; userId: string; spec: EnsSpec }[] = [];
  for (const spec of ensSpecs) {
    const role = spec.isProfPrincipal ? "CLASS_TEACHER" : "TEACHER";
    const userId = await creerCompte(tenant.id, {
      email: spec.email,
      prenom: spec.prenom,
      nom: spec.nom,
      role,
      siteId: site.id,
    }, motDePasseHash);

    const ens = await prisma.enseignant.create({
      data: {
        tenantId: tenant.id,
        userId,
        matricule: `ENS-${spec.nom.substring(0, 4).toUpperCase()}`,
        specialite: matieres[spec.matiereIdx].nom,
        typeContrat: spec.typeContrat,
        dateEntree: d("2020-09-01"),
      },
    });

    await prisma.affectationEnseignant.create({
      data: {
        tenantId: tenant.id,
        enseignantId: ens.id,
        classeId: classe.id,
        matiereId: matieres[spec.matiereIdx].id,
      },
    });

    if (spec.isProfPrincipal) {
      await prisma.classe.update({
        where: { id: classe.id },
        data: { profPrincipalId: ens.id },
      });
    }

    const ficheRH = await prisma.ficheRH.create({
      data: {
        tenantId: tenant.id,
        enseignantId: ens.id,
        typeContrat: spec.typeContrat as never,
        dateEntree: d("2020-09-01"),
        salaireBase: spec.salaire,
        diplome: spec.diplome,
        echelon: 3,
        grade: spec.grade,
        banque: "Banque de Djibouti",
        congesAnnuels: 30,
        congesPris: 5,
        absencesCount: spec.nom === "Waberi" ? 3 : 0,
      },
    });

    const nbMois = ensSpecs.indexOf(spec) < 3 ? 12 : 3;
    for (let i = 0; i < nbMois; i++) {
      const mois = 10 + i <= 12 ? 10 + i : 10 + i - 12;
      const anneePaie = 10 + i <= 12 ? 2025 : 2026;
      const isPaye = anneePaie < 2026 || (anneePaie === 2026 && mois <= 8);
      await prisma.bulletinPaie.create({
        data: {
          ficheRHId: ficheRH.id,
          mois,
          annee: anneePaie,
          heuresEffectuees: spec.typeContrat === "VACATAIRE" ? 20 : 35,
          salaireBase: spec.salaire,
          primes: spec.isProfPrincipal ? 20000 : 0,
          deductions: spec.nom === "Waberi" ? 15000 : 0,
          netAPayer: spec.salaire + (spec.isProfPrincipal ? 20000 : 0) - (spec.nom === "Waberi" ? 15000 : 0),
          isPaye,
          datePaiement: isPaye ? d(`${anneePaie}-${String(mois).padStart(2, "0")}-28`) : null,
        },
      });
    }

    enseignants.push({ id: ens.id, userId, spec });
  }

  const [ensHassan, ensWaberi, ensIsmael] = enseignants;
  ok(`${enseignants.length} enseignants créés (3 vedettes + 4 arrière-plan)`);
  ok("Fiches RH + bulletins de paie (12 mois pour vedettes, 3 pour arrière-plan)");

  // ════════════════════════════════════════════════════════════
  // 3. CURRICULUM : chapitres, compétences, prérequis
  // ════════════════════════════════════════════════════════════
  etape("3. Curriculum : chapitres, compétences, prérequis (3 matières vedettes)");

  const chapMath = await prisma.chapitre.create({
    data: { tenantId: tenant.id, siteId: site.id, matiereId: math.id, nom: "Calcul littéral", niveau: "3ème", ordre: 1 },
  });
  const compFrac = await prisma.competence.create({
    data: { tenantId: tenant.id, siteId: site.id, chapitreId: chapMath.id, code: "MATH-FRAC", libelle: "Manipuler les fractions", ordre: 1 },
  });
  const compEq = await prisma.competence.create({
    data: { tenantId: tenant.id, siteId: site.id, chapitreId: chapMath.id, code: "MATH-EQ1", libelle: "Résoudre une équation du 1er degré", ordre: 2, prerequis: { connect: [{ id: compFrac.id }] } },
  });
  const compProp = await prisma.competence.create({
    data: { tenantId: tenant.id, siteId: site.id, chapitreId: chapMath.id, code: "MATH-PROP", libelle: "Appliquer la proportionnalité", ordre: 3, prerequis: { connect: [{ id: compFrac.id }] } },
  });

  const chapFr = await prisma.chapitre.create({
    data: { tenantId: tenant.id, siteId: site.id, matiereId: francais.id, nom: "Expression écrite", niveau: "3ème", ordre: 1 },
  });
  const compGram = await prisma.competence.create({
    data: { tenantId: tenant.id, siteId: site.id, chapitreId: chapFr.id, code: "FR-GRAM", libelle: "Maîtriser la grammaire de phrase", ordre: 1 },
  });
  const compRedac = await prisma.competence.create({
    data: { tenantId: tenant.id, siteId: site.id, chapitreId: chapFr.id, code: "FR-REDAC", libelle: "Rédiger un texte argumentatif", ordre: 2, prerequis: { connect: [{ id: compGram.id }] } },
  });
  const compLec = await prisma.competence.create({
    data: { tenantId: tenant.id, siteId: site.id, chapitreId: chapFr.id, code: "FR-LEC", libelle: "Analyser un texte littéraire", ordre: 3 },
  });

  const chapPhys = await prisma.chapitre.create({
    data: { tenantId: tenant.id, siteId: site.id, matiereId: physique.id, nom: "Mécanique et électricité", niveau: "3ème", ordre: 1 },
  });
  const compMec = await prisma.competence.create({
    data: { tenantId: tenant.id, siteId: site.id, chapitreId: chapPhys.id, code: "PHYS-MEC", libelle: "Appliquer les lois de la mécanique", ordre: 1 },
  });
  const compElec = await prisma.competence.create({
    data: { tenantId: tenant.id, siteId: site.id, chapitreId: chapPhys.id, code: "PHYS-ELEC", libelle: "Analyser un circuit électrique", ordre: 2, prerequis: { connect: [{ id: compMec.id }] } },
  });

  await prisma.planificationChapitre.create({
    data: { tenantId: tenant.id, siteId: site.id, anneeId: annee.id, chapitreId: chapMath.id, classeId: classe.id, semaineDebut: 1, semaineFin: 16, heuresPrevues: 20, statut: "TRAITE", demarreLe: d("2025-09-08"), traiteLe: d("2026-01-10"), semaineDebutInitiale: 1, semaineFinInitiale: 14 },
  });
  await prisma.planificationChapitre.create({
    data: { tenantId: tenant.id, siteId: site.id, anneeId: annee.id, chapitreId: chapFr.id, classeId: classe.id, semaineDebut: 1, semaineFin: 16, heuresPrevues: 18, statut: "TRAITE", demarreLe: d("2025-09-08"), traiteLe: d("2026-01-12"), semaineDebutInitiale: 1, semaineFinInitiale: 14 },
  });
  await prisma.planificationChapitre.create({
    data: { tenantId: tenant.id, siteId: site.id, anneeId: annee.id, chapitreId: chapPhys.id, classeId: classe.id, semaineDebut: 5, semaineFin: 20, heuresPrevues: 15, statut: "EN_COURS", demarreLe: d("2025-10-06"), semaineDebutInitiale: 5, semaineFinInitiale: 18 },
  });

  ok("3 chapitres, 8 compétences, graphe de prérequis, planifications");

  // ════════════════════════════════════════════════════════════
  // 4. ÉLÈVES (3 vedettes + 15 arrière-plan) + PARENTS
  // ════════════════════════════════════════════════════════════
  etape("4. 18 élèves (3 vedettes + 15 arrière-plan) + 3 parents vedettes");

  const eleveSpecs = [
    { prenom: "Amina", nom: "Hassan", mat: "INV-001", sexe: "F" as const, naissance: "2011-03-15" },
    { prenom: "Ibrahim", nom: "Mahamoud", mat: "INV-002", sexe: "M" as const, naissance: "2011-06-20" },
    { prenom: "Fatima", nom: "Djama", mat: "INV-003", sexe: "F" as const, naissance: "2011-09-10" },
  ];

  const arrierePlanNoms = [
    ["Abdou", "Rachid"], ["Hibo", "Moussa"], ["Yasmine", "Said"], ["Kamal", "Aden"],
    ["Safia", "Bourhan"], ["Moussa", "Omar"], ["Leyla", "Kadar"], ["Nasradine", "Ali"],
    ["Rahma", "Mahmoud"], ["Ilias", "Hassan"], ["Aicha", "Barkat"], ["Djibril", "Abdi"],
    ["Mouna", "Hassan"], ["Omar", "Farah"], ["Salma", "Ibrahim"],
  ];

  const tousLesEleves: { id: string; matricule: string; prenom: string; nom: string; vedette: boolean }[] = [];

  for (const spec of eleveSpecs) {
    const eleve = await prisma.eleve.create({
      data: {
        tenantId: tenant.id,
        siteId: site.id,
        classeId: classe.id,
        matricule: spec.mat,
        nom: spec.nom,
        prenom: spec.prenom,
        dateNaissance: d(spec.naissance),
        sexe: spec.sexe,
        statut: "ACTIF",
        anneeInscription: ANNEE,
        regime: "demi-pensionnaire",
        nationalite: "DJ",
      },
    });
    tousLesEleves.push({ id: eleve.id, matricule: spec.mat, prenom: spec.prenom, nom: spec.nom, vedette: true });
  }

  for (let i = 0; i < arrierePlanNoms.length; i++) {
    const [prenom, nom] = arrierePlanNoms[i];
    const mat = `INV-${String(i + 4).padStart(3, "0")}`;
    const eleve = await prisma.eleve.create({
      data: {
        tenantId: tenant.id,
        siteId: site.id,
        classeId: classe.id,
        matricule: mat,
        nom,
        prenom,
        dateNaissance: d(`2011-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`),
        sexe: i % 2 === 0 ? "M" : "F",
        statut: "ACTIF",
        anneeInscription: ANNEE,
        regime: "demi-pensionnaire",
        nationalite: "DJ",
      },
    });
    tousLesEleves.push({ id: eleve.id, matricule: mat, prenom, nom, vedette: false });
  }

  const [amina, ibrahim, fatima] = tousLesEleves.slice(0, 3);

  // Comptes élèves pour les 3 vedettes
  for (const e of tousLesEleves.slice(0, 3)) {
    const userId = await creerCompte(tenant.id, {
      email: `${e.prenom.toLowerCase()}.eleve@demo-investisseurs.test`,
      prenom: e.prenom,
      nom: e.nom,
      role: "STUDENT",
      siteId: site.id,
    }, motDePasseHash);
    await prisma.eleve.update({ where: { id: e.id }, data: { userId } });
  }

  // 3 parents vedettes
  const parentSpecs = [
    { prenom: "Hassan", nom: "Abdillahi", email: "hassan.abdillahi.parent@demo-investisseurs.test", eleveId: amina.id, lien: "PERE" as const, gardien: true, phone: "+25377123456", profession: "Commerçant" },
    { prenom: "Mahamoud", nom: "Ali", email: "mahamoud.ali.parent@demo-investisseurs.test", eleveId: ibrahim.id, lien: "PERE" as const, gardien: true, phone: "+25377234567", profession: "Commerçant" },
    { prenom: "Hawa", nom: "Djama", email: "hawa.djama.parent@demo-investisseurs.test", eleveId: fatima.id, lien: "MERE" as const, gardien: true, phone: "+25377345678", profession: "Enseignante" },
  ];

  const parents: { id: string; userId: string }[] = [];
  for (const ps of parentSpecs) {
    const userId = await creerCompte(tenant.id, {
      email: ps.email,
      prenom: ps.prenom,
      nom: ps.nom,
      role: "PARENT",
      siteId: site.id,
    }, motDePasseHash);

    const parent = await prisma.parent.create({
      data: {
        tenantId: tenant.id,
        userId,
        nom: ps.nom,
        prenom: ps.prenom,
        email: ps.email,
        phone: ps.phone,
        profession: ps.profession,
      },
    });

    await prisma.eleveParent.create({
      data: {
        eleveId: ps.eleveId,
        parentId: parent.id,
        lien: ps.lien,
        isGardien: ps.gardien,
      },
    });

    await prisma.preferencesParent.create({
      data: {
        tenantId: tenant.id,
        parentId: parent.id,
        langue: "fr",
        alertesActives: true,
        niveauMinimal: "INFO",
        plafondHebdomadaire: 3,
      },
    });

    parents.push({ id: parent.id, userId });
  }

  ok(`${tousLesEleves.length} élèves créés (3 vedettes avec comptes + 15 arrière-plan)`);
  ok("3 parents vedettes avec comptes + préférences");

  // ════════════════════════════════════════════════════════════
  // 5. COMPTES POUR TOUS LES RÔLES
  // ════════════════════════════════════════════════════════════
  etape("5. Comptes pour tous les rôles");

  const rolesComptes: CompteSpec[] = [
    { email: "admin@demo-investisseurs.test", prenom: "Admin", nom: "Demo", role: "TENANT_ADMIN", siteId: site.id },
    { email: "principal@demo-investisseurs.test", prenom: "Abdillahi", nom: "Moumin", role: "PRINCIPAL", siteId: site.id },
    { email: "secretaire@demo-investisseurs.test", prenom: "Fadumo", nom: "Yousuf", role: "SECRETARY", siteId: site.id },
    { email: "conseiller@demo-investisseurs.test", prenom: "Barkat", nom: "Ibrahim", role: "COUNSELOR", siteId: site.id },
    { email: "infirmiere@demo-investisseurs.test", prenom: "Asma", nom: "Hassan", role: "NURSE", siteId: site.id },
    { email: "comptable@demo-investisseurs.test", prenom: "Omar", nom: "Guedi", role: "ACCOUNTANT", siteId: site.id },
    { email: "caissier@demo-investisseurs.test", prenom: "Said", nom: "Ali", role: "CAISSIER", siteId: site.id },
    { email: "surveillant@demo-investisseurs.test", prenom: "Rachid", nom: "Mahamoud", role: "SUPERVISOR", siteId: site.id },
    { email: "coordinateur@demo-investisseurs.test", prenom: "Hassan", nom: "Moussa", role: "SUBJECT_LEAD", siteId: site.id },
    { email: "responsable-site@demo-investisseurs.test", prenom: "Ali", nom: "Farah", role: "SITE_MANAGER", siteId: site.id },
    { email: "inspecteur@demo-investisseurs.test", prenom: "MENFOP", nom: "Inspecteur", role: "INSPECTOR" },
    { email: "super-admin@demo-investisseurs.test", prenom: "Super", nom: "Admin", role: "SUPER_ADMIN" },
  ];

  const userIds: Record<string, string> = {};
  for (const rc of rolesComptes) {
    userIds[rc.role] = await creerCompte(tenant.id, rc, motDePasseHash);
  }

  ok(`${rolesComptes.length} comptes de rôles créés`);

  // ════════════════════════════════════════════════════════════
  // 6. EMPLOI DU TEMPS (sans conflit)
  // ════════════════════════════════════════════════════════════
  etape("6. Emploi du temps (5 jours, sans conflit)");

  const edtCreneaux: { jour: string; debut: string; fin: string; matiereIdx: number; ensIdx: number; salle: string }[] = [
    { jour: "LUNDI", debut: "08:00", fin: "09:00", matiereIdx: 0, ensIdx: 0, salle: "A101" },
    { jour: "LUNDI", debut: "09:00", fin: "10:00", matiereIdx: 0, ensIdx: 0, salle: "A101" },
    { jour: "LUNDI", debut: "10:15", fin: "11:15", matiereIdx: 1, ensIdx: 1, salle: "A102" },
    { jour: "LUNDI", debut: "11:15", fin: "12:15", matiereIdx: 2, ensIdx: 2, salle: "Labo-1" },
    { jour: "LUNDI", debut: "14:00", fin: "15:00", matiereIdx: 3, ensIdx: 3, salle: "A103" },
    { jour: "LUNDI", debut: "15:00", fin: "16:00", matiereIdx: 4, ensIdx: 4, salle: "A104" },
    { jour: "MARDI", debut: "08:00", fin: "09:00", matiereIdx: 1, ensIdx: 1, salle: "A102" },
    { jour: "MARDI", debut: "09:00", fin: "10:00", matiereIdx: 5, ensIdx: 5, salle: "Labo-2" },
    { jour: "MARDI", debut: "10:15", fin: "11:15", matiereIdx: 0, ensIdx: 0, salle: "A101" },
    { jour: "MARDI", debut: "11:15", fin: "12:15", matiereIdx: 2, ensIdx: 2, salle: "Labo-1" },
    { jour: "MARDI", debut: "14:00", fin: "15:00", matiereIdx: 4, ensIdx: 4, salle: "A104" },
    { jour: "MARDI", debut: "15:00", fin: "16:00", matiereIdx: 6, ensIdx: 6, salle: "Gymnase" },
    { jour: "MERCREDI", debut: "08:00", fin: "09:00", matiereIdx: 0, ensIdx: 0, salle: "A101" },
    { jour: "MERCREDI", debut: "09:00", fin: "10:00", matiereIdx: 3, ensIdx: 3, salle: "A103" },
    { jour: "MERCREDI", debut: "10:15", fin: "11:15", matiereIdx: 1, ensIdx: 1, salle: "A102" },
    { jour: "MERCREDI", debut: "11:15", fin: "12:15", matiereIdx: 5, ensIdx: 5, salle: "Labo-2" },
    { jour: "JEUDI", debut: "08:00", fin: "09:00", matiereIdx: 2, ensIdx: 2, salle: "Labo-1" },
    { jour: "JEUDI", debut: "09:00", fin: "10:00", matiereIdx: 2, ensIdx: 2, salle: "Labo-1" },
    { jour: "JEUDI", debut: "10:15", fin: "11:15", matiereIdx: 0, ensIdx: 0, salle: "A101" },
    { jour: "JEUDI", debut: "11:15", fin: "12:15", matiereIdx: 1, ensIdx: 1, salle: "A102" },
    { jour: "JEUDI", debut: "14:00", fin: "15:00", matiereIdx: 4, ensIdx: 4, salle: "A104" },
    { jour: "JEUDI", debut: "15:00", fin: "16:00", matiereIdx: 6, ensIdx: 6, salle: "Gymnase" },
    { jour: "VENDREDI", debut: "08:00", fin: "09:00", matiereIdx: 0, ensIdx: 0, salle: "A101" },
    { jour: "VENDREDI", debut: "09:00", fin: "10:00", matiereIdx: 3, ensIdx: 3, salle: "A103" },
    { jour: "VENDREDI", debut: "10:15", fin: "11:15", matiereIdx: 5, ensIdx: 5, salle: "Labo-2" },
    { jour: "VENDREDI", debut: "11:15", fin: "12:15", matiereIdx: 1, ensIdx: 1, salle: "A102" },
  ];

  for (const c of edtCreneaux) {
    await prisma.emploiTemps.create({
      data: {
        tenantId: tenant.id,
        classeId: classe.id,
        matiereId: matieres[c.matiereIdx].id,
        enseignantId: enseignants[c.ensIdx].id,
        jour: c.jour as never,
        heureDebut: c.debut,
        heureFin: c.fin,
        salle: c.salle,
        annee: ANNEE,
      },
    });
  }

  ok(`${edtCreneaux.length} créneaux EDT (5 jours, sans conflit)`);

  // ════════════════════════════════════════════════════════════
  // 7. ÉVALUATIONS + NOTES T1 et T2
  // ════════════════════════════════════════════════════════════
  etape("7. Évaluations + notes T1 et T2 (dates fixes)");

  function notePour(eleveIdx: number, periode: 1 | 2): number {
    if (eleveIdx === 0) return 16 + Math.floor(Math.random() * 4); // Amina
    if (eleveIdx === 1) return periode === 1 ? 4 + Math.floor(Math.random() * 5) : 9 + Math.floor(Math.random() * 5); // Ibrahim
    if (eleveIdx === 2) return periode === 1 ? 11 + Math.floor(Math.random() * 4) : 7 + Math.floor(Math.random() * 4); // Fatima
    const val = Math.round(11 + (Math.random() - 0.5) * 6);
    return Math.max(4, Math.min(18, val));
  }

  interface EvalSpec { titre: string; matiereIdx: number; competenceId?: string; periode: 1 | 2; jour: string; }

  const evalSpecs: EvalSpec[] = [
    // T1 — Math
    { titre: "DS1 Fractions", matiereIdx: 0, competenceId: compFrac.id, periode: 1, jour: "2025-09-22" },
    { titre: "DS2 Fractions", matiereIdx: 0, competenceId: compFrac.id, periode: 1, jour: "2025-10-13" },
    { titre: "DS3 Fractions", matiereIdx: 0, competenceId: compFrac.id, periode: 1, jour: "2025-11-10" },
    { titre: "DS1 Équations", matiereIdx: 0, competenceId: compEq.id, periode: 1, jour: "2025-10-06" },
    { titre: "DS2 Équations", matiereIdx: 0, competenceId: compEq.id, periode: 1, jour: "2025-10-27" },
    { titre: "DS3 Équations", matiereIdx: 0, competenceId: compEq.id, periode: 1, jour: "2025-11-24" },
    { titre: "DS1 Proportionnalité", matiereIdx: 0, competenceId: compProp.id, periode: 1, jour: "2025-11-03" },
    { titre: "DS2 Proportionnalité", matiereIdx: 0, competenceId: compProp.id, periode: 1, jour: "2025-11-17" },
    { titre: "DS3 Proportionnalité", matiereIdx: 0, competenceId: compProp.id, periode: 1, jour: "2025-12-08" },
    // T2 — Math
    { titre: "DS4 Fractions", matiereIdx: 0, competenceId: compFrac.id, periode: 2, jour: "2026-01-19" },
    { titre: "DS5 Fractions", matiereIdx: 0, competenceId: compFrac.id, periode: 2, jour: "2026-02-09" },
    { titre: "DS4 Équations", matiereIdx: 0, competenceId: compEq.id, periode: 2, jour: "2026-01-26" },
    { titre: "DS5 Équations", matiereIdx: 0, competenceId: compEq.id, periode: 2, jour: "2026-02-16" },
    { titre: "DS4 Proportionnalité", matiereIdx: 0, competenceId: compProp.id, periode: 2, jour: "2026-02-02" },
    { titre: "DS5 Proportionnalité", matiereIdx: 0, competenceId: compProp.id, periode: 2, jour: "2026-02-23" },
    // T1 — Français
    { titre: "DS1 Grammaire", matiereIdx: 1, competenceId: compGram.id, periode: 1, jour: "2025-09-29" },
    { titre: "DS2 Grammaire", matiereIdx: 1, competenceId: compGram.id, periode: 1, jour: "2025-10-20" },
    { titre: "DS3 Grammaire", matiereIdx: 1, competenceId: compGram.id, periode: 1, jour: "2025-11-17" },
    { titre: "DS1 Rédaction", matiereIdx: 1, competenceId: compRedac.id, periode: 1, jour: "2025-10-13" },
    { titre: "DS2 Rédaction", matiereIdx: 1, competenceId: compRedac.id, periode: 1, jour: "2025-11-10" },
    { titre: "DS3 Rédaction", matiereIdx: 1, competenceId: compRedac.id, periode: 1, jour: "2025-12-01" },
    { titre: "DS1 Lecture", matiereIdx: 1, competenceId: compLec.id, periode: 1, jour: "2025-10-06" },
    { titre: "DS2 Lecture", matiereIdx: 1, competenceId: compLec.id, periode: 1, jour: "2025-11-03" },
    { titre: "DS3 Lecture", matiereIdx: 1, competenceId: compLec.id, periode: 1, jour: "2025-11-24" },
    // T2 — Français
    { titre: "DS4 Grammaire", matiereIdx: 1, competenceId: compGram.id, periode: 2, jour: "2026-01-19" },
    { titre: "DS5 Grammaire", matiereIdx: 1, competenceId: compGram.id, periode: 2, jour: "2026-02-16" },
    { titre: "DS4 Rédaction", matiereIdx: 1, competenceId: compRedac.id, periode: 2, jour: "2026-02-02" },
    { titre: "DS5 Rédaction", matiereIdx: 1, competenceId: compRedac.id, periode: 2, jour: "2026-02-23" },
    { titre: "DS4 Lecture", matiereIdx: 1, competenceId: compLec.id, periode: 2, jour: "2026-01-26" },
    { titre: "DS5 Lecture", matiereIdx: 1, competenceId: compLec.id, periode: 2, jour: "2026-02-09" },
    // T1 — Physique
    { titre: "DS1 Mécanique", matiereIdx: 2, competenceId: compMec.id, periode: 1, jour: "2025-10-13" },
    { titre: "DS2 Mécanique", matiereIdx: 2, competenceId: compMec.id, periode: 1, jour: "2025-11-10" },
    { titre: "DS3 Mécanique", matiereIdx: 2, competenceId: compMec.id, periode: 1, jour: "2025-12-01" },
    { titre: "DS1 Électricité", matiereIdx: 2, competenceId: compElec.id, periode: 1, jour: "2025-11-03" },
    { titre: "DS2 Électricité", matiereIdx: 2, competenceId: compElec.id, periode: 1, jour: "2025-11-24" },
    { titre: "DS3 Électricité", matiereIdx: 2, competenceId: compElec.id, periode: 1, jour: "2025-12-08" },
    // T2 — Physique
    { titre: "DS4 Mécanique", matiereIdx: 2, competenceId: compMec.id, periode: 2, jour: "2026-01-19" },
    { titre: "DS5 Mécanique", matiereIdx: 2, competenceId: compMec.id, periode: 2, jour: "2026-02-16" },
    { titre: "DS4 Électricité", matiereIdx: 2, competenceId: compElec.id, periode: 2, jour: "2026-02-02" },
    { titre: "DS5 Électricité", matiereIdx: 2, competenceId: compElec.id, periode: 2, jour: "2026-02-23" },
    // Non-vedettes
    { titre: "DS1 Anglais", matiereIdx: 3, periode: 1, jour: "2025-10-18" },
    { titre: "DS2 Anglais", matiereIdx: 3, periode: 2, jour: "2026-02-18" },
    { titre: "DS1 Histoire-Géo", matiereIdx: 4, periode: 1, jour: "2025-10-19" },
    { titre: "DS2 Histoire-Géo", matiereIdx: 4, periode: 2, jour: "2026-02-19" },
    { titre: "DS1 SVT", matiereIdx: 5, periode: 1, jour: "2025-10-20" },
    { titre: "DS2 SVT", matiereIdx: 5, periode: 2, jour: "2026-02-20" },
    { titre: "DS1 EPS", matiereIdx: 6, periode: 1, jour: "2025-10-21" },
    { titre: "DS2 EPS", matiereIdx: 6, periode: 2, jour: "2026-02-21" },
  ];

  const toutesLesEvals: { id: string; competenceId?: string; jour: string; matiereIdx: number; periode: 1 | 2 }[] = [];

  for (const es of evalSpecs) {
    const periodeId = es.periode === 1 ? periodeT1.id : periodeT2.id;
    const evalRow = await prisma.evaluation.create({
      data: {
        tenantId: tenant.id,
        titre: es.titre,
        type: "CONTROLE",
        classeId: classe.id,
        matiereId: matieres[es.matiereIdx].id,
        periodeId,
        date: d(es.jour),
        duree: 55,
        coefficient: es.matiereIdx < 3 ? 2 : 1,
        statut: "TERMINE",
      },
    });
    if (es.competenceId) {
      await prisma.evaluationCompetence.create({
        data: { tenantId: tenant.id, siteId: site.id, evaluationId: evalRow.id, competenceId: es.competenceId, poids: 1 },
      });
    }
    toutesLesEvals.push({ id: evalRow.id, competenceId: es.competenceId, jour: es.jour, matiereIdx: es.matiereIdx, periode: es.periode });
  }

  // Notes pour tous les élèves
  const notesData: { tenantId: string; eleveId: string; classeId: string; matiereId: string; periodeId: string; type: "CONTROLE"; intitule: string; valeur: number; noteMax: number; coefficient: number; date: Date; isPubliee: boolean; evaluationId: string; saisieParId: string | null }[] = [];

  for (const ev of toutesLesEvals) {
    const periodeId = ev.periode === 1 ? periodeT1.id : periodeT2.id;
    for (let ei = 0; ei < tousLesEleves.length; ei++) {
      const eleve = tousLesEleves[ei];
      const val = notePour(ei, ev.periode);
      // M. Waberi (Français, idx=1) saisit en retard — T1 publié tard, T2 pas encore
      const isWaberiMatiere = ev.matiereIdx === 1;
      const isPubliee = !isWaberiMatiere || (isWaberiMatiere && ev.periode === 1 && d(ev.jour) < d("2025-12-15"));
      notesData.push({
        tenantId: tenant.id,
        eleveId: eleve.id,
        classeId: classe.id,
        matiereId: matieres[ev.matiereIdx].id,
        periodeId,
        type: "CONTROLE" as const,
        intitule: evalSpecs.find((e) => e.titre === evalSpecs[toutesLesEvals.indexOf(ev)].titre)?.titre ?? ev.id,
        valeur: val,
        noteMax: 20,
        coefficient: ev.matiereIdx < 3 ? 2 : 1,
        date: d(ev.jour),
        isPubliee,
        evaluationId: ev.id,
        saisieParId: enseignants[ev.matiereIdx < 7 ? ev.matiereIdx : 0].userId,
      });
    }
  }

  await prisma.note.createMany({ data: notesData as never });
  const notesCreees = await prisma.note.findMany({ where: { tenantId: tenant.id } });

  ok(`${toutesLesEvals.length} évaluations, ${notesCreees.length} notes saisies`);

  // ════════════════════════════════════════════════════════════
  // 8. PUBLICATION DES ÉVÉNEMENTS + DRAINAGE
  // ════════════════════════════════════════════════════════════
  etape("8. Publication des événements + drainage (jumeau d'apprentissage)");

  const { publishEvents } = await import("../src/lib/learnos/events");
  const { drainEvents } = await import("../src/lib/learnos/event-bus");

  const notesPubliees = notesCreees.filter((n) => n.isPubliee);
  for (let i = 0; i < notesPubliees.length; i += 100) {
    const lot = notesPubliees.slice(i, i + 100);
    await publishEvents(
      lot.map((note) => ({
        tenantId: tenant.id,
        siteId: site.id,
        eventType: "note.recorded" as const,
        aggregateType: "note",
        aggregateId: note.id,
        payload: {
          noteId: note.id, eleveId: note.eleveId, classeId: note.classeId,
          matiereId: note.matiereId, periodeId: note.periodeId,
          evaluationId: note.evaluationId, valeur: note.valeur, noteMax: note.noteMax,
          coefficient: note.coefficient, type: note.type, intitule: note.intitule,
          date: note.date.toISOString(), saisieParId: note.saisieParId,
        },
      })),
    );
  }
  ok(`${notesPubliees.length} événements publiés`);

  const resultat = await drainEvents(500);
  ok(`Drainage : ${resultat.processed} traités, ${resultat.failed} échecs, ${resultat.abandoned} abandonnés`);

  if (resultat.failed > 0) {
    const enEchec = await prisma.learnosEvent.findMany({
      where: { tenantId: tenant.id, lastError: { not: null } },
      select: { eventType: true, lastError: true },
      take: 5,
    });
    console.log("   ⚠️  échecs :", JSON.stringify(enEchec, null, 2));
  }

  // Recalculer les profils avec une date de référence dans l'année scolaire
  // (mars 2026) pour que la récence des preuves soit correcte.
  etape("8b. Recalcul des profils avec date de référence (2026-03-01)");

  const { recalculerProfil } = await import("../src/lib/learnos/learning-twin");
  const { recalculerRecommandation } = await import("../src/lib/learnos/recommendation-engine");
  const MAINTENANT = d("2026-03-01");

  const toutesLesCompetences = [compFrac, compEq, compProp, compGram, compRedac, compLec, compMec, compElec];
  let profilsRecalcules = 0;
  let recosCalculees = 0;

  for (const eleve of tousLesEleves) {
    for (const comp of toutesLesCompetences) {
      await recalculerProfil(tenant.id, eleve.id, comp.id, MAINTENANT);
      profilsRecalcules++;
      const bande = await recalculerRecommandation(tenant.id, eleve.id, comp.id, MAINTENANT);
      if (bande) recosCalculees++;
    }
  }

  ok(`${profilsRecalcules} profils recalculés, ${recosCalculees} recommandations générées`);

  // ════════════════════════════════════════════════════════════
  // 9. PRÉDICTIONS
  // ════════════════════════════════════════════════════════════
  etape("9. Prédictions de difficulté (émises avant, vérifiées après)");

  const predictionsData = [
    // Amina : FACILE, correctes
    { eleveId: amina.id, competenceId: compFrac.id, proba: 0.88, diff: "FACILE", mAvant: 0.82, prereq: 0, emise: "2025-09-05", mApres: 0.90, correcte: true, ecart: 0.02, verifiee: "2026-01-15" },
    { eleveId: amina.id, competenceId: compEq.id, proba: 0.85, diff: "FACILE", mAvant: 0.80, prereq: 0, emise: "2025-09-05", mApres: 0.88, correcte: true, ecart: 0.03, verifiee: "2026-01-15" },
    { eleveId: amina.id, competenceId: compProp.id, proba: 0.90, diff: "FACILE", mAvant: 0.85, prereq: 0, emise: "2025-09-05", mApres: 0.92, correcte: true, ecart: 0.02, verifiee: "2026-01-15" },
    // Ibrahim T1 : CRITIQUE, correcte
    { eleveId: ibrahim.id, competenceId: compFrac.id, proba: 0.22, diff: "CRITIQUE", mAvant: 0.20, prereq: 2, emise: "2025-09-05", mApres: 0.28, correcte: true, ecart: 0.06, verifiee: "2025-12-20" },
    // Ibrahim T2 : MODERE, mais fait mieux (remédiation a marché)
    { eleveId: ibrahim.id, competenceId: compEq.id, proba: 0.45, diff: "MODERE", mAvant: 0.35, prereq: 1, emise: "2026-01-10", mApres: 0.58, correcte: false, ecart: 0.13, verifiee: "2026-03-15" },
    // Fatima T1 : MODERE correcte
    { eleveId: fatima.id, competenceId: compFrac.id, proba: 0.62, diff: "MODERE", mAvant: 0.65, prereq: 0, emise: "2025-09-05", mApres: 0.68, correcte: true, ecart: 0.06, verifiee: "2025-12-20" },
    // Fatima T2 : MODERE incorrecte (déclin)
    { eleveId: fatima.id, competenceId: compEq.id, proba: 0.58, diff: "MODERE", mAvant: 0.55, prereq: 0, emise: "2026-01-10", mApres: 0.38, correcte: false, ecart: -0.20, verifiee: "2026-03-15" },
  ];

  for (const p of predictionsData) {
    await prisma.predictionDifficulte.create({
      data: {
        tenantId: tenant.id, siteId: site.id,
        eleveId: p.eleveId, competenceId: p.competenceId, chapitreId: chapMath.id,
        anneeId: annee.id,
        probaReussite: p.proba, difficultePredite: p.diff,
        masteryAvant: p.mAvant, prerequisManquants: p.prereq,
        masteryApres: p.mApres, predictionCorrecte: p.correcte, ecart: p.ecart,
        emiseLe: d(p.emise), verifieeLe: d(p.verifiee),
      },
    });
  }

  // Journal d'apprentissage
  await prisma.journalApprentissage.create({
    data: {
      tenantId: tenant.id, siteId: site.id,
      typeAnalyse: "prediction",
      resume: "Vérification T1 : 5 prédictions, 4 correctes (80% de précision)",
      detail: JSON.stringify({ total: 5, correctes: 4, precision: 0.80 }),
      echantillon: 5, perimetre: "3ème B × Mathématiques × T1",
    },
  });
  await prisma.journalApprentissage.create({
    data: {
      tenantId: tenant.id, siteId: site.id,
      typeAnalyse: "calibration",
      resume: "Calibration 3ème × Math : seuil critique ajusté de 0.35 à 0.33",
      detail: JSON.stringify({ niveau: "3ème", matiere: "MATH", ajustement: -0.02 }),
      echantillon: 30, perimetre: "3ème × Mathématiques",
    },
  });

  ok(`${predictionsData.length} prédictions + 2 entrées journal`);

  // ════════════════════════════════════════════════════════════
  // 10. PLANS DE PROGRESSION + INTERVENTIONS
  // ════════════════════════════════════════════════════════════
  etape("10. Plans de progression + interventions");

  // Plan REMÉDIATION Ibrahim (ACTIF)
  const planIbrahim = await prisma.planProgression.create({
    data: {
      tenantId: tenant.id, siteId: site.id, eleveId: ibrahim.id, matiereId: math.id,
      type: "remediation", origine: "automatique", statut: "ACTIF",
      motif: "2 compétences critiques en Math. Fractions à 0.20, bloque 2 compétences en aval.",
      regleDeclenchee: "learnos.regles.plan_remediation_critique",
      motifParams: { competences: ["Fractions", "Équations"], mastery: [0.20, 0.15], bloquees: 2 },
      responsableUserId: ensHassan.userId, valideParId: ensHassan.userId, valideLe: d("2025-12-10"),
      dateDebut: d("2025-12-15"), dateRevue: d("2026-02-15"), dateFin: d("2026-03-30"),
      parentInforme: true, masteryAvant: 0.25, masteryApres: 0.58,
      resultat: "Amélioration +0.33. Élève sort de la bande critique.",
    },
  });

  await prisma.etapePlan.create({ data: { planId: planIbrahim.id, competenceId: compFrac.id, ordre: 0, action: "Reprise fondamentaux : addition/soustraction de fractions", responsable: "eleve", echeance: d("2026-01-15"), statut: "VALIDE" } });
  await prisma.etapePlan.create({ data: { planId: planIbrahim.id, competenceId: compFrac.id, ordre: 1, action: "Réévaluation : contrôle de rattrapage fractions", responsable: "enseignant", echeance: d("2026-01-22"), statut: "VALIDE" } });
  await prisma.etapePlan.create({ data: { planId: planIbrahim.id, competenceId: compEq.id, ordre: 2, action: "Consolidation : équations simples avec fractions", responsable: "eleve", echeance: d("2026-02-15"), statut: "EN_COURS" } });
  await prisma.etapePlan.create({ data: { planId: planIbrahim.id, competenceId: compEq.id, ordre: 3, action: "Évaluation jalon : équations avec fractions", responsable: "enseignant", echeance: d("2026-03-15"), statut: "A_FAIRE" } });

  // Intervention Ibrahim (COMPLETED)
  await prisma.studentIntervention.create({
    data: {
      tenantId: tenant.id, siteId: site.id, eleveId: ibrahim.id, competenceId: compFrac.id,
      reason: "Maîtrise critique (0.20) sur les fractions, prérequis de 2 compétences",
      evidenceRefs: [], interventionType: "remediation",
      recommendedAction: "Séances de remédiation + exercices ciblés fractions",
      responsibleUserId: ensHassan.userId, status: "COMPLETED",
      startDate: d("2025-12-15"), reviewDate: d("2026-02-15"),
      outcome: "Amélioration +0.33. L'élève a repris les fondamentaux.",
      masteryBefore: 0.25, masteryAfter: 0.58,
      approvedBy: ensHassan.userId, approvedAt: d("2026-02-20"),
    },
  });

  // Plan ENRICHISSEMENT Amina (TERMINE)
  const planAmina = await prisma.planProgression.create({
    data: {
      tenantId: tenant.id, siteId: site.id, eleveId: amina.id, matiereId: math.id,
      type: "approfondissement", origine: "automatique", statut: "TERMINE",
      motif: "3 compétences en bande EXCELLENCE. L'élève s'ennuie sans ouverture.",
      regleDeclenchee: "learnos.regles.plan_enrichissement",
      motifParams: { competences: ["Fractions", "Équations", "Proportionnalité"], mastery: [0.90, 0.88, 0.92] },
      responsableUserId: ensHassan.userId, valideParId: ensHassan.userId, valideLe: d("2026-01-20"),
      dateDebut: d("2026-01-25"), dateRevue: d("2026-03-01"), dateFin: d("2026-03-30"),
      parentInforme: true, masteryAvant: 0.88, masteryApres: 0.95,
      resultat: "Projet de transfert reliant proportionnalité et équations.",
    },
  });
  await prisma.etapePlan.create({ data: { planId: planAmina.id, competenceId: compProp.id, ordre: 0, action: "Projet transfert : modéliser un problème économique", responsable: "eleve", echeance: d("2026-02-15"), statut: "VALIDE" } });
  await prisma.etapePlan.create({ data: { planId: planAmina.id, competenceId: compEq.id, ordre: 1, action: "Ouverture : système d'équations (approche 2nde)", responsable: "eleve", echeance: d("2026-03-15"), statut: "VALIDE" } });

  // Plan CONSOLIDATION Fatima (PROPOSE, non validé)
  const planFatima = await prisma.planProgression.create({
    data: {
      tenantId: tenant.id, siteId: site.id, eleveId: fatima.id, matiereId: math.id,
      type: "remediation", origine: "automatique", statut: "PROPOSE",
      motif: "Déclin : NEEDS_REVIEW sur équations (0.55 → 0.38). Compétence acquise qui se dégrade.",
      regleDeclenchee: "learnos.regles.plan_consolidation_declin",
      motifParams: { competence: "Équations", masteryAvant: 0.55, masteryApres: 0.38, trend: "baisse" },
      responsableUserId: ensHassan.userId,
    },
  });
  await prisma.etapePlan.create({ data: { planId: planFatima.id, competenceId: compEq.id, ordre: 0, action: "Diagnostic : identifier les erreurs types sur équations", responsable: "enseignant", echeance: d("2026-03-22"), statut: "A_FAIRE" } });

  ok("3 plans : remédiation Ibrahim (ACTIF), enrichissement Amina (TERMINE), consolidation Fatima (PROPOSE)");
  ok("1 intervention : Ibrahim (COMPLETED, 0.25 → 0.58)");

  // ════════════════════════════════════════════════════════════
  // 11. EXERCICES
  // ════════════════════════════════════════════════════════════
  etape("11. Exercices : questions, feuilles, assignés, réponses");

  const questions: { id: string; palier: string; competenceId: string }[] = [];
  for (const comp of [compFrac, compEq, compProp]) {
    for (const palier of ["RESTITUTION", "APPLICATION", "CONSOLIDATION", "TRANSFERT", "OUVERTURE"] as const) {
      const q = await prisma.question.create({
        data: {
          tenantId: tenant.id, siteId: site.id, competenceId: comp.id,
          palier: palier as never,
          enonce: `Question ${palier.toLowerCase()} sur ${comp.libelle}`,
          corrige: "Correction détaillée",
          format: "SAISIE_COURTE" as never,
          structure: { reponseAttendue: "42", tolerance: 0.1 },
          bareme: 1, origine: "humain", actif: true,
        },
      });
      questions.push({ id: q.id, palier, competenceId: comp.id });
    }
  }
  // Questions IA (physique) relues par Mme Ismael
  for (const comp of [compMec, compElec]) {
    for (const palier of ["RESTITUTION", "APPLICATION", "CONSOLIDATION"] as const) {
      const q = await prisma.question.create({
        data: {
          tenantId: tenant.id, siteId: site.id, competenceId: comp.id,
          palier: palier as never,
          enonce: `Question IA ${palier.toLowerCase()} sur ${comp.libelle}`,
          corrige: "Correction IA",
          format: "CHOIX_UNIQUE" as never,
          structure: { options: ["A", "B", "C", "D"], bonneReponse: 0 },
          bareme: 1, origine: "ia",
          relueParId: ensIsmael.userId, relueLe: d("2025-10-15"),
          actif: true,
        },
      });
      questions.push({ id: q.id, palier, competenceId: comp.id });
    }
  }

  // Feuille Amina (TRANSFERT + OUVERTURE, terminée)
  const feuilleAmina = await prisma.feuilleExercices.create({
    data: { tenantId: tenant.id, siteId: site.id, eleveId: amina.id, matiereId: math.id, type: "entrainement", statut: "TERMINEE", assigneeLe: d("2026-01-15"), termineeLe: d("2026-01-20") },
  });
  for (const [idx, q] of [
    questions.find((q) => q.palier === "TRANSFERT" && q.competenceId === compFrac.id)!,
    questions.find((q) => q.palier === "OUVERTURE" && q.competenceId === compFrac.id)!,
    questions.find((q) => q.palier === "TRANSFERT" && q.competenceId === compEq.id)!,
  ].entries()) {
    const ex = await prisma.exerciceAssigne.create({
      data: { feuilleId: feuilleAmina.id, questionId: q.id, competenceId: q.competenceId, ordre: idx, palier: q.palier as never, regleDeclenchee: "learnos.regles.exercice_enrichissement", motifParams: { niveau: "EXCELLENCE" }, priorite: idx },
    });
    await prisma.exerciceReponse.create({
      data: { exerciceAssigneId: ex.id, reponse: "42", tentatives: 1, dureeMs: 120000 + idx * 30000, score: 0.95 - idx * 0.05, maxScore: 1, corrigeParId: null, corrigeeLe: d("2026-01-20"), repondueLe: d("2026-01-20") },
    });
  }

  // Feuille Ibrahim (RESTITUTION → CONSOLIDATION, scores qui montent)
  const feuilleIbrahim = await prisma.feuilleExercices.create({
    data: { tenantId: tenant.id, siteId: site.id, eleveId: ibrahim.id, matiereId: math.id, type: "entrainement", statut: "TERMINEE", assigneeLe: d("2025-12-16"), termineeLe: d("2026-01-10") },
  });
  for (const [idx, q] of [
    questions.find((q) => q.palier === "RESTITUTION" && q.competenceId === compFrac.id)!,
    questions.find((q) => q.palier === "APPLICATION" && q.competenceId === compFrac.id)!,
    questions.find((q) => q.palier === "CONSOLIDATION" && q.competenceId === compFrac.id)!,
  ].entries()) {
    const ex = await prisma.exerciceAssigne.create({
      data: { feuilleId: feuilleIbrahim.id, questionId: q.id, competenceId: q.competenceId, ordre: idx, palier: q.palier as never, regleDeclenchee: "learnos.regles.exercice_remediation", motifParams: { niveau: "CRITIQUE" }, priorite: idx },
    });
    await prisma.exerciceReponse.create({
      data: { exerciceAssigneId: ex.id, reponse: String(12 + idx * 12), tentatives: 3 + idx, dureeMs: 300000 + idx * 120000, score: 0.3 + idx * 0.2, maxScore: 1, corrigeParId: null, corrigeeLe: d("2026-01-10"), repondueLe: d("2026-01-10") },
    });
  }

  // Feuille JALON Ibrahim
  const etapeJalon = await prisma.etapePlan.findFirst({ where: { planId: planIbrahim.id, ordre: 1 } });
  const feuilleIbrahimJalon = await prisma.feuilleExercices.create({
    data: { tenantId: tenant.id, siteId: site.id, eleveId: ibrahim.id, matiereId: math.id, type: "jalon", statut: "TERMINEE", etapePlanId: etapeJalon?.id, valideParId: ensHassan.userId, valideeLe: d("2026-01-25"), assigneeLe: d("2026-01-22"), termineeLe: d("2026-01-25") },
  });
  const qAppFrac = questions.find((q) => q.palier === "APPLICATION" && q.competenceId === compFrac.id)!;
  const exJalon = await prisma.exerciceAssigne.create({
    data: { feuilleId: feuilleIbrahimJalon.id, questionId: qAppFrac.id, competenceId: compFrac.id, ordre: 0, palier: "APPLICATION" as never, regleDeclenchee: "learnos.regles.exercice_jalon", motifParams: { etape: "Réévaluation fractions" }, priorite: 0 },
  });
  await prisma.exerciceReponse.create({
    data: { exerciceAssigneId: exJalon.id, reponse: "18", tentatives: 2, dureeMs: 240000, score: 0.65, maxScore: 1, corrigeParId: ensHassan.userId, corrigeeLe: d("2026-01-25"), repondueLe: d("2026-01-25") },
  });

  // Feuille Fatima (EN_COURS — décrochage)
  const feuilleFatima = await prisma.feuilleExercices.create({
    data: { tenantId: tenant.id, siteId: site.id, eleveId: fatima.id, matiereId: math.id, type: "entrainement", statut: "EN_COURS", assigneeLe: d("2026-02-01") },
  });
  const qAppEq = questions.find((q) => q.palier === "APPLICATION" && q.competenceId === compEq.id)!;
  await prisma.exerciceAssigne.create({
    data: { feuilleId: feuilleFatima.id, questionId: qAppEq.id, competenceId: compEq.id, ordre: 0, palier: "APPLICATION" as never, regleDeclenchee: "learnos.regles.exercice_consolidation", motifParams: { niveau: "FRAGILE" }, priorite: 0 },
  });

  // Feuille diagnostic physique (Mme Ismael)
  const feuilleDiag = await prisma.feuilleExercices.create({
    data: { tenantId: tenant.id, siteId: site.id, eleveId: amina.id, matiereId: physique.id, type: "diagnostic", statut: "TERMINEE", assigneeLe: d("2025-10-10"), termineeLe: d("2025-10-15") },
  });
  const qRestMec = questions.find((q) => q.palier === "RESTITUTION" && q.competenceId === compMec.id)!;
  const exDiag = await prisma.exerciceAssigne.create({
    data: { feuilleId: feuilleDiag.id, questionId: qRestMec.id, competenceId: compMec.id, ordre: 0, palier: "RESTITUTION" as never, regleDeclenchee: "learnos.regles.exercice_diagnostic", motifParams: {}, priorite: 0 },
  });
  await prisma.exerciceReponse.create({
    data: { exerciceAssigneId: exDiag.id, reponse: "A", tentatives: 1, dureeMs: 180000, score: 0.85, maxScore: 1, corrigeParId: null, corrigeeLe: d("2025-10-15"), repondueLe: d("2025-10-15") },
  });

  ok(`${questions.length} questions (15 maths + 6 physique IA relues)`);
  ok("5 feuilles : Amina (transfert), Ibrahim (restitution→consolidation + jalon), Fatima (en cours), diagnostic");

  // ════════════════════════════════════════════════════════════
  // 12. ALERTES PARENT + ÉCHANGES PARENT
  // ════════════════════════════════════════════════════════════
  etape("12. Alertes parent + échanges parent (bot)");

  const alertesData = [
    { parentId: parents[1].id, eleveId: ibrahim.id, niveau: "URGENT", cle: "learnos.alertes.maitrise_critique", params: { competence: "Fractions", mastery: 0.20 }, envoyeeLe: d("2025-10-20"), empreinte: "ibrahim-critique-2025-10-20" },
    { parentId: parents[1].id, eleveId: ibrahim.id, niveau: "ATTENTION", cle: "learnos.alertes.baisse_performance", params: { matiere: "Mathématiques", delta: -8 }, envoyeeLe: d("2025-11-15"), empreinte: "ibrahim-baisse-2025-11-15" },
    { parentId: parents[1].id, eleveId: ibrahim.id, niveau: "INFO", cle: "learnos.alertes.progression_positive", params: { competence: "Fractions", delta: 15 }, envoyeeLe: d("2026-02-01"), empreinte: "ibrahim-progression-2026-02-01" },
    { parentId: parents[0].id, eleveId: amina.id, niveau: "INFO", cle: "learnos.alertes.progression_positive", params: { competence: "Mathématiques", delta: 12 }, envoyeeLe: d("2025-11-20"), empreinte: "amina-progression-2025-11-20" },
    { parentId: parents[0].id, eleveId: amina.id, niveau: "INFO", cle: "learnos.alertes.objectif_atteint", params: { competence: "Proportionnalité", mastery: 0.92 }, envoyeeLe: d("2026-01-25"), empreinte: "amina-objectif-2026-01-25" },
    { parentId: parents[2].id, eleveId: fatima.id, niveau: "ATTENTION", cle: "learnos.alertes.baisse_performance", params: { matiere: "Mathématiques", delta: -8 }, envoyeeLe: d("2026-02-15"), empreinte: "fatima-baisse-2026-02-15" },
  ];

  for (const a of alertesData) {
    await prisma.alerteParent.create({
      data: {
        tenantId: tenant.id, siteId: site.id, eleveId: a.eleveId, parentId: a.parentId,
        niveau: a.niveau as never, cle: a.cle, params: a.params,
        canal: "whatsapp", statut: "ENVOYEE", envoyeeLe: a.envoyeeLe, empreinte: a.empreinte,
      },
    });
  }

  const echangesData = [
    { parentId: parents[1].id, eleveId: ibrahim.id, question: "Comment va mon fils en mathématiques ?", intention: "progression", reponse: "Ibrahim a progressé de +33% depuis le plan de remédiation. Maîtrise des fractions : 0.20 → 0.58. Tendance à la hausse." },
    { parentId: parents[1].id, eleveId: ibrahim.id, question: "Quelles sont les difficultés de Ibrahim ?", intention: "difficultes", reponse: "Difficultés critiques sur les fractions (prérequis des équations). Plan de remédiation en place depuis décembre 2025. Fractions consolidées (0.65), équations fragiles (0.45)." },
    { parentId: parents[1].id, eleveId: ibrahim.id, question: "Comment puis-je aider mon fils à la maison ?", intention: "aider", reponse: "Encouragez 15 min d'exercices quotidiens sur les fractions. Le système lui a assigné des exercices de consolidation. Vérifiez qu'il complète ses feuilles à temps." },
    { parentId: parents[0].id, eleveId: amina.id, question: "Amina s'ennuie-t-elle en classe ?", intention: "progression", reponse: "Amina est en bande EXCELLENCE (mastery 0.90). Plan d'enrichissement avec projet de transfert. Elle progresse bien." },
  ];

  for (const e of echangesData) {
    await prisma.echangeParent.create({
      data: { tenantId: tenant.id, siteId: site.id, parentId: e.parentId, eleveId: e.eleveId, canal: "whatsapp", question: e.question, intention: e.intention, reponse: e.reponse, modele: null },
    });
  }

  ok("6 alertes parent + 4 échanges bot");

  // ════════════════════════════════════════════════════════════
  // 13. VIE SCOLAIRE
  // ════════════════════════════════════════════════════════════
  etape("13. Vie scolaire : absences, incidents, sanctions, entretiens, santé");

  // Absences Ibrahim
  for (const a of [
    { jour: "2025-09-25", isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE", heureDebut: "08:00", heureFin: null },
    { jour: "2025-10-14", isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE", heureDebut: "08:00", heureFin: null },
    { jour: "2025-11-05", isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE", heureDebut: "08:00", heureFin: null },
    { jour: "2026-01-20", isRetard: false, motif: "MALADIE", statut: "JUSTIFIEE", heureDebut: "08:00", heureFin: null },
    { jour: "2026-02-10", isRetard: true, motif: "TRANSPORT", statut: "JUSTIFIEE", heureDebut: "08:00", heureFin: "08:30" },
  ]) {
    await prisma.absence.create({
      data: { tenantId: tenant.id, eleveId: ibrahim.id, date: d(a.jour), isRetard: a.isRetard, motif: a.motif as never, statut: a.statut as never, heureDebut: a.heureDebut, heureFin: a.heureFin, parentNotifie: true, parentNotifieAt: d(a.jour) },
    });
  }

  // Absences Fatima
  for (const a of [
    { jour: "2026-01-22", isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE", heureDebut: "08:00", heureFin: null },
    { jour: "2026-02-05", isRetard: false, motif: "MALADIE", statut: "JUSTIFIEE", heureDebut: "08:00", heureFin: null },
    { jour: "2026-02-18", isRetard: true, motif: "INJUSTIFIE", statut: "INJUSTIFIEE", heureDebut: "08:00", heureFin: "08:20" },
  ]) {
    await prisma.absence.create({
      data: { tenantId: tenant.id, eleveId: fatima.id, date: d(a.jour), isRetard: a.isRetard, motif: a.motif as never, statut: a.statut as never, heureDebut: a.heureDebut, heureFin: a.heureFin, parentNotifie: true, parentNotifieAt: d(a.jour) },
    });
  }

  // Incidents + sanction Ibrahim
  const incident1 = await prisma.incident.create({
    data: { tenantId: tenant.id, eleveId: ibrahim.id, rapporteParId: userIds["SUPERVISOR"], type: "RETARD", statut: "RESOLU", gravite: 1, description: "Retard répété en cours de mathématiques", lieu: "Salle A101", date: d("2025-10-14"), actionPrise: "Entretien CPE + avertissement verbal", resoluParId: userIds["SUPERVISOR"], dateResolution: d("2025-10-16") },
  });
  await prisma.sanction.create({ data: { incidentId: incident1.id, type: "AVERTISSEMENT", description: "Avertissement pour retards répétés", dateDebut: d("2025-10-16"), parentNotifie: true } });

  await prisma.incident.create({
    data: { tenantId: tenant.id, eleveId: ibrahim.id, rapporteParId: ensWaberi.userId, type: "BAVARDAGE", statut: "RESOLU", gravite: 1, description: "Bavardage perturbant le cours de français", lieu: "Salle A102", date: d("2025-11-12"), actionPrise: "Rappel des règles", resoluParId: ensWaberi.userId, dateResolution: d("2025-11-12") },
  });

  // Entretien conseiller Ibrahim
  await prisma.entretienConseiller.create({
    data: { tenantId: tenant.id, siteId: site.id, eleveId: ibrahim.id, conseillerId: userIds["COUNSELOR"], date: d("2025-12-05"), motif: "Absences répétées et difficultés en mathématiques", compteRendu: "Décrochage lié aux difficultés en math. Fractions non acquises, bloquant les équations. Plan de remédiation recommandé. Élève coopérant.", decisions: "Plan de remédiation. Suivi hebdomadaire. Contact parent.", suivi: "Suivi hebdomadaire vendredis. Point situation 15 février 2026.", statut: "REALISE", prochainRendezVous: d("2026-02-15") },
  });

  // Fiches sanitaires + passages infirmerie
  for (const e of [amina, ibrahim, fatima]) {
    await prisma.ficheSanitaire.create({
      data: { tenantId: tenant.id, siteId: site.id, eleveId: e.id, allergies: e.id === ibrahim.id ? ["Pollen"] : [], traitements: e.id === fatima.id ? { medicament: "Ventoline", posologie: "1 bouffée si crise", duree: "permanent" } : Prisma.JsonNull, contreIndicationsSport: false, contactsUrgence: [{ nom: "Parent", relation: "Père/Mère", telephone: "+25377123456" }], protocoleUrgence: e.id === fatima.id ? "Asthme : ventoline en cas de crise" : null, vaccinations: [{ vaccin: "DTCP", date: "2018-03-15", rappel: "2025-03-15" }] },
    });
  }
  await prisma.passageInfirmerie.create({ data: { tenantId: tenant.id, siteId: site.id, eleveId: fatima.id, date: d("2026-02-12"), motif: "Crise d'asthme", soin: "Ventoline, repos 20 min", suite: "retour_en_cours", retourCours: true, dureeMin: 25, infirmierId: userIds["NURSE"] } });
  await prisma.passageInfirmerie.create({ data: { tenantId: tenant.id, siteId: site.id, eleveId: ibrahim.id, date: d("2025-11-20"), motif: "Maux de tête", soin: "Repos 15 min, hydratation", suite: "retour_en_cours", retourCours: true, dureeMin: 15, infirmierId: userIds["NURSE"] } });

  ok("8 absences, 2 incidents + 1 sanction, 1 entretien conseiller, 3 fiches sanitaires, 2 passages infirmerie");

  // ════════════════════════════════════════════════════════════
  // 14. BULLETINS T1 + T2
  // ════════════════════════════════════════════════════════════
  etape("14. Bulletins T1 + T2 avec moyennes de classe réelles");

  async function moyenneEleveMatiere(eleveId: string, matiereId: string, periodeId: string): Promise<number | null> {
    const notes = await prisma.note.findMany({ where: { tenantId: tenant.id, eleveId, matiereId, periodeId, isPubliee: true } });
    if (notes.length === 0) return null;
    const somme = notes.reduce((acc, n) => acc + n.valeur * n.coefficient, 0);
    const coefTotal = notes.reduce((acc, n) => acc + n.coefficient, 0);
    return coefTotal > 0 ? somme / coefTotal : null;
  }

  async function moyenneClasseMatiere(matiereId: string, periodeId: string) {
    const moyennes: number[] = [];
    for (const e of tousLesEleves) {
      const m = await moyenneEleveMatiere(e.id, matiereId, periodeId);
      if (m !== null) moyennes.push(m);
    }
    if (moyennes.length === 0) return { moyenne: 0, max: 0, min: 0, effectif: 0 };
    return { moyenne: moyennes.reduce((a, b) => a + b, 0) / moyennes.length, max: Math.max(...moyennes), min: Math.min(...moyennes), effectif: moyennes.length };
  }

  async function calculerRangs(periodeId: string) {
    const moyennesParEleve: { eleveId: string; moyenne: number }[] = [];
    for (const e of tousLesEleves) {
      let sommePonderee = 0, coefTotal = 0;
      for (const m of matieres) {
        const moy = await moyenneEleveMatiere(e.id, m.id, periodeId);
        if (moy !== null) { sommePonderee += moy * m.coefficient; coefTotal += m.coefficient; }
      }
      if (coefTotal > 0) moyennesParEleve.push({ eleveId: e.id, moyenne: sommePonderee / coefTotal });
    }
    moyennesParEleve.sort((a, b) => b.moyenne - a.moyenne);
    const rangs = new Map<string, { rang: number; moyenne: number; effectif: number }>();
    moyennesParEleve.forEach((e, i) => rangs.set(e.eleveId, { rang: i + 1, moyenne: e.moyenne, effectif: moyennesParEleve.length }));
    return rangs;
  }

  async function creerBulletins(periodeId: string, publishedAt: string, isPublie: boolean) {
    const rangs = await calculerRangs(periodeId);
    const moyClasse = Array.from(rangs.values()).reduce((acc, r) => acc + r.moyenne, 0) / (rangs.size || 1);
    const moyMax = Math.max(...Array.from(rangs.values()).map((r) => r.moyenne));

    for (const e of tousLesEleves) {
      const rangInfo = rangs.get(e.id);
      if (!rangInfo) continue;

      let decision: string, appreciation: string;
      if (e.id === amina.id) {
        decision = "Félicitations";
        appreciation = isPublie ? "Excellent trimestre. Amina maîtrise toutes les compétences." : "Très bon trimestre.";
      } else if (e.id === ibrahim.id) {
        decision = periodeId === periodeT1.id ? "Redoublement" : "Passage";
        appreciation = periodeId === periodeT1.id ? "Trimestre difficile. Plan de remédiation mis en place." : "Très nette progression. Le plan de remédiation porte ses fruits.";
      } else if (e.id === fatima.id) {
        decision = periodeId === periodeT1.id ? "Passage" : "Redoublement";
        appreciation = periodeId === periodeT1.id ? "Trimestre correct. Fatima peut mieux faire." : "Trimestre en recul. Décrochage en mathématiques.";
      } else {
        decision = rangInfo.moyenne >= 10 ? "Passage" : "Redoublement";
        appreciation = rangInfo.moyenne >= 14 ? "Très bon trimestre." : rangInfo.moyenne >= 10 ? "Trimestre satisfaisant." : "Trimestre insuffisant.";
      }

      const heuresAbs = e.id === ibrahim.id ? (periodeId === periodeT1.id ? 12 : 4) : e.id === fatima.id ? (periodeId === periodeT1.id ? 0 : 6) : 0;

      const bulletin = await prisma.bulletin.create({
        data: {
          tenantId: tenant.id, eleveId: e.id, periodeId,
          moyenneGenerale: rangInfo.moyenne, moyenneClasse: moyClasse, moyennePremier: moyMax,
          rang: rangInfo.rang, effectifClasse: rangInfo.effectif, heuresAbsence: heuresAbs,
          appreciation, decision,
          statut: isPublie ? "PUBLIE" : "BROUILLON",
          isPublie,
          publishedAt: isPublie ? d(publishedAt) : null,
        },
      });

      for (const m of matieres) {
        const moyEleve = await moyenneEleveMatiere(e.id, m.id, periodeId);
        if (moyEleve === null) continue;
        const stats = await moyenneClasseMatiere(m.id, periodeId);
        const ens = enseignants.find((en) => en.spec.matiereIdx === matieres.indexOf(m));
        await prisma.bulletinMatiere.create({
          data: {
            tenantId: tenant.id, bulletinId: bulletin.id, matiereId: m.id,
            nomProfesseur: ens ? `${ens.spec.prenom} ${ens.spec.nom}` : null,
            coefficient: m.coefficient, moyenneEleve: moyEleve, rang: 1,
            moyenneMax: stats.max, moyenneMin: stats.min,
            appreciation: moyEleve >= 16 ? "Très bien" : moyEleve >= 14 ? "Bien" : moyEleve >= 12 ? "Assez bien" : moyEleve >= 10 ? "Passable" : "Insuffisant",
          },
        });
      }
    }
  }

  await creerBulletins(periodeT1.id, "2025-12-20", true);
  await creerBulletins(periodeT2.id, "2026-03-20", true);

  ok("Bulletins T1 (publiés) + T2 (publiés) pour 18 élèves avec moyennes de classe");

  // ════════════════════════════════════════════════════════════
  // 15. FACTURES + PAIEMENTS
  // ════════════════════════════════════════════════════════════
  etape("15. Factures + paiements");

  const montantMensualite = 15000;
  for (const [idx, e] of [amina, ibrahim, fatima].entries()) {
    for (let mois = 10; mois <= 12; mois++) {
      const facture = await prisma.facture.create({
        data: {
          tenantId: tenant.id, siteId: site.id, eleveId: e.id, anneeId: annee.id,
          numero: `FAC-2025-${mois}-${String(idx + 1).padStart(3, "0")}`,
          libelle: `Scolarité octobre ${mois === 10 ? "octobre" : mois === 11 ? "novembre" : "décembre"} 2025`,
          montant: montantMensualite, devise: "DJF",
          statut: e.id === ibrahim.id && mois >= 11 ? "EN_RETARD" : "PAYEE",
          echeance: d(`2025-${String(mois).padStart(2, "0")}-15`),
          mois: `2025-${String(mois).padStart(2, "0")}`,
        },
      });
      // Paiement (sauf Ibrahim en retard)
      if (!(e.id === ibrahim.id && mois >= 11)) {
        await prisma.paiement.create({
          data: { factureId: facture.id, montant: montantMensualite, devise: "DJF", methode: "espèces", date: d(`2025-${String(mois).padStart(2, "0")}-14`), enregistreParId: userIds["CAISSIER"] },
        });
      }
    }
    // T2
    for (let mois = 1; mois <= 2; mois++) {
      const facture = await prisma.facture.create({
        data: {
          tenantId: tenant.id, siteId: site.id, eleveId: e.id, anneeId: annee.id,
          numero: `FAC-2026-${String(mois).padStart(2, "0")}-${String(idx + 1).padStart(3, "0")}`,
          libelle: `Scolarité ${mois === 1 ? "janvier" : "février"} 2026`,
          montant: montantMensualite, devise: "DJF",
          statut: e.id === ibrahim.id ? "EN_RETARD" : "PAYEE",
          echeance: d(`2026-${String(mois).padStart(2, "0")}-15`),
          mois: `2026-${String(mois).padStart(2, "0")}`,
        },
      });
      if (e.id !== ibrahim.id) {
        await prisma.paiement.create({
          data: { factureId: facture.id, montant: montantMensualite, devise: "DJF", methode: "espèces", date: d(`2026-${String(mois).padStart(2, "0")}-14`), enregistreParId: userIds["CAISSIER"] },
        });
      }
    }
  }

  // Relance pour Ibrahim
  const factureIbrahimRetard = await prisma.facture.findFirst({ where: { tenantId: tenant.id, eleveId: ibrahim.id, statut: "EN_RETARD" }, orderBy: { createdAt: "asc" } });
  if (factureIbrahimRetard) {
    await prisma.relance.create({
      data: { tenantId: tenant.id, factureId: factureIbrahimRetard.id, niveau: 1, canal: "whatsapp", message: "Rappel : votre facture de scolarité est en retard. Merci de régulariser.", envoyeeParId: userIds["ACCOUNTANT"], envoyeeLe: d("2026-02-01") },
    });
  }

  ok("15 factures (5 par élève vedette) + paiements + 1 relance pour Ibrahim");

  // ════════════════════════════════════════════════════════════
  // 16. KPI SNAPSHOTS
  // ════════════════════════════════════════════════════════════
  etape("16. KpiSnapshot mensuels");

  const kpiKeys = [
    { key: "taux_reussite_global", valeurs: [0.72, 0.75, 0.78, 0.80, 0.82], cible: 0.80 },
    { key: "taux_absenteisme", valeurs: [0.05, 0.04, 0.03, 0.02, 0.03], cible: 0.03 },
    { key: "couverture_programme", valeurs: [0.60, 0.70, 0.85, 0.95, 1.0], cible: 1.0 },
    { key: "taux_recouvrement", valeurs: [0.85, 0.88, 0.90, 0.92, 0.88], cible: 0.95 },
    { key: "incidents_count", valeurs: [5, 3, 2, 1, 2], cible: 0 },
    { key: "predictions_precision", valeurs: [0.75, 0.80, 0.80, 0.85, 0.87], cible: 0.85 },
    { key: "plans_actifs", valeurs: [0, 1, 1, 2, 2], cible: 0 },
  ];

  const moisKpi = ["2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"];

  for (const kpi of kpiKeys) {
    for (let i = 0; i < moisKpi.length; i++) {
      await prisma.kpiSnapshot.create({
        data: {
          tenantId: tenant.id, siteId: site.id,
          role: "TENANT_ADMIN",
          kpiKey: kpi.key,
          valeur: kpi.valeurs[i],
          cible: kpi.cible,
          periode: d(moisKpi[i]),
        },
      });
    }
  }

  ok(`${kpiKeys.length * moisKpi.length} KPI snapshots (7 indicateurs × 5 mois)`);

  // ════════════════════════════════════════════════════════════
  // RÉSULTATS
  // ════════════════════════════════════════════════════════════
  titre("RÉSULTATS");

  const preuves = await prisma.learningEvidence.count({ where: { tenantId: tenant.id } });
  const profils = await prisma.studentLearningProfile.count({ where: { tenantId: tenant.id } });
  const recos = await prisma.recommandation.count({ where: { tenantId: tenant.id } });
  const plans = await prisma.planProgression.count({ where: { tenantId: tenant.id } });
  const predictions = await prisma.predictionDifficulte.count({ where: { tenantId: tenant.id } });
  const alertes = await prisma.alerteParent.count({ where: { tenantId: tenant.id } });

  console.log(`\nPreuves d'apprentissage : ${preuves}`);
  console.log(`Profils de maîtrise     : ${profils}`);
  console.log(`Recommandations         : ${recos}`);
  console.log(`Plans de progression    : ${plans}`);
  console.log(`Prédictions             : ${predictions}`);
  console.log(`Alertes parent          : ${alertes}`);

  // Profils des 3 vedettes
  for (const e of [amina, ibrahim, fatima]) {
    console.log(`\n┌─ ${e.prenom} ${e.nom} ${"─".repeat(50 - e.prenom.length - e.nom.length)}`);
    const profilsEleve = await prisma.studentLearningProfile.findMany({
      where: { tenantId: tenant.id, eleveId: e.id },
      include: { competence: { select: { libelle: true } } },
      orderBy: { competenceId: "asc" },
    });
    for (const p of profilsEleve) {
      const maitrise = p.masteryStatus === "UNKNOWN" ? "—" : `${Math.round(p.masteryScore * 100)}%`;
      console.log(`│  ${p.competence.libelle.padEnd(40)} ${maitrise.padStart(5)}  ${p.masteryStatus.padEnd(13)} ${p.trend} (${p.evidenceCount})`);
    }
    const recosEleve = await prisma.recommandation.findMany({
      where: { tenantId: tenant.id, eleveId: e.id },
      include: { competence: { select: { libelle: true } } },
    });
    for (const r of recosEleve) {
      console.log(`│  ⟹ [${r.statut}] ${r.competence.libelle} — ${r.actionProposee}`);
    }
    if (recosEleve.length === 0) console.log("│  aucune recommandation");
    console.log("└" + "─".repeat(60));
  }

  // Comptes de connexion
  titre("COMPTES DE CONNEXION");
  console.log(`\nMot de passe pour tous : ${MOT_DE_PASSE}\n`);
  console.log("Rôles d'administration :");
  console.log("  admin@demo-investisseurs.test          (TENANT_ADMIN)");
  console.log("  principal@demo-investisseurs.test       (PRINCIPAL)");
  console.log("  secretaire@demo-investisseurs.test      (SECRETARY)");
  console.log("  conseiller@demo-investisseurs.test      (COUNSELOR)");
  console.log("  infirmiere@demo-investisseurs.test      (NURSE)");
  console.log("  comptable@demo-investisseurs.test       (ACCOUNTANT)");
  console.log("  caissier@demo-investisseurs.test        (CAISSIER)");
  console.log("  surveillant@demo-investisseurs.test     (SUPERVISOR)");
  console.log("  coordinateur@demo-investisseurs.test    (SUBJECT_LEAD)");
  console.log("  responsable-site@demo-investisseurs.test (SITE_MANAGER)");
  console.log("  inspecteur@demo-investisseurs.test      (INSPECTOR)");
  console.log("  super-admin@demo-investisseurs.test     (SUPER_ADMIN)");
  console.log("\nEnseignants :");
  console.log("  khadra.hassan@demo-investisseurs.test   (CLASS_TEACHER — Math, prof principal)");
  console.log("  said.waberi@demo-investisseurs.test     (TEACHER — Français, en retard)");
  console.log("  leyla.ismael@demo-investisseurs.test    (TEACHER — Physique, innovante)");
  console.log("\nÉlèves :");
  console.log("  amina.eleve@demo-investisseurs.test     (STUDENT — Excellence)");
  console.log("  ibrahim.eleve@demo-investisseurs.test   (STUDENT — En difficulté qui remonte)");
  console.log("  fatima.eleve@demo-investisseurs.test    (STUDENT — Moyenne qui décline)");
  console.log("\nParents :");
  console.log("  hassan.abdillahi.parent@demo-investisseurs.test  (PARENT — Amina)");
  console.log("  mahamoud.ali.parent@demo-investisseurs.test      (PARENT — Ibrahim)");
  console.log("  hawa.djama.parent@demo-investisseurs.test        (PARENT — Fatima)");

  titre("DÉMONSTRATION PRÊTE");
  console.log("\nPour supprimer : npx tsx scripts/demo-investisseurs.ts --clean\n");
}

main().catch((e) => {
  console.error("Erreur fatale :", e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
