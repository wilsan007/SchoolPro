/**
 * Handler `incident.signale`
 * ============================
 *
 * Quand un incident est signalé, on crée une `AlerteParent` pour chaque parent
 * dès que l'incident est de gravité 2 (moyen) ou 3 (grave).
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { IncidentSignalePayload } from "@/lib/learnos/events";
import { NiveauAlerteParent } from "@prisma/client";

export async function onIncidentSignale(event: DrainedEvent): Promise<void> {
  const payload = event.payload as IncidentSignalePayload;
  const { tenantId } = event;

  if (payload.gravite < 2 || payload.parentIds.length === 0) return;

  const niveau = payload.gravite === 3 ? NiveauAlerteParent.URGENT : NiveauAlerteParent.ATTENTION;

  const alertes = payload.parentIds.map((parentId) => ({
    tenantId,
    siteId: payload.siteId,
    eleveId: payload.eleveId,
    parentId,
    niveau,
    cle: "incident.signale",
    params: {
      elevePrenom: payload.prenom,
      eleveNom: payload.nom,
      classeNom: payload.classeNom,
      type: payload.type,
      gravite: payload.gravite,
      description: payload.description,
      date: payload.date,
    },
    empreinte: `incident-${payload.incidentId}-${parentId}`,
  }));

  await prisma.alerteParent.createMany({ data: alertes, skipDuplicates: true });
}
