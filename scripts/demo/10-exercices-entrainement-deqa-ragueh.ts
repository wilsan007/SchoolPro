/**
 * Démo Ambouli — étape 10 : feuilles d'entraînement pour Deqa et Ragueh.
 *
 * CE QUI MANQUAIT
 * Les deux comptes de test de la démonstration — Deqa Mahamoud (2nde D,
 * en difficulté) et Ragueh Mahamoud (1ère S, bonne élève) — n'avaient que
 * quelques feuilles éparses. Pour montrer l'entraînement adaptatif sur les
 * matières demandées (Mathématiques, Philosophie, Français, Physique-Chimie,
 * SVT), il faut une feuille d'entraînement par matière et par élève, alimentée
 * à partir de la banque de questions existante.
 *
 * CE QUE FAIT LE SCRIPT
 * Pour chaque couple élève × matière :
 *   1. Une FeuilleExercices de type "entrainement", statut ASSIGNEE ;
 *   2. Quatre ExerciceAssigne tirés de la banque (questions actives des
 *      compétences du niveau de l'élève), ordonnés, avec la règle
 *      "exercice_entretien" — celle qui complète une feuille sans urgence.
 *
 * Aucune réponse n'est créée : les feuilles doivent rester à faire, c'est
 * l'objet de la démonstration.
 *
 * DÉTERMINISTE ET IDEMPOTENT.
 * Les identifiants sont dérivés de l'élève et de la matière ; un second
 * lancement ne crée rien de plus (createMany + skipDuplicates).
 *
 *   pnpm exec tsx scripts/demo/10-exercices-entrainement-deqa-ragueh.ts
 */

import { PrismaClient, StatutFeuille } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT = "tenant-ambouli";
const SITE = "site-ambouli";

/** Les deux comptes de la démonstration (cf. docs/DEMO-AMBOULI.md). */
const ELEVES = [
  { id: "ele-ambouli-2026-0421", cle: "deqa", niveau: "2nde" }, // Deqa Mahamoud, 2nde D
  { id: "ele-ambouli-2026-0449", cle: "ragueh", niveau: "1ere" }, // Ragueh Mahamoud, 1ère S
] as const;

/**
 * Matières demandées. La chimie est enseignée en "Physique-Chimie" (mat-PC)
 * dans l'établissement : c'est cette matière qui porte l'exercice de chimie.
 */
const MATIERES = [
  { id: "mat-MATH", cle: "math" },
  { id: "mat-PHILO", cle: "philo" },
  { id: "mat-FR", cle: "fr" },
  { id: "mat-PC", cle: "pc" },
  { id: "mat-SVT", cle: "svt" },
] as const;

/** Questions par feuille. */
const NB_QUESTIONS = 4;

async function main() {
  console.log("🌱 [demo 10/10] Feuilles d'entraînement Deqa & Ragueh...");

  let feuillesCreees = 0;
  let exercicesCreees = 0;
  let feuillesIgnorees = 0;

  for (const eleve of ELEVES) {
    for (const matiere of MATIERES) {
      const feuilleId = `feu-entrainement-${eleve.cle}-${matiere.cle}`;

      // ── Banque de questions du niveau de l'élève ────────────
      const questions = await prisma.question.findMany({
        where: {
          actif: true,
          competence: {
            chapitre: { matiereId: matiere.id, niveau: eleve.niveau },
          },
        },
        // Tri déterminant : même feuille à chaque lancement.
        orderBy: { id: "asc" },
        // Un maximum par compétence pour couvrir le programme.
        distinct: ["competenceId"],
        take: NB_QUESTIONS,
      });

      if (questions.length === 0) {
        console.warn(
          `  ⚠️  Aucune question ${matiere.id} / ${eleve.niveau} — feuille ${feuilleId} sautée`,
        );
        continue;
      }

      // ── Feuille ─────────────────────────────────────────────
      await prisma.feuilleExercices.upsert({
        where: { id: feuilleId },
        update: {}, // déjà là : on ne touche pas à l'existant
        create: {
          id: feuilleId,
          tenantId: TENANT,
          siteId: SITE,
          eleveId: eleve.id,
          matiereId: matiere.id,
          type: "entrainement",
          statut: StatutFeuille.ASSIGNEE,
          assigneeLe: new Date(),
        },
      });

      // ── Exercices assignés ──────────────────────────────────
      const exercices = questions.map((q, i) => ({
        id: `exo-entrainement-${eleve.cle}-${matiere.cle}-${i + 1}`,
        feuilleId,
        questionId: q.id,
        competenceId: q.competenceId,
        ordre: i + 1,
        palier: q.palier,
        regleDeclenchee: "exercice_entretien",
        motifParams: { matiere: matiere.id, niveau: eleve.niveau },
        priorite: 8, // exercice_entretien ferme la marche (PRIORITE_REGLE)
      }));

      const res = await prisma.exerciceAssigne.createMany({
        data: exercices,
        skipDuplicates: true,
      });
      exercicesCreees += res.count;

      if (res.count === 0) feuillesIgnorees++;
      else feuillesCreees++;
    }
  }

  console.log(`  ✅ Feuilles d'entraînement : ${feuillesCreees} créées (${feuillesIgnorees} déjà présentes)`);
  console.log(`  ✅ Exercices assignés : ${exercicesCreees}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
