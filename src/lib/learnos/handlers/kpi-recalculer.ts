/**
 * Handler `kpi.recalculer`
 * =========================
 *
 * Quand un cycle d'analyse pédagogique se termine, on écrit les indicateurs
 * clés dans `KpiSnapshot` pour l'historique et les tableaux de bord.
 * Chaque indicateur est upserté au jour courant (idempotence par période).
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { KpiRecalculerPayload } from "@/lib/learnos/events";
import { siteFilterForModel } from "@/lib/site-scope";

const ROLE = "TENANT_ADMIN";

export async function onKpiRecalculer(event: DrainedEvent): Promise<void> {
  const payload = event.payload as KpiRecalculerPayload;
  const { tenantId, siteId } = event;

  const periode = new Date();
  periode.setHours(0, 0, 0, 0);

  const claims = {
    role: "TENANT_ADMIN" as const,
    siteId,
    siteIds: siteId ? [siteId] : null,
  };

  const snapshots = [
    { kpiKey: "learnos.kpi.patterns.total", valeur: payload.patternsCrees + payload.patternsMisAJour },
    { kpiKey: "learnos.kpi.patterns.crees", valeur: payload.patternsCrees },
    { kpiKey: "learnos.kpi.patterns.misajour", valeur: payload.patternsMisAJour },
    { kpiKey: "learnos.kpi.correlations", valeur: payload.correlationsCrees },
    { kpiKey: "learnos.kpi.echantillon", valeur: payload.echantillonTotal },
  ];

  for (const snapshot of snapshots) {
    const existing = await prisma.kpiSnapshot.findFirst({
      where: {
        tenantId,
        ...siteFilterForModel("kpiSnapshot", claims),
        role: ROLE,
        kpiKey: snapshot.kpiKey,
        periode,
      },
    });
    if (existing) {
      await prisma.kpiSnapshot.update({
        where: { id: existing.id, tenantId },
        data: { valeur: snapshot.valeur },
      });
    } else {
      await prisma.kpiSnapshot.create({
        data: {
          tenantId,
          siteId: siteId ?? null,
          role: ROLE,
          kpiKey: snapshot.kpiKey,
          valeur: snapshot.valeur,
          periode,
        },
      });
    }
  }
}
