/**
 * Handler `evaluation.publiee`
 * =============================
 *
 * Quand les notes d'une évaluation sont publiées, on crée une `AlerteParent`
 * par parent lié pour chaque élève concerné. L'alerte est ensuite traitée
 * par l'outbox parent (WhatsApp/SMS).
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { EvaluationPublieePayload } from "@/lib/learnos/events";
import { siteFilterFromSession, siteFilterForRelation } from "@/lib/site-scope";
import { NiveauAlerteParent } from "@prisma/client";

export async function onEvaluationPubliee(event: DrainedEvent): Promise<void> {
  const payload = event.payload as EvaluationPublieePayload;
  const { tenantId, siteId } = event;

  const scope = siteFilterFromSession("TENANT_ADMIN", siteId, [], true);
  const siteFilter = siteFilterForRelation(scope, "eleve");

  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      ...siteFilter,
      id: { in: payload.eleveIds },
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      siteId: true,
      parents: { select: { parentId: true } },
    },
  });

  const alertes = eleves.flatMap((eleve) =>
    eleve.parents.map((ep) => ({
      tenantId,
      siteId: eleve.siteId,
      eleveId: eleve.id,
      parentId: ep.parentId,
      niveau: NiveauAlerteParent.INFO,
      cle: "learnos.alertes.evaluation.publiee",
      params: {
        matiereNom: payload.matiereNom,
        intitule: payload.intitule,
        elevePrenom: eleve.prenom,
        eleveNom: eleve.nom,
      },
      empreinte: `eval-pub-${payload.evaluationId}-${eleve.id}-${ep.parentId}`,
    }))
  );

  if (alertes.length === 0) return;

  await prisma.alerteParent.createMany({ data: alertes, skipDuplicates: true });
}
