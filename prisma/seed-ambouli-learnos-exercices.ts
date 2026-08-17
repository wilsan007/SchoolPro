/**
 * seed-ambouli-learnos-exercices.ts — Exercices adaptés LEARNOS.
 *
 * - Question : banque de questions par compétence × palier
 * - FeuilleExercices : feuilles assignées à des élèves
 * - ExerciceAssigne : exercices composés avec règle déclenchée
 * - ExerciceReponse : réponses d'élèves avec score, tentatives, durée
 */

import { PrismaClient, PalierExercice, FormatQuestion, StatutFeuille } from "@prisma/client";
import { setSeed, randInt, pick, chance, clamp, gauss, dateStr } from "./seed-ambouli-helpers";
import type { RefData } from "./seed-ambouli-ref";
import type { UsersData } from "./seed-ambouli-users";
import type { ClassesData } from "./seed-ambouli-classes";
import type { LearnosCurriculumData } from "./seed-ambouli-learnos-curriculum";

const PALIERS = [PalierExercice.RESTITUTION, PalierExercice.APPLICATION, PalierExercice.CONSOLIDATION, PalierExercice.TRANSFERT, PalierExercice.OUVERTURE];

export async function seedLearnosExercices(
  prisma: PrismaClient,
  ref: RefData,
  users: UsersData,
  classes: ClassesData,
  curriculum: LearnosCurriculumData,
): Promise<void> {
  setSeed(20250301);
  console.log("🌱 [10/12] Création des exercices adaptés LEARNOS (questions, feuilles, réponses)...");

  let questionCount = 0;
  let feuilleCount = 0;
  let exerciceCount = 0;
  let reponseCount = 0;

  // ── Banque de questions ─────────────────────────────────────
  // Pour chaque compétence, créer 3-5 questions par palier
  for (const site of ["ambouli", "arhiba"] as const) {
    const siteCode = site === "ambouli" ? "AMB" : "ARH";

    // Récupérer toutes les compétences du site
    const comps = await prisma.competence.findMany({
      where: { tenantId: ref.tenantId, siteId: ref.sites[site] },
    });

    for (const comp of comps) {
      // 2-3 questions par palier (limité pour performance)
      for (const palier of PALIERS) {
        const nbQuestions = randInt(1, 3);
        for (let q = 0; q < nbQuestions; q++) {
          const format = pick([FormatQuestion.CHOIX_UNIQUE, FormatQuestion.SAISIE_COURTE, FormatQuestion.SAISIE_COURTE, FormatQuestion.ETAPES_GUIDEES]);
          const enonce = `${comp.libelle} - ${palier} - Question ${q + 1}`;
          let structure: any = null;
          if (format === FormatQuestion.CHOIX_UNIQUE) {
            structure = {
              propositions: ["Réponse A", "Réponse B", "Réponse C", "Réponse D"],
              reponse: 0,
            };
          } else if (format === FormatQuestion.SAISIE_COURTE) {
            structure = { reponse: "42", tolerance: 0.5 };
          } else if (format === FormatQuestion.ETAPES_GUIDEES) {
            structure = {
              etapes: [
                { enonce: "Étape 1", reponse: "10" },
                { enonce: "Étape 2", reponse: "20" },
              ],
            };
          }

          await prisma.question.create({
            data: {
              tenantId: ref.tenantId,
              siteId: ref.sites[site],
              competenceId: comp.id,
              palier,
              enonce,
              corrige: "Correction détaillée de la question",
              format,
              structure,
              bareme: 1,
              origine: pick(["humain", "humain", "ia"]),
              relueParId: chance(0.7) ? pick(users.teachers[site]).userId : null,
              relueLe: chance(0.7) ? dateStr(2025, randInt(9, 12), randInt(1, 28)) : null,
              actif: true,
            },
          });
          questionCount++;
        }
      }
    }
  }
  console.log(`  ✅ Questions: ${questionCount} (banque par compétence × palier)`);

  // ── Feuilles d'exercices + Exercices assignés + Réponses ────
  // Pour un échantillon d'élèves (limiter pour performance)
  for (const site of ["ambouli", "arhiba"] as const) {
    const siteCode = site === "ambouli" ? "AMB" : "ARH";

    for (const annee of ["2024-2025", "2025-2026"]) {
      const siteClasses = classes.classesBySiteYear[`${site}-${annee}`] || [];
      const anneeDeb = parseInt(annee.split("-")[0]);

      for (const cls of siteClasses) {
        const eleves = classes.elevesByClass[cls.id] || [];
        if (eleves.length === 0) continue;

        // Pour 30% des élèves, créer des feuilles d'exercices
        const elevesWithFeuilles = eleves.filter(() => chance(0.3));
        for (const el of elevesWithFeuilles) {
          // Récupérer les compétences de cette classe × matière (MATH principalement)
          const matiereId = ref.matieres[`${siteCode}-MATH`];
          if (!matiereId) continue;
          const comps = await prisma.competence.findMany({
            where: {
              tenantId: ref.tenantId,
              siteId: ref.sites[site],
              chapitre: { matiereId, niveau: cls.niveau },
            },
            take: 3,
          });
          if (comps.length === 0) continue;

          // 1-2 feuilles par élève
          const nbFeuilles = randInt(1, 2);
          for (let f = 0; f < nbFeuilles; f++) {
            const type = pick(["entrainement", "entrainement", "diagnostic", "jalon"]);
            const statut = pick([StatutFeuille.ASSIGNEE, StatutFeuille.EN_COURS, StatutFeuille.TERMINEE, StatutFeuille.TERMINEE]);
            const feuille = await prisma.feuilleExercices.create({
              data: {
                tenantId: ref.tenantId,
                siteId: ref.sites[site],
                eleveId: el.id,
                matiereId,
                type,
                statut,
                assigneeLe: dateStr(anneeDeb + (f === 0 ? 0 : 1), randInt(10, 12) <= 12 ? randInt(10, 12) : randInt(1, 6), randInt(1, 28)),
                termineeLe: statut === StatutFeuille.TERMINEE ? dateStr(anneeDeb + 1, randInt(1, 6), randInt(1, 28)) : null,
                valideParId: type === "jalon" && statut === StatutFeuille.TERMINEE ? pick(users.teachers[site]).userId : null,
                valideeLe: type === "jalon" && statut === StatutFeuille.TERMINEE ? dateStr(anneeDeb + 1, randInt(2, 6), randInt(1, 28)) : null,
              },
            });
            feuilleCount++;

            // 3-5 exercices par feuille
            const nbExercices = randInt(3, 5);
            for (let ex = 0; ex < nbExercices; ex++) {
              const comp = pick(comps);
              // Trouver une question de cette compétence
              const question = await prisma.question.findFirst({
                where: { competenceId: comp.id, actif: true },
                skip: randInt(0, 5),
              });
              if (!question) continue;

              const palier = question.palier;
              const exercice = await prisma.exerciceAssigne.create({
                data: {
                  feuilleId: feuille.id,
                  questionId: question.id,
                  competenceId: comp.id,
                  ordre: ex + 1,
                  palier,
                  regleDeclenchee: pick([
                    "learnos.regles.exercice_remediation",
                    "learnos.regles.exercice_consolidation",
                    "learnos.regles.exercice_transfert",
                    "learnos.regles.exercice_diagnostic",
                  ]),
                  motifParams: { competence: comp.libelle, palier },
                  priorite: randInt(1, 5),
                },
              });
              exerciceCount++;

              // Réponse (si la feuille est terminée ou en cours)
              if (statut === StatutFeuille.TERMINEE || statut === StatutFeuille.EN_COURS) {
                const score = statut === StatutFeuille.TERMINEE ? clamp(gauss(0.6, 0.25), 0, 1) : null;
                await prisma.exerciceReponse.create({
                  data: {
                    exerciceAssigneId: exercice.id,
                    reponse: score !== null ? (question.format === FormatQuestion.CHOIX_UNIQUE ? "A" : "42") : null,
                    etapes: question.format === FormatQuestion.ETAPES_GUIDEES ? [{ etape: 1, reponse: "10", tentatives: 1 }, { etape: 2, reponse: "20", tentatives: 2 }] : undefined,
                    tentatives: randInt(1, 4),
                    dureeMs: randInt(30000, 300000),
                    score: score !== null ? Math.round(score * question.bareme * 100) / 100 : null,
                    maxScore: question.bareme,
                    corrigeParId: score !== null && chance(0.3) ? pick(users.teachers[site]).userId : null,
                    corrigeeLe: score !== null ? dateStr(anneeDeb + 1, randInt(1, 6), randInt(1, 28)) : null,
                    evidenceId: null,
                    repondueLe: dateStr(anneeDeb + 1, randInt(1, 6), randInt(1, 28)),
                  },
                });
                reponseCount++;
              }
            }
          }
        }
      }
    }
  }

  console.log(`  ✅ Feuilles d'exercices: ${feuilleCount}`);
  console.log(`  ✅ Exercices assignés: ${exerciceCount}`);
  console.log(`  ✅ Réponses: ${reponseCount}`);
}
