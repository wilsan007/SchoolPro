/**
 * Handler `prediction.emise`
 * ===========================
 *
 * Quand des prédictions de difficulté sont émises pour un chapitre, on crée
 * une `AlerteParent` pour chaque élève en DIFFICILE/CRITIQUE. L'alerte est
 * traitée par l'outbox parent (WhatsApp/SMS).
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { PredictionEmisePayload } from "@/lib/learnos/events";
import { siteFilterFromSession, siteFilterForRelation, siteFilterForModel } from "@/lib/site-scope";
import { NiveauAlerteParent } from "@prisma/client";

const SEUILS: Record<string, NiveauAlerteParent> = {
  DIFFICILE: NiveauAlerteParent.ATTENTION,
  CRITIQUE: NiveauAlerteParent.URGENT,
};

export async function onPredictionEmise(event: DrainedEvent): Promise<void> {
  const payload = event.payload as PredictionEmisePayload;
  const { tenantId, siteId } = event;

  const alertables = payload.predictions.filter((p) => p.difficultePredite === "DIFFICILE" || p.difficultePredite === "CRITIQUE");
  if (alertables.length === 0) return;

  const scope = siteFilterFromSession("TENANT_ADMIN", siteId, [], true);
  const siteFilter = siteFilterForRelation(scope, "eleve");

  const competenceIds = [...new Set(alertables.map((p) => p.competenceId))];
  const competences = await prisma.competence.findMany({
    where: { id: { in: competenceIds }, ...siteFilterForModel("competence", { role: "TENANT_ADMIN", siteId, siteIds: siteId ? [siteId] : null }) },
    select: { id: true, libelle: true },
  });
  const competenceParId = new Map(competences.map((c) => [c.id, c.libelle]));

  const eleveIds = [...new Set(alertables.map((p) => p.eleveId))];
  const eleves = await prisma.eleve.findMany({
    where: { id: { in: eleveIds }, tenantId, ...siteFilter },
    select: {
      id: true,
      nom: true,
      prenom: true,
      siteId: true,
      parents: { select: { parentId: true } },
    },
  });
  const eleveParId = new Map(eleves.map((e) => [e.id, e]));

  const alertes = alertables.flatMap((p) => {
    const eleve = eleveParId.get(p.eleveId);
    if (!eleve) return [];

    const niveau = SEUILS[p.difficultePredite] ?? NiveauAlerteParent.ATTENTION;
    const competenceLibelle = competenceParId.get(p.competenceId) ?? "";

    return eleve.parents.map((ep) => ({
      tenantId,
      siteId: eleve.siteId,
      eleveId: p.eleveId,
      parentId: ep.parentId,
      niveau,
      cle: "learnos.alertes.prediction.difficulte",
      params: {
        chapitreId: payload.chapitreId,
        competenceLibelle,
        elevePrenom: eleve.prenom,
        eleveNom: eleve.nom,
        difficulte: p.difficultePredite,
        probaReussite: p.probaReussite,
      },
      empreinte: `prediction-${payload.chapitreId}-${p.eleveId}-${p.competenceId}-${ep.parentId}`,
    }));
  });

  if (alertes.length === 0) return;

  await prisma.alerteParent.createMany({ data: alertes, skipDuplicates: true });
}
