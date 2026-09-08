/**
 * Handler `competence.created`
 * ==============================
 *
 * Quand une compétence est créée à la main, on lui rattache une
 * `PlanificationCompetence` si le chapitre possède déjà une planification
 * pour l'année en cours. Idempotent.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { CompetenceCreatedPayload } from "@/lib/learnos/events";
import { getAnneeCourante } from "@/lib/annee-scolaire";
import { siteFilterFromSession } from "@/lib/site-scope";

export async function onCompetenceCreated(event: DrainedEvent): Promise<void> {
  const payload = event.payload as CompetenceCreatedPayload;
  const { tenantId, siteId } = event;

  const annee = await getAnneeCourante(tenantId);
  if (!annee) {
    console.warn(`[learnos/competence-created] tenant ${tenantId} sans année courante`);
    return;
  }

  const siteFilter = siteFilterFromSession("TENANT_ADMIN", siteId, [], true);

  const planifChapitre = await prisma.planificationChapitre.findFirst({
    where: {
      tenantId,
      ...siteFilter,
      anneeId: annee.id,
      chapitreId: payload.chapitreId,
      classeId: null,
    },
    select: { semaineDebut: true, semaineFin: true },
  });

  if (!planifChapitre) return;

  const existante = await prisma.planificationCompetence.findFirst({
    where: {
      tenantId,
      ...siteFilter,
      anneeId: annee.id,
      competenceId: payload.competenceId,
      classeId: null,
    },
    select: { id: true },
  });

  if (existante) return;

  await prisma.planificationCompetence.create({
    data: {
      tenantId,
      siteId,
      anneeId: annee.id,
      competenceId: payload.competenceId,
      classeId: null,
      semaineDebut: planifChapitre.semaineDebut,
      semaineFin: planifChapitre.semaineFin,
      statut: "PREVU",
    },
  });
}
