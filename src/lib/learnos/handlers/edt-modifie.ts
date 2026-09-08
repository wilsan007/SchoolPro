/**
 * Handler `edt.modifie`
 * =====================
 *
 * Quand un créneau emploi du temps est modifié, on supprime les séances
 * encore non effectuées (PLANIFIEE) et on régénère le planning à partir
 * des nouvelles données. Les séances déjà clôturées (EFFECTUEE, etc.)
 * restent dans l'historique.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { EdtModifiePayload } from "@/lib/learnos/events";
import { siteFilterFromSession } from "@/lib/site-scope";
import { StatutSeance } from "@prisma/client";
import { onEmploiDuTempsCree } from "./edt-cree";

export async function onEmploiDuTempsModifie(event: DrainedEvent): Promise<void> {
  const payload = event.payload as EdtModifiePayload;
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

  // Régénération : le payload a la même structure que `edt.cree`.
  await onEmploiDuTempsCree(event);
}
