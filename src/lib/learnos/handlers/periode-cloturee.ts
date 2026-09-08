/**
 * Handler `periode.cloturee`
 * ===========================
 *
 * Quand une période est clôturée, on pré-génère un bulletin squelette par
 * élève de l'année concernée. Les bulletins existants sont ignorés grâce
 * à l'unicité `(eleveId, periodeId)`.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { PeriodeClotureePayload } from "@/lib/learnos/events";
import { siteFilterFromSession } from "@/lib/site-scope";

export async function onPeriodeCloturee(event: DrainedEvent): Promise<void> {
  const payload = event.payload as PeriodeClotureePayload;
  const { tenantId, siteId } = event;

  if (payload.statut !== "CLOTUREE") return;

  const scope = siteFilterFromSession("TENANT_ADMIN", siteId, [], true);

  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      ...scope,
      classe: { annee: payload.anneeLibelle, tenantId },
    },
    select: { id: true },
  });

  const bulletins = eleves.map((eleve) => ({
    tenantId,
    eleveId: eleve.id,
    periodeId: payload.periodeId,
  }));

  if (bulletins.length === 0) return;

  await prisma.bulletin.createMany({ data: bulletins, skipDuplicates: true });
}
