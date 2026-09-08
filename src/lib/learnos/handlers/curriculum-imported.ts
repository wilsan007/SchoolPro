/**
 * Handler `curriculum.imported`
 * ===============================
 *
 * L'import d'un programme crée les chapitres et les compétences. Ce handler
 * génère immédiatement la planification pédagogique associée. L'enseignant
 * peut ensuite ajuster manuellement les semaines ; cette première version
 * garantit qu'il ne part pas d'une feuille blanche et que les dépendants
 * (répartition matière, emploi du temps, pronostics) ont une base à exploiter.
 *
 * GARANTIE : le handler est idempotent. S'il est rejoué, les planifications
 * déjà existantes sont simplement ignorées.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { CurriculumImportedPayload } from "@/lib/learnos/events";
import { getAnneeCourante } from "@/lib/annee-scolaire";
import { siteFilterFromSession } from "@/lib/site-scope";

const SEMAINES_PAR_CHAPITRE = 2;
const HEURES_PAR_COMPETENCE = 2;
const SEMAINE_MAX = 36;

export async function onCurriculumImported(event: DrainedEvent): Promise<void> {
  const payload = event.payload as CurriculumImportedPayload;
  const { tenantId, siteId } = event;

  const annee = await getAnneeCourante(tenantId);
  if (!annee) {
    console.warn(`[learnos/curriculum-imported] tenant ${tenantId} sans année courante`);
    return;
  }

  // Tâche de fond : le scope est celui du site porté par l'événement.
  const siteFilter = siteFilterFromSession("TENANT_ADMIN", siteId, [], true);

  // Récupérer tous les chapitres créés pour cette matière × niveau.
  const chapitres = await prisma.chapitre.findMany({
    where: {
      tenantId,
      ...siteFilter,
      matiereId: payload.matiereId,
      niveau: payload.niveau,
    },
    orderBy: { ordre: "asc" },
    include: {
      competences: {
        where: { tenantId, ...siteFilterFromSession("TENANT_ADMIN", siteId, [], true) },
        select: { id: true },
      },
    },
  });

  if (chapitres.length === 0) {
    return;
  }

  // Exclure ceux qui ont déjà une planification sur cette année (idempotence).
  const existantes = await prisma.planificationChapitre.findMany({
    where: {
      tenantId,
      ...siteFilter,
      anneeId: annee.id,
      chapitreId: { in: chapitres.map((c) => c.id) },
      classeId: null,
    },
    select: { chapitreId: true },
  });
  const dejaPlanifies = new Set(existantes.map((p) => p.chapitreId));

  const aPlanifier = chapitres.filter((c) => !dejaPlanifies.has(c.id));

  for (const chapitre of aPlanifier) {
    const semaineDebut = Math.min(
      SEMAINE_MAX - SEMAINES_PAR_CHAPITRE + 1,
      Math.max(1, chapitre.ordre + 1)
    );
    const semaineFin = Math.min(SEMAINE_MAX, semaineDebut + SEMAINES_PAR_CHAPITRE - 1);

    // Écriture atomique : chapitre et ses compétences planifiés ensemble.
    await prisma.$transaction([
      prisma.planificationChapitre.create({
        data: {
          tenantId,
          siteId: event.siteId,
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
                siteId: event.siteId,
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
}
