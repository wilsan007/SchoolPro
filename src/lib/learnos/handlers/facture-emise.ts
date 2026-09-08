/**
 * Handler `facture.emise`
 * ========================
 *
 * Quand une facture est émise, on s'assure qu'un échéancier de paiement
 * existe. S'il n'existe pas encore, on en crée un par défaut.
 * L'appelant peut surcharger le nombre d'échéances et l'intervalle via
 * le payload, sinon on se rabat sur 1 échéance à la date d'échéance de
 * la facture (ou dans 30 jours par défaut).
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { FactureEmisePayload } from "@/lib/learnos/events";
import { siteFilterFromSession } from "@/lib/site-scope";
import { getEcheancierPourFacture, creerEcheancier } from "@/lib/echeancier";

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

export async function onFactureEmise(event: DrainedEvent): Promise<void> {
  const payload = event.payload as FactureEmisePayload;
  const { tenantId, siteId } = event;

  const siteFilter = siteFilterFromSession("TENANT_ADMIN", siteId, [], true);

  const facture = await prisma.facture.findFirst({
    where: { id: payload.factureId, tenantId, ...siteFilter },
    select: { id: true, echeance: true },
  });
  if (!facture) {
    console.warn(`[learnos/facture-emise] facture ${payload.factureId} introuvable`);
    return;
  }

  const existing = await getEcheancierPourFacture(facture.id);
  if (existing) return;

  const datePremiere = payload.datePremiereEcheance
    ? new Date(payload.datePremiereEcheance)
    : facture.echeance ?? new Date(Date.now() + 30 * MS_PAR_JOUR);

  const nbEcheances = Math.max(1, payload.nbEcheances ?? 1);
  const intervalleJours = payload.intervalleJours ?? (nbEcheances > 1 ? 30 : 0);

  try {
    await creerEcheancier(facture.id, nbEcheances, datePremiere, intervalleJours);
  } catch (error) {
    console.warn(`[learnos/facture-emise] échéancier non créé pour ${facture.id}:`, error);
  }
}
