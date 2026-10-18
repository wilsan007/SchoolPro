import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  mergeFilters,
  personalScopeFilter,
  siteFilterForModel,
  type SessionSiteClaims,
} from "@/lib/site-scope";
import { calculerSignal, evidenceId } from "@/lib/learnos/evidence-engine";
import { recalculerProfil } from "@/lib/learnos/learning-twin";
import { recalculerRecommandation } from "@/lib/learnos/recommendation-engine";
import { synchroniserEtapes } from "@/lib/learnos/plan-engine";
import { parseGrille, scoreDepuisCriteres, totalGrille } from "./grille-correction";
import { EVIDENCE_TYPE_VALIDATION, compterEcarts } from "./fiabilite-correcteur";

// ------------------------------------------------------------
// Validation d'une correction assistée par un adulte
// ------------------------------------------------------------
//
// C'est ICI, et nulle part ailleurs, qu'une proposition de modèle devient une
// preuve d'apprentissage. L'enseignant désigne les critères réussis — il peut
// reprendre ceux du modèle ou les changer — et la note découle de la grille. Le
// modèle n'a jamais le dernier mot, ni sur un critère ni sur le total.

export class ErreurValidation extends Error {
  constructor(
    message: string,
    readonly code: "introuvable" | "deja_traitee" | "critere_inconnu" | "grille_perdue"
  ) {
    super(message);
    this.name = "ErreurValidation";
  }
}

export interface ResultatValidation {
  score: number;
  maxScore: number;
  /** Critères que l'enseignant a changés par rapport au modèle. */
  ecarts: number;
  evidenceId: string;
}

const SELECT_CORRECTION = {
  id: true,
  statut: true,
  eleveId: true,
  siteId: true,
  criteresReussis: true,
  question: {
    select: {
      id: true,
      grille: true,
      competenceId: true,
      competence: { select: { chapitre: { select: { matiereId: true } } } },
    },
  },
} as const;

/**
 * Valide (ou rejette) une correction proposée.
 *
 * @param criteresValides critères retenus comme réussis ; `null` pour REJETER la
 *   proposition sans produire de preuve.
 * @returns le résultat, ou `null` pour un rejet.
 */
export async function validerCorrection(
  tenantId: string,
  claims: SessionSiteClaims,
  input: { correctionId: string; criteresValides: string[] | null; valideParId: string },
  maintenant: Date = new Date()
): Promise<ResultatValidation | null> {
  const correction = await prisma.correctionAssistee.findFirst({
    where: mergeFilters(
      { id: input.correctionId, tenantId },
      siteFilterForModel("correctionAssistee", claims),
      personalScopeFilter(claims, "eleve")
    ),
    select: SELECT_CORRECTION,
  });
  if (!correction) throw new ErreurValidation("Correction introuvable.", "introuvable");
  if (correction.statut === "VALIDEE" || correction.statut === "REJETEE") {
    throw new ErreurValidation("Correction déjà traitée.", "deja_traitee");
  }

  // Rejet : la proposition ne vaut rien, aucune preuve n'est produite.
  if (input.criteresValides === null) {
    await prisma.correctionAssistee.update({
      where: { id: correction.id, tenantId },
      data: { statut: "REJETEE", valideParId: input.valideParId, valideeLe: maintenant },
    });
    return null;
  }

  const grille = parseGrille(correction.question.grille);
  if (!grille) throw new ErreurValidation("La grille de la question a disparu.", "grille_perdue");

  const ids = grille.criteres.map((c) => c.id);
  if (input.criteresValides.some((id) => !ids.includes(id))) {
    throw new ErreurValidation("Critère inconnu de la grille.", "critere_inconnu");
  }

  // Le score se RECALCULE depuis les critères retenus par l'enseignant.
  const retenus = [...new Set(input.criteresValides)];
  const score = scoreDepuisCriteres(grille, retenus);
  const maxScore = totalGrille(grille);
  const proposes = Array.isArray(correction.criteresReussis)
    ? (correction.criteresReussis as string[])
    : [];
  const ecarts = compterEcarts(proposes, retenus, ids);

  const signal = calculerSignal({
    valeur: score,
    noteMax: maxScore,
    coefficient: 1,
    evidenceType: EVIDENCE_TYPE_VALIDATION,
  });

  const { competenceId } = correction.question;
  const id = evidenceId("correction-assistee", correction.id, competenceId);
  const donnees = {
    tenantId,
    siteId: correction.siteId,
    eleveId: correction.eleveId,
    competenceId,
    matiereId: correction.question.competence.chapitre?.matiereId ?? null,
    sourceType: "correction-assistee",
    sourceId: correction.id,
    noteId: null,
    evaluationId: null,
    evidenceType: EVIDENCE_TYPE_VALIDATION,
    rawScore: score,
    maxScore,
    occurredAt: maintenant,
    masterySignal: signal.masterySignal,
    confidence: signal.confidence,
    weight: signal.weight,
    // Aucun type d'erreur déduit : deviner une cause à partir d'un score
    // fabriquerait un diagnostic.
    errorType: null,
    errorConfidence: null,
    metadata: {
      provenance: "correction_assistee_validee",
      questionId: correction.question.id,
      ecartsAvecLeModele: ecarts,
    },
  };

  const preuve = await prisma.learningEvidence.upsert({
    where: { id },
    create: { id, ...donnees },
    update: donnees,
  });

  await prisma.correctionAssistee.update({
    where: { id: correction.id, tenantId },
    data: {
      statut: "VALIDEE",
      valideParId: input.valideParId,
      valideeLe: maintenant,
      criteresValides: retenus as unknown as Prisma.InputJsonValue,
      scoreValide: score,
      evidenceId: preuve.id,
    },
  });

  // Même suite que toute autre voie de preuve : sans elle, la boucle s'arrêterait
  // au profil et la recommandation resterait ouverte.
  await recalculerProfil(tenantId, correction.eleveId, competenceId, maintenant);
  await recalculerRecommandation(tenantId, correction.eleveId, competenceId, maintenant);
  await synchroniserEtapes(tenantId, correction.eleveId, competenceId, maintenant);

  return { score, maxScore, ecarts, evidenceId: preuve.id };
}
