import type { EvidenceType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { calculerSignal, evidenceId } from "@/lib/learnos/evidence-engine";
import { recalculerProfil } from "@/lib/learnos/learning-twin";
import { recalculerRecommandation } from "@/lib/learnos/recommendation-engine";
import { synchroniserEtapes, evaluerBesoinDePlans } from "@/lib/learnos/plan-engine";
import {
  type EtapeFaite,
  erreurDominante,
  FACTEUR_QUESTION_NON_RELUE,
  fiabiliteSeance,
} from "./deroule-seance";
import type { ExerciceCharge } from "./acces-base";

// ------------------------------------------------------------
// Conversion en preuve d'apprentissage
// ------------------------------------------------------------

/** Nature de la preuve, déduite du type de feuille. */
export function evidenceTypeDeFeuille(typeFeuille: string): EvidenceType {
  // Seul l'entraînement est fait sans témoin. Un diagnostic ou un jalon sont
  // passés en classe : ils valent un exercice ordinaire.
  return typeFeuille === "entrainement" ? "AUTO_ENTRAINEMENT" : "EXERCICE";
}

/**
 * Transforme un exercice terminé en preuve, puis recalcule le profil.
 *
 * Appel direct plutôt que passage par le bus d'événements : celui-ci existe
 * pour observer l'ERP sans le ralentir ni le casser. Ici la source est LEARNOS
 * lui-même — un détour par l'outbox n'ajouterait qu'une latence et un état
 * intermédiaire, sans rien découpler.
 *
 * L'identifiant est dérivé de la source (cf. `evidenceId`) : rejouer la même
 * correction met à jour la même ligne au lieu d'empiler des preuves.
 */
export async function produirePreuve(
  tenantId: string,
  exercice: ExerciceCharge & {
    competenceId: string;
    feuille: { id: string; eleveId: string; siteId: string | null; type: string; matiereId: string | null };
  },
  resultat: { score: number; maxScore: number; etapes: EtapeFaite[]; maintenant: Date }
): Promise<void> {
  const evidenceType = evidenceTypeDeFeuille(exercice.feuille.type);

  const signal = calculerSignal({
    valeur: resultat.score,
    noteMax: resultat.maxScore,
    // Aucun enseignant n'a déclaré d'importance pour cet exercice : le poids
    // neutre est le seul honnête. Le tri entre séances se fait par la
    // confiance, pas par un coefficient inventé.
    coefficient: 1,
    evidenceType,
  });

  const fiabilite =
    evidenceType === "AUTO_ENTRAINEMENT"
      ? fiabiliteSeance(resultat.etapes)
      : { facteur: 1, motif: null };

  // Doute sur l'énoncé, distinct du doute sur l'élève — et cumulatif avec lui.
  const relue = exercice.question.origine !== "ia" || exercice.question.relueLe !== null;
  const facteurQuestion = relue ? 1 : FACTEUR_QUESTION_NON_RELUE;

  const id = evidenceId("exercice", exercice.id, exercice.competenceId);

  const donnees = {
    tenantId,
    siteId: exercice.feuille.siteId,
    eleveId: exercice.feuille.eleveId,
    competenceId: exercice.competenceId,
    matiereId: exercice.feuille.matiereId,
    sourceType: "exercice",
    sourceId: exercice.id,
    noteId: null,
    evaluationId: null,
    evidenceType,
    rawScore: resultat.score,
    maxScore: resultat.maxScore,
    occurredAt: resultat.maintenant,
    masterySignal: signal.masterySignal,
    confidence: signal.confidence * fiabilite.facteur * facteurQuestion,
    weight: signal.weight,
    // Renseigné ici, contrairement à la voie « note » : le découpage en étapes
    // et les distracteurs annotés disent *où* ça a cassé. C'est le seul endroit
    // du système où l'erreur est observée plutôt que supposée.
    errorType: erreurDominante(resultat.etapes),
    errorConfidence: erreurDominante(resultat.etapes) ? 0.6 : null,
    metadata: {
      palier: exercice.palier,
      questionId: exercice.question.id,
      typeFeuille: exercice.feuille.type,
      regleDeclenchee: exercice.regleDeclenchee,
      tentatives: resultat.etapes.reduce((s, e) => s + e.tentatives, 0),
      dureeMs: resultat.etapes.reduce((s, e) => s + (e.dureeMs ?? 0), 0),
      // Motifs conservés même quand il ne s'est rien passé d'anormal : c'est ce
      // qui rend la pondération explicable à une famille.
      fiabiliteSeance: fiabilite.facteur,
      motifFiabilite: fiabilite.motif,
      origineQuestion: exercice.question.origine,
      questionRelue: relue,
      facteurQuestion,
    },
  };

  const preuve = await prisma.learningEvidence.upsert({
    where: { id },
    create: { id, ...donnees },
    update: donnees,
  });

  await prisma.exerciceReponse.update({
    where: { exerciceAssigneId: exercice.id },
    data: { evidenceId: preuve.id },
  });

  await recalculerProfil(
    tenantId,
    exercice.feuille.eleveId,
    exercice.competenceId,
    resultat.maintenant
  );

  // Même suite que la voie « note » (cf. `recalculerRecommandationsApresProfil`).
  // Sans elle, la boucle s'arrêtait au profil : la maîtrise montait, mais la
  // recommandation restait ouverte et l'étape de parcours ne se validait jamais
  // — y compris pour une feuille-jalon, dont c'est pourtant la raison d'être.
  //
  // C'est bien la PREUVE qui valide l'étape, jamais la feuille : `EtapePlan` est
  // synchronisée sur le profil recalculé, si bien qu'une réussite obtenue hors
  // parcours la valide aussi, et qu'une régression la rouvre.
  await recalculerRecommandation(
    tenantId,
    exercice.feuille.eleveId,
    exercice.competenceId,
    resultat.maintenant
  );
  await synchroniserEtapes(
    tenantId,
    exercice.feuille.eleveId,
    exercice.competenceId,
    resultat.maintenant
  );
}

/** Ferme la feuille quand tous ses exercices sont corrigés. */
export async function cloturerSiTerminee(
  tenantId: string,
  feuilleId: string,
  eleveId: string,
  maintenant: Date
): Promise<boolean> {
  // eslint-disable-next-line ecolpro/require-site-filter
  const restants = await prisma.exerciceAssigne.count({
    where: { feuille: { id: feuilleId, tenantId }, reponse: { is: null } },
  });
  const partiels = await prisma.exerciceReponse.count({
    where: { exercice: { feuille: { id: feuilleId, tenantId } }, score: null },
  });
  if (restants + partiels > 0) return false;

  await prisma.feuilleExercices.updateMany({
    where: { id: feuilleId, tenantId, statut: { in: ["ASSIGNEE", "EN_COURS"] } },
    data: { statut: "TERMINEE", termineeLe: maintenant },
  });

  // À la clôture, et non après chaque exercice : un parcours se propose sur une
  // situation d'ensemble. L'évaluer en cours de feuille l'appuierait sur un
  // état à moitié mis à jour, et le referait cinq fois pour un seul verdict.
  // Proposé seulement — la validation reste humaine (`PlanProgression`).
  await evaluerBesoinDePlans(tenantId, eleveId, maintenant);

  return true;
}
