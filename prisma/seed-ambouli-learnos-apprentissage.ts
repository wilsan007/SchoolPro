/**
 * seed-ambouli-learnos-apprentissage.ts — Jumeau numérique LEARNOS.
 *
 * Pour chaque élève × compétence :
 * - LearningEvidence (preuves issues des notes, 2 ans)
 * - StudentLearningProfile (état de maîtrise, tendance)
 * - Recommandation (CRITIQUE/FRAGILE/CONSOLIDE/AVANCE)
 * - StudentIntervention (remediation, retest)
 * - PlanProgression + EtapePlan (plans validés)
 *
 * Génère des trajectoires variées : élèves qui progressent, qui chutent,
 * qui stagnent — pour permettre les comparaisons entre sites.
 */

import { PrismaClient, EvidenceType, MasteryStatus, NiveauRecommandation, StatutRecommandation, InterventionStatus, StatutPlan, StatutEtape, ErrorType } from "@prisma/client";
import { setSeed, randInt, pick, chance, clamp, gauss, randFloat, dateStr } from "./seed-ambouli-helpers";
import type { RefData } from "./seed-ambouli-ref";
import type { UsersData } from "./seed-ambouli-users";
import type { ClassesData } from "./seed-ambouli-classes";
import type { LearnosCurriculumData } from "./seed-ambouli-learnos-curriculum";

