/**
 * Handler `bulletin.publie`
 * ==========================
 *
 * Quand les bulletins d'une période sont publiés, on crée une `AlerteParent`
 * par parent lié pour chaque élève concerné. Ces alertes sont traitées par
 * l'outbox parent (`AlerteParent`) pour les canaux externes (WhatsApp/SMS).
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { BulletinPubliePayload } from "@/lib/learnos/events";
import { siteFilterFromSession, siteFilterForRelation } from "@/lib/site-scope";
import { NiveauAlerteParent } from "@prisma/client";

export async function onBulletinPublie(event: DrainedEvent): Promise<void> {
  const payload = event.payload as BulletinPubliePayload;
  const { tenantId, siteId } = event;

  const scope = siteFilterFromSession("TENANT_ADMIN", siteId, [], true);
  const siteFilter = siteFilterForRelation(scope, "eleve");

  const bulletins = await prisma.bulletin.findMany({
    where: {
      tenantId,
      ...siteFilter,
      periodeId: payload.periodeId,
      isPublie: true,
      periode: { annee: { libelle: payload.anneeLibelle } },
    },
    include: {
      eleve: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          siteId: true,
          parents: { select: { parentId: true } },
        },
      },
    },
  });

  const alertes = bulletins.flatMap((b) =>
    b.eleve.parents.map((ep) => ({
      tenantId,
      siteId: b.eleve.siteId,
      eleveId: b.eleve.id,
      parentId: ep.parentId,
      niveau: NiveauAlerteParent.INFO,
      cle: "learnos.alertes.bulletin.publie",
      params: {
        periodeNom: payload.periodeNom,
        elevePrenom: b.eleve.prenom,
        eleveNom: b.eleve.nom,
      },
      empreinte: `bulletin-pub-${b.eleve.id}-${ep.parentId}-${payload.periodeId}`,
    }))
  );

  if (alertes.length === 0) return;

  await prisma.alerteParent.createMany({ data: alertes, skipDuplicates: true });
}
