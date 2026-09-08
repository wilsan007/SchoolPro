/**
 * Handler `devoir.enretard`
 * ==========================
 *
 * Quand un devoir est détecté en retard (dateRendu dépassée, non rendu/corrigé),
 * on crée une `AlerteParent` par parent lié pour chaque élève de la classe.
 *
 * L'alerte est gradée selon le nombre de jours de retard :
 *   - 1 à 3 jours  → ATTENTION
 *   - 4 jours et + → URGENT
 *
 * Idempotence : l'empreinte intègre `devoirId`, `eleveId` et `parentId`, donc
 * un rejeu ne crée pas de doublon. Le détecteur (`devoirs-retard-check.ts`)
 * ne publie qu'un événement par devoir, mais le bus étant « au moins une fois »,
 * le handler doit aussi être idempotent.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { DevoirEnRetardPayload } from "@/lib/learnos/events";
import { siteFilterFromSession } from "@/lib/site-scope";
import { NiveauAlerteParent } from "@prisma/client";

const SEUIL_URGENT_JOURS = 4;

export async function onDevoirEnRetard(event: DrainedEvent): Promise<void> {
  const payload = event.payload as DevoirEnRetardPayload;
  const { tenantId, siteId } = event;

  const siteFilter = siteFilterFromSession("TENANT_ADMIN", siteId, [], true);

  // Récupérer le devoir pour son titre et la matière.
  const devoir = await prisma.devoir.findFirst({
    where: { id: payload.devoirId, tenantId },
    select: { titre: true, matiere: { select: { nom: true } } },
  });
  if (!devoir) {
    console.warn(`[learnos/devoir-enretard] devoir ${payload.devoirId} introuvable`);
    return;
  }

  // Récupérer les élèves de la classe avec leurs parents.
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

  const niveau =
    payload.joursRetard >= SEUIL_URGENT_JOURS
      ? NiveauAlerteParent.URGENT
      : NiveauAlerteParent.ATTENTION;

  const alertes = eleves.flatMap((eleve) =>
    eleve.parents.map((ep) => ({
      tenantId,
      siteId: eleve.siteId,
      eleveId: eleve.id,
      parentId: ep.parentId,
      niveau,
      cle: "devoir.enretard",
      params: {
        titre: devoir.titre,
        matiereNom: devoir.matiere.nom,
        joursRetard: payload.joursRetard,
        elevePrenom: eleve.prenom,
        eleveNom: eleve.nom,
      },
      empreinte: `devoir-retard-${payload.devoirId}-${eleve.id}-${ep.parentId}`,
    }))
  );

  if (alertes.length === 0) return;

  await prisma.alerteParent.createMany({ data: alertes, skipDuplicates: true });
}