export async function seedLearnosApprentissage(
  prisma: PrismaClient,
  ref: RefData,
  users: UsersData,
  classes: ClassesData,
  curriculum: LearnosCurriculumData,
): Promise<void> {
  setSeed(20250201);
  console.log("🌱 [9/12] Création du jumeau numérique LEARNOS (evidences, profils, recommandations)...");

  let evidenceCount = 0;
  let profilCount = 0;
  let recoCount = 0;
  let interventionCount = 0;
  let planCount = 0;

  // Pour chaque site × année × classe × élève × compétence
  for (const site of ["ambouli", "arhiba"] as const) {
    const siteCode = site === "ambouli" ? "AMB" : "ARH";
    const teachers = users.teachers[site];

    for (const annee of ["2024-2025", "2025-2026"]) {
      const siteClasses = classes.classesBySiteYear[`${site}-${annee}`] || [];
      const anneeDeb = parseInt(annee.split("-")[0]);

      for (const cls of siteClasses) {
        const eleves = classes.elevesByClass[cls.id] || [];
        if (eleves.length === 0) continue;

        // Trouver les compétences du curriculum pour ce niveau
        // On prend les matières principales : MATH, FR, PC, SVT
        const matieresCodes = ["MATH", "FR", "PC", "SVT"];
        for (const matCode of matieresCodes) {
          const matiereId = ref.matieres[`${siteCode}-${matCode}`];
          if (!matiereId) continue;

          // Récupérer les compétences de cette matière × niveau
          const comps = await prisma.competence.findMany({
            where: {
              tenantId: ref.tenantId,
              siteId: ref.sites[site],
              chapitre: { matiereId, niveau: cls.niveau },
            },
          });
          if (comps.length === 0) continue;

          // Récupérer les notes de cette classe × matière
          const notes = await prisma.note.findMany({
            where: { classeId: cls.id, matiereId },
          });

          for (const el of eleves) {
            // Profil de base pour cet élève (varie entre élèves)
            const profilBase = clamp(gauss(0.55, 0.2), 0.15, 0.95);
            // Variation entre sites : Arhiba légèrement plus faible en moyenne
            const siteVariation = site === "arhiba" ? -0.05 : 0;

            for (const comp of comps) {
              // Générer 2-5 preuves par compétence
              const nbEvidences = randInt(2, 5);
              let masteryScore = clamp(profilBase + siteVariation + gauss(0, 0.1), 0.1, 0.95);
              const evidences: { id: string; score: number; date: Date }[] = [];

              for (let e = 0; e < nbEvidences; e++) {
                // Le score évolue dans le temps (progression ou chute)
                const evolution = e > 0 ? gauss(0.03, 0.08) : 0; // légère progression en moyenne
                masteryScore = clamp(masteryScore + evolution, 0.05, 0.98);
                const rawScore = Math.round(masteryScore * 20 * 4) / 4;
                const evDate = dateStr(anneeDeb + (e >= nbEvidences / 2 ? 1 : 0), randInt(10, 12) <= 12 ? randInt(10, 12) : randInt(1, 6), randInt(1, 28));

                const ev = await prisma.learningEvidence.create({
                  data: {
                    tenantId: ref.tenantId,
                    siteId: ref.sites[site],
                    eleveId: el.id,
                    competenceId: comp.id,
                    matiereId,
                    sourceType: "note",
                    sourceId: `note-${el.id}-${comp.id}-${e}`,
                    evidenceType: pick([EvidenceType.DEVOIR, EvidenceType.EXAMEN, EvidenceType.QUIZ, EvidenceType.EXERCICE]),
                    rawScore,
                    maxScore: 20,
                    occurredAt: evDate,
                    masterySignal: Math.round(masteryScore * 100) / 100,
                    confidence: clamp(0.6 + e * 0.1, 0.5, 0.95),
                    weight: 1,
                    errorType: masteryScore < 0.4 ? pick([ErrorType.CONCEPTUAL_ERROR, ErrorType.PROCEDURAL_ERROR, ErrorType.MISSING_PREREQUISITE]) : null,
                    errorConfidence: masteryScore < 0.4 ? randFloat(0.6, 0.9) : null,
                    metadata: { annee, classe: cls.nom },
                  },
                });
                evidences.push({ id: ev.id, score: masteryScore, date: evDate });
                evidenceCount++;
              }

              // StudentLearningProfile
              const lastEvidence = evidences[evidences.length - 1];
              const firstEvidence = evidences[0];
              const trend = lastEvidence.score > firstEvidence.score + 0.05 ? "hausse"
                : lastEvidence.score < firstEvidence.score - 0.05 ? "baisse"
                : "stable";

              const masteryStatus = masteryScore < 0.35 ? MasteryStatus.EMERGING
                : masteryScore < 0.55 ? MasteryStatus.DEVELOPING
                : masteryScore < 0.8 ? MasteryStatus.PROFICIENT
                : masteryScore < 0.92 ? MasteryStatus.MASTERED
                : MasteryStatus.MASTERED;

              await prisma.studentLearningProfile.create({
                data: {
                  tenantId: ref.tenantId,
                  siteId: ref.sites[site],
                  eleveId: el.id,
                  competenceId: comp.id,
                  masteryScore: Math.round(masteryScore * 100) / 100,
                  confidenceScore: clamp(0.5 + evidences.length * 0.1, 0.5, 0.95),
                  masteryStatus,
                  evidenceCount: evidences.length,
                  lastEvidenceAt: lastEvidence.date,
                  trend,
                  errorPatterns: masteryScore < 0.4 ? { type: "conceptual", frequency: "high" } : undefined,
                  prerequisiteStatus: { checked: true, missing: masteryScore < 0.35 ? 2 : 0 },
                  recommendedAction: masteryScore < 0.35 ? "remediation" : masteryScore < 0.55 ? "retest" : masteryScore > 0.92 ? "enrichment" : null,
                },
              }).catch(() => {});
              profilCount++;

              // Recommandation (si seuil déclenché)
              let niveauReco: NiveauRecommandation | null = null;
              if (masteryScore < 0.35) niveauReco = NiveauRecommandation.CRITIQUE;
              else if (masteryScore < 0.55) niveauReco = NiveauRecommandation.FRAGILE;
              else if (masteryScore > 0.92) niveauReco = NiveauRecommandation.EXCELLENCE;
              else if (masteryScore > 0.8) niveauReco = NiveauRecommandation.AVANCE;

              if (niveauReco) {
                const statut = pick([
                  StatutRecommandation.OBLIGATOIRE,
                  StatutRecommandation.RECOMMANDEE,
                  StatutRecommandation.PROPOSEE,
                  StatutRecommandation.ACCEPTEE,
                  StatutRecommandation.ECARTEE,
                ]);
                const motif = niveauReco === NiveauRecommandation.CRITIQUE
                  ? `Maîtrise critique (${Math.round(masteryScore * 100)}%) sur ${comp.libelle}`
                  : niveauReco === NiveauRecommandation.FRAGILE
                  ? `Maîtrise fragile (${Math.round(masteryScore * 100)}%) sur ${comp.libelle}`
                  : niveauReco === NiveauRecommandation.AVANCE
                  ? `Maîtrise avancée (${Math.round(masteryScore * 100)}%) sur ${comp.libelle}`
                  : `Excellence (${Math.round(masteryScore * 100)}%) sur ${comp.libelle}`;

                await prisma.recommandation.create({
                  data: {
                    tenantId: ref.tenantId,
                    siteId: ref.sites[site],
                    eleveId: el.id,
                    competenceId: comp.id,
                    niveau: niveauReco,
                    statut,
                    motif,
                    actionProposee: niveauReco === NiveauRecommandation.CRITIQUE ? "Plan de remédiation urgent"
                      : niveauReco === NiveauRecommandation.FRAGILE ? "Revoir les prérequis et retest"
                      : niveauReco === NiveauRecommandation.AVANCE ? "Approfondissement proposé"
                      : "Parcours d'excellence",
                    regleDeclenchee: `reco.${niveauReco.toLowerCase()}`,
                    motifParams: { competence: comp.libelle, mastery: masteryScore },
                    prerequisManquants: masteryScore < 0.35 ? { count: 2 } : undefined,
                    competencesBloquees: masteryScore < 0.35 ? randInt(1, 3) : 0,
                    decideParId: chance(0.3) ? pick(teachers).userId : null,
                    decideeLe: chance(0.3) ? dateStr(anneeDeb + 1, randInt(1, 6), randInt(1, 28)) : null,
                    resolueLe: statut === StatutRecommandation.ACCEPTEE && chance(0.3) ? dateStr(anneeDeb + 1, randInt(4, 6), randInt(1, 28)) : null,
                  },
                }).catch(() => {});
                recoCount++;
              }

              // Intervention (pour CRITIQUE et FRAGILE)
              if (masteryScore < 0.55 && chance(0.4)) {
                const teacher = pick(teachers);
                const status = pick([InterventionStatus.PROPOSED, InterventionStatus.APPROVED, InterventionStatus.ACTIVE, InterventionStatus.COMPLETED]);
                await prisma.studentIntervention.create({
                  data: {
                    tenantId: ref.tenantId,
                    siteId: ref.sites[site],
                    eleveId: el.id,
                    competenceId: comp.id,
                    reason: `Maîtrise ${masteryScore < 0.35 ? "critique" : "fragile"} sur ${comp.libelle}`,
                    evidenceRefs: evidences.map(e => e.id),
                    interventionType: pick(["remediation", "retest", "prerequisite_review"]),
                    recommendedAction: masteryScore < 0.35 ? "Séance de remédiation individuelle" : "Revoir les prérequis",
                    responsibleUserId: teacher.userId,
                    status,
                    startDate: status !== InterventionStatus.PROPOSED ? dateStr(anneeDeb + 1, randInt(1, 6), randInt(1, 28)) : null,
                    reviewDate: status === InterventionStatus.ACTIVE || status === InterventionStatus.COMPLETED ? dateStr(anneeDeb + 1, randInt(4, 7), randInt(1, 28)) : null,
                    outcome: status === InterventionStatus.COMPLETED ? (chance(0.6) ? "Amélioration constatée" : "Partiellement résolu") : null,
                    masteryBefore: masteryScore,
                    masteryAfter: status === InterventionStatus.COMPLETED ? clamp(masteryScore + gauss(0.1, 0.05), 0.1, 0.95) : null,
                    createdByAi: true,
                    approvedBy: status !== InterventionStatus.PROPOSED ? teacher.userId : null,
                    approvedAt: status !== InterventionStatus.PROPOSED ? dateStr(anneeDeb + 1, randInt(1, 3), randInt(1, 28)) : null,
                  },
                }).catch(() => {});
                interventionCount++;
              }

              // PlanProgression (pour les cas critiques ou avancés, ~10%)
              if ((masteryScore < 0.35 || masteryScore > 0.92) && chance(0.15)) {
                const teacher = pick(teachers);
                const type = masteryScore < 0.35 ? "remediation" : "approfondissement";
                const plan = await prisma.planProgression.create({
                  data: {
                    tenantId: ref.tenantId,
                    siteId: ref.sites[site],
                    eleveId: el.id,
                    matiereId,
                    type,
                    origine: "automatique",
                    statut: pick([StatutPlan.PROPOSE, StatutPlan.ACTIF, StatutPlan.TERMINE]),
                    motif: `Plan de ${type} pour ${comp.libelle}`,
                    regleDeclenchee: `plan.${type}`,
                    motifParams: { competence: comp.libelle, mastery: masteryScore },
                    responsableUserId: teacher.userId,
                    valideParId: users.principals[`${site}-coll`],
                    valideLe: dateStr(anneeDeb + 1, randInt(1, 3), randInt(1, 28)),
                    dateDebut: dateStr(anneeDeb + 1, randInt(2, 4), randInt(1, 28)),
                    dateRevue: dateStr(anneeDeb + 1, randInt(4, 6), randInt(1, 28)),
                    dateFin: dateStr(anneeDeb + 1, randInt(5, 7), randInt(1, 28)),
                    parentInforme: chance(0.5),
                    masteryAvant: masteryScore,
                    masteryApres: chance(0.4) ? clamp(masteryScore + gauss(0.1, 0.05), 0.1, 0.95) : null,
                    resultat: chance(0.4) ? pick(["Amélioration", "Stable", "Partiellement atteint"]) : null,
                  },
                });
                planCount++;

                // 2-3 étapes
                const nbEtapes = randInt(2, 3);
                for (let ei = 0; ei < nbEtapes; ei++) {
                  await prisma.etapePlan.create({
                    data: {
                      planId: plan.id,
                      competenceId: comp.id,
                      ordre: ei + 1,
                      action: pick([
                        "Séance de soutien individuel",
                        "Exercices de remédiation",
                        "Évaluation de jalon",
                        "Revoir le cours de base",
                        "Projet d'approfondissement",
                      ]),
                      responsable: pick(["enseignant", "eleve", "parent"]),
                      echeance: dateStr(anneeDeb + 1, randInt(2, 6), randInt(1, 28)),
                      statut: pick([StatutEtape.A_FAIRE, StatutEtape.EN_COURS, StatutEtape.FAIT, StatutEtape.VALIDE]),
                      valideeLe: chance(0.3) ? dateStr(anneeDeb + 1, randInt(3, 6), randInt(1, 28)) : null,
                    },
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  console.log(`  ✅ LearningEvidence: ${evidenceCount}`);
  console.log(`  ✅ StudentLearningProfile: ${profilCount}`);
  console.log(`  ✅ Recommandations: ${recoCount}`);
  console.log(`  ✅ Interventions: ${interventionCount}`);
  console.log(`  ✅ Plans de progression: ${planCount} (avec étapes)`);
}
