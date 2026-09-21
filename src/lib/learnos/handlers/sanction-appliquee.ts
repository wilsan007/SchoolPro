/**
 * Handler `sanction.appliquee`
 * ==============================
 *
 * Quand une sanction est appliquée par le workflow disciplinaire, on crée une
 * `AlerteParent` pour chaque parent lié dès que la sanction affecte la
 * scolarité (exclusion, convocation, travaux d'intérêt général).
 *
 * Les sanctions mineures (avertissement, blâme) ne déclenchent pas d'alerte :
 * elles restent visibles dans le dossier disciplinaire de l'élève.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { SanctionAppliqueePayload } from "@/lib/learnos/events";
import { NiveauAlerteParent } from "@prisma/client";

/** Sanctions qui sortent l'élève du cadre ordinaire : alerte immédiate. */
const TYPES_URGENT = new Set(["EXCLUSION_TEMP", "TRAVAUX_INTERET_GENERAL"]);

/** Sanctions qui nécessitent une réaction de la famille sans urgence vitale. */
const TYPES_ATTENTION = new Set(["EXCLUSION_COURS", "CONVOCATION_PARENTS"]);

function niveauPourType(typeSanction: string): NiveauAlerteParent | null {
  if (TYPES_URGENT.has(typeSanction)) return NiveauAlerteParent.URGENT;
  if (TYPES_ATTENTION.has(typeSanction)) return NiveauAlerteParent.ATTENTION;
  return null;
}

export async function onSanctionAppliquee(event: DrainedEvent): Promise<void> {
  const payload = event.payload as SanctionAppliqueePayload;
  const { tenantId } = event;

  const niveau = niveauPourType(payload.typeSanction);
  if (!niveau || payload.parentIds.length === 0) return;

  const alertes = payload.parentIds.map((parentId) => ({
    tenantId,
    siteId: payload.siteId,
    eleveId: payload.eleveId,
    parentId,
    niveau,
    cle: "sanction.appliquee",
    params: {
      elevePrenom: payload.prenom,
      eleveNom: payload.nom,
      classeNom: payload.classeNom,
      typeSanction: payload.typeSanction,
      gravite: payload.gravite,
      description: payload.description,
      dateDebut: payload.dateDebut,
      dateFin: payload.dateFin,
    },
    empreinte: `sanction-${payload.sanctionId}-${parentId}`,
  }));

  await prisma.alerteParent.createMany({ data: alertes, skipDuplicates: true });

  // La sanction porte `parentNotifie` : le workflow l'affiche pour distinguer
  // les sanctions dont la famille a été informée. Mise à jour idempotente —
  // un re-drainage de l'événement réécrit la même valeur.
  await prisma.sanction.updateMany({
    where: { id: payload.sanctionId, incident: { tenantId } },
    data: { parentNotifie: true },
  });
}
