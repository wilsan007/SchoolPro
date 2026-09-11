/**
 * Handler `evaluation.completed`
 * ===============================
 *
 * Quand la saisie d'une évaluation est complétée (toutes les notes entrées),
 * on déclenche le recalcul des KPI pour la classe concernée, et on vérifie
 * si une proportion significative d'élèves est en difficulté — auquel cas
 * une recommandation de remédiation collective est créée.
 *
 * Idempotent : la recommandation collective utilise une empreinte basée sur
 * l'`evaluationId`, donc un rejeu ne crée pas de doublon.
 */

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { EvaluationCompletedPayload } from "@/lib/learnos/events";
import { publishEvent } from "@/lib/learnos/events";
import { NiveauRecommandation, StatutRecommandation } from "@prisma/client";

/** Proportion d'élèves en difficulté déclenchant une remédiation collective. */
const SEUIL_REMEDIATION_COLLECTIVE = 0.3;

/** Score en-dessous duquel un élève est considéré en difficulté (sur 20). */
const SEUIL_DIFFICULTE = 10;

export async function onEvaluationCompleted(event: DrainedEvent): Promise<void> {
  const p = event.payload as EvaluationCompletedPayload;

  if (!p?.evaluationId || !p.classeId || !Array.isArray(p.eleveIds)) {
    throw new Error(
      `evaluation.completed incomplet (événement ${event.id}) : evaluationId/classeId/eleveIds requis`
    );
  }

  // Étape 1 : déclencher le recalcul des KPI pour la classe.
  await publishEvent({
    tenantId: event.tenantId,
    siteId: event.siteId,
    eventType: "kpi.recalculer",
    aggregateType: "evaluation",
    aggregateId: p.evaluationId,
    payload: {
      perimetre: p.classeId,
      type: "evaluation_completed",
      evaluationId: p.evaluationId,
    },
  });

  // Étape 2 : détecter si une proportion significative d'élèves est en difficulté.
  if (p.eleveIds.length === 0) return;

  // eslint-disable-next-line ecolpro/require-site-filter -- événement drainé, borné par (tenantId, evaluationId, eleveIds)
  const notes = await prisma.note.findMany({
    where: {
      tenantId: event.tenantId,
      evaluationId: p.evaluationId,
      eleveId: { in: p.eleveIds },
    },
    select: { valeur: true, noteMax: true },
  });

  if (notes.length === 0) return;

  const enDifficulte = notes.filter((n) => {
    if (!n.noteMax || n.noteMax <= 0) return false;
    return (n.valeur / n.noteMax) * 20 < SEUIL_DIFFICULTE;
  });

  const proportion = enDifficulte.length / notes.length;

  if (proportion >= SEUIL_REMEDIATION_COLLECTIVE) {
    await creerRecommandationRemediationCollective(
      event.tenantId,
      event.siteId,
      p,
      proportion
    );
  }
}

async function creerRecommandationRemediationCollective(
  tenantId: string,
  siteId: string | null,
  p: EvaluationCompletedPayload,
  proportion: number
): Promise<void> {
  // Vérifier qu'une recommandation collective n'existe pas déjà pour cette évaluation.
  // eslint-disable-next-line ecolpro/require-site-filter -- événement drainé, borné par (tenantId, regleDeclenchee, motifParams)
  const existante = await prisma.recommandation.findFirst({
    where: {
      tenantId,
      regleDeclenchee: "remediation_collective",
      motifParams: { path: ["evaluationId"], equals: p.evaluationId },
    },
    select: { id: true },
  });
  if (existante) return;

  await prisma.recommandation.create({
    data: {
      tenantId,
      siteId,
      eleveId: "__collectif__",
      competenceId: "__collectif__",
      niveau: NiveauRecommandation.FRAGILE,
      statut: StatutRecommandation.PROPOSEE,
      motif: `${Math.round(proportion * 100)}% des élèves sous ${SEUIL_DIFFICULTE}/20`,
      actionProposee:
        "Remédiation collective recommandée — revoir les prérequis avec la classe",
      regleDeclenchee: "remediation_collective",
      motifParams: { evaluationId: p.evaluationId, classeId: p.classeId },
      prerequisManquants: Prisma.JsonNull,
      competencesBloquees: 0,
    },
  });
}
