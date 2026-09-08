/**
 * Handler `edt.supprime`
 * =======================
 *
 * Quand un créneau emploi du temps est supprimé, on supprime les séances
 * pédagogiques PLANIFIEE qui en dépendent. Les séances déjà effectuées
 * restent en historique.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { EdtSupprimePayload } from "@/lib/learnos/events";
import { siteFilterFromSession } from "@/lib/site-scope";
import { StatutSeance } from "@prisma/client";

export async function onEmploiDuTempsSupprime(event: DrainedEvent): Promise<void> {
  const payload = event.payload as EdtSupprimePayload;
  const { tenantId } = event;

  const siteFilter = siteFilterFromSession("TENANT_ADMIN", event.siteId, [], true);

  await prisma.seancePedagogique.deleteMany({
    where: {
      tenantId,
      ...siteFilter,
      emploiTempsId: payload.emploiTempsId,
      statut: StatutSeance.PLANIFIEE,
    },
  });
}
