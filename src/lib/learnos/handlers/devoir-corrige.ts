/**
 * Handler `devoir.corrige`
 * =========================
 *
 * Quand un devoir est marqué comme corrigé, on crée une `AlerteParent`
 * par parent lié pour chaque élève de la classe. L'alerte est ensuite
 * traitée par l'outbox parent (WhatsApp/SMS).
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { DevoirCorrigePayload } from "@/lib/learnos/events";
import { siteFilterFromSession } from "@/lib/site-scope";
import { NiveauAlerteParent } from "@prisma/client";

export async function onDevoirCorrige(event: DrainedEvent): Promise<void> {
  const payload = event.payload as DevoirCorrigePayload;
  const { tenantId, siteId } = event;

  const siteFilter = siteFilterFromSession("TENANT_ADMIN", siteId, [], true);

  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      ...siteFilter,
      classeId: payload.classeId,
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
      cle: "devoir.corrige",
      params: {
        titre: payload.titre,
        matiereNom: payload.matiereNom,
        elevePrenom: eleve.prenom,
        eleveNom: eleve.nom,
      },
      empreinte: `devoir-corrige-${payload.devoirId}-${eleve.id}-${ep.parentId}`,
    }))
  );

  if (alertes.length === 0) return;

  await prisma.alerteParent.createMany({ data: alertes, skipDuplicates: true });
}
