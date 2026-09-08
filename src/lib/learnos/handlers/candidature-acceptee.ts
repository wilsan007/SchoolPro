/**
 * Handler `candidature.acceptee`
 * ================================
 *
 * Quand une candidature est finalisée en inscription, on crée une `AlerteParent`
 * d'information pour le parent concerné.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { CandidatureAccepteePayload } from "@/lib/learnos/events";
import { NiveauAlerteParent } from "@prisma/client";

export async function onCandidatureAcceptee(event: DrainedEvent): Promise<void> {
  const payload = event.payload as CandidatureAccepteePayload;
  const { tenantId } = event;

  if (!payload.parentId) return;

  await prisma.alerteParent.createMany({
    data: [
      {
        tenantId,
        siteId: payload.siteId,
        eleveId: payload.eleveId,
        parentId: payload.parentId,
        niveau: NiveauAlerteParent.INFO,
        cle: "learnos.alertes.candidature.acceptee",
        params: {
          elevePrenom: payload.prenom,
          eleveNom: payload.nom,
          matricule: payload.matricule,
          classeNom: payload.classeNom,
        },
        empreinte: `candidature-accept-${payload.candidatureId}-${payload.eleveId}-${payload.parentId}`,
      },
    ],
    skipDuplicates: true,
  });
}
