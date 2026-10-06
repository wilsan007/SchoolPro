/**
 * Handler `absence.recorded`
 * ===========================
 *
 * Quand une absence (ou un retard) est enregistrée, on détecte les élèves
 * à risque de fréquence d'absences. Si le seuil est atteint, on crée une
 * `AlerteParent` par parent lié, prête à être envoyée (outbox).
 *
 * Règles déterministes, sans LLM :
 * - 3 absences équivalentes dans l'année → ATTENTION
 * - 5 absences équivalentes dans l'année → URGENT
 * - un seul message par semaine et par parent (empreinte).
 *
 * Les retards comptent pour un tiers d'absence (`signal-absenteisme`). Le
 * handler les ignorait purement et simplement : un élève arrivant en retard
 * chaque matin ne déclenchait jamais rien, alors que c'est le signal de
 * décrochage le plus précoce. Un retard isolé ne suffit toujours pas à
 * alerter — il faut neuf retards pour atteindre le seuil d'attention — et
 * l'empreinte hebdomadaire empêche toute répétition du message.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { AbsenceRecordedPayload } from "@/lib/learnos/events";
import { getAnneeCourante } from "@/lib/annee-scolaire";
import { siteFilterFromSession, siteFilterForRelation } from "@/lib/site-scope";
import { semaineScolaire } from "@/lib/learnos/planification-pure";
import { NiveauAlerteParent } from "@prisma/client";
import { absencesEquivalentes, SEUIL_ATTENTION, SEUIL_ELEVE } from "@/lib/absences/signal-absenteisme";

export async function onAbsenceRecorded(event: DrainedEvent): Promise<void> {
  const payload = event.payload as AbsenceRecordedPayload;
  const { tenantId, siteId } = event;

  if (payload.motif !== "INJUSTIFIE") return;

  const annee = await getAnneeCourante(tenantId);
  if (!annee) {
    console.warn(`[learnos/absence-recorded] tenant ${tenantId} sans année courante`);
    return;
  }

  const date = new Date(payload.date);
  const debut = annee.dateDebut;
  const fin = annee.dateFin;

  // `eleve` possède `siteId` → filtre direct.
  const eleveSiteFilter = siteFilterFromSession("TENANT_ADMIN", siteId, [], true);
  // `absence` n'a pas `siteId` → filtre via la relation `eleve`.
  const absenceSiteFilter = siteFilterForRelation("TENANT_ADMIN", siteId, [], "eleve", true);

  const eleve = await prisma.eleve.findFirst({
    where: { id: payload.eleveId, tenantId, ...eleveSiteFilter },
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

  // eslint-disable-next-line ecolpro/require-annee-filter -- événement drainé : comptage sur une plage de dates déjà calculée
  const lignes = await prisma.absence.groupBy({
    by: ["isRetard"],
    where: {
      tenantId,
      ...absenceSiteFilter,
      eleveId: payload.eleveId,
      date: { gte: debut, lte: fin },
      motif: "INJUSTIFIE" as const,
    },
    _count: { _all: true },
  });

  const count = lignes.find((l) => !l.isRetard)?._count._all ?? 0;
  const retards = lignes.find((l) => l.isRetard)?._count._all ?? 0;
  const equivalent = absencesEquivalentes({ absences: count, retards });

  if (equivalent < SEUIL_ATTENTION) return;

  const niveau = equivalent >= SEUIL_ELEVE ? NiveauAlerteParent.URGENT : NiveauAlerteParent.ATTENTION;
  const semaine = semaineScolaire(date, debut);

  const alertes = eleve.parents.map((ep) => ({
    tenantId,
    siteId: eleve.siteId,
    eleveId: payload.eleveId,
    parentId: ep.parentId,
    niveau,
    cle: "absence.frequence",
    // `semaine` ne sert qu'à l'empreinte : le décompte porte sur l'année, pas
    // sur la semaine — le message le disait pourtant, à tort.
    params: { count, retards },
    empreinte: `absence-freq-${payload.eleveId}-${ep.parentId}-${semaine}`,
  }));

  if (alertes.length === 0) return;

  // Les empreintes uniques assurent l'idempotence : pas d'alerte en double.
  await prisma.alerteParent.createMany({ data: alertes, skipDuplicates: true });
}
