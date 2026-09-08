/**
 * Handler `chapitre.created`
 * ============================
 *
 * Quand un chapitre est créé à la main, on génère immédiatement sa
 * planification pédagogique. Idempotent.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { ChapitreCreatedPayload } from "@/lib/learnos/events";
import { getAnneeCourante } from "@/lib/annee-scolaire";
import { siteFilterFromSession } from "@/lib/site-scope";

const SEMAINES_PAR_CHAPITRE = 2;
const HEURES_PAR_COMPETENCE = 2;
const SEMAINE_MAX = 36;

export async function onChapitreCreated(event: DrainedEvent): Promise<void> {
  const payload = event.payload as ChapitreCreatedPayload;
  const { tenantId, siteId } = event;

  const annee = await getAnneeCourante(tenantId);
  if (!annee) {
    console.warn(`[learnos/chapitre-created] tenant ${tenantId} sans année courante`);
    return;
  }

  const siteFilter = siteFilterFromSession("TENANT_ADMIN", siteId, [], true);

  const chapitre = await prisma.chapitre.findFirst({
    where: {
      id: payload.chapitreId,
      tenantId,
      ...siteFilter,
    },
    include: {
      competences: {
        where: { tenantId, ...siteFilter },
        select: { id: true },
        orderBy: { ordre: "asc" },
      },
    },
  });

  if (!chapitre) return;

  const existante = await prisma.planificationChapitre.findFirst({
    where: {
      tenantId,
      ...siteFilter,
      anneeId: annee.id,
      chapitreId: chapitre.id,
      classeId: null,
    },
    select: { id: true },
  });

  if (existante) return;

  const semaineDebut = Math.min(
    SEMAINE_MAX - SEMAINES_PAR_CHAPITRE + 1,
    Math.max(1, chapitre.ordre + 1)
  );
  const semaineFin = Math.min(SEMAINE_MAX, semaineDebut + SEMAINES_PAR_CHAPITRE - 1);

  await prisma.$transaction([
    prisma.planificationChapitre.create({
      data: {
        tenantId,
        siteId,
        anneeId: annee.id,
        chapitreId: chapitre.id,
        classeId: null,
        semaineDebut,
        semaineFin,
        heuresPrevues: Math.max(1, chapitre.competences.length * HEURES_PAR_COMPETENCE),
        statut: "PREVU",
        demarreLe: null,
        traiteLe: null,
      },
    }),
    ...(chapitre.competences.length > 0
      ? [
          prisma.planificationCompetence.createMany({
            data: chapitre.competences.map((competence) => ({
              tenantId,
              siteId,
              anneeId: annee.id,
              competenceId: competence.id,
              classeId: null,
              semaineDebut,
              semaineFin,
              statut: "PREVU",
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
}
