/**
 * Handler `absence.recorded`
 * ===========================
 *
 * Quand une absence (ou un retard) est enregistrée, on détecte les élèves
 * à risque de fréquence d'absences. Si le seuil est atteint, on crée une
 * `AlerteParent` par parent lié, prête à être envoyée (outbox).
 *
 * Règles déterministes, sans LLM :
 * - 3 absences injustifiées dans l'année → ATTENTION
 * - 5 absences injustifiées dans l'année → URGENT
 * - un seul message par semaine et par parent (empreinte).
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { AbsenceRecordedPayload } from "@/lib/learnos/events";
import { getAnneeCourante } from "@/lib/annee-scolaire";
import { siteFilterFromSession, siteFilterForRelation } from "@/lib/site-scope";
import { semaineScolaire } from "@/lib/learnos/planification-pure";
import { NiveauAlerteParent } from "@prisma/client";

const SEUIL_ATTENTION = 3;
const SEUIL_URGENT = 5;

export async function onAbsenceRecorded(event: DrainedEvent): Promise<void> {
  const payload = event.payload as AbsenceRecordedPayload;
  const { tenantId, siteId } = event;

  if (payload.motif !== "INJUSTIFIE") return;
  if (payload.isRetard) return;

  const annee = await getAnneeCourante(tenantId);
  if (!annee) {
    console.warn(`[learnos/absence-recorded] tenant ${tenantId} sans année courante`);
    return;
  }

  const date = new Date(payload.date);
  const debut = annee.dateDebut;
  const fin = annee.dateFin;

  const scope = siteFilterFromSession("TENANT_ADMIN", siteId, [], true);
  const siteFilter = siteFilterForRelation(scope, "eleve");

  const eleve = await prisma.eleve.findFirst({
    where: { id: payload.eleveId, tenantId, ...siteFilter },
    select: {
      id: true,
      siteId: true,
      parents: { select: { parentId: true } },
    },
  });
  if (!eleve) {
    console.warn(`[learnos/absence-recorded] élève ${payload.eleveId} introuvable`);
    return;
  }

  const count = await prisma.absence.count({
    where: {
      tenantId,
      ...siteFilter,
      eleveId: payload.eleveId,
      date: { gte: debut, lte: fin },
      motif: "INJUSTIFIE" as const,
      isRetard: false,
    },
  });

  if (count < SEUIL_ATTENTION) return;

  const niveau = count >= SEUIL_URGENT ? NiveauAlerteParent.URGENT : NiveauAlerteParent.ATTENTION;
  const semaine = semaineScolaire(date, debut);

  const alertes = eleve.parents.map((ep) => ({
    tenantId,
    siteId: eleve.siteId,
    eleveId: payload.eleveId,
    parentId: ep.parentId,
    niveau,
    cle: "learnos.alertes.absence.frequence",
    params: { count, semaine },
    empreinte: `absence-freq-${payload.eleveId}-${ep.parentId}-${semaine}`,
  }));

  if (alertes.length === 0) return;

  // Les empreintes uniques assurent l'idempotence : pas d'alerte en double.
  await prisma.alerteParent.createMany({ data: alertes, skipDuplicates: true });
}
