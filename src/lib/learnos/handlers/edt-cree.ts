/**
 * Handler `edt.cree`
 * ==================
 *
 * Quand un créneau emploi du temps est créé, on génère les séances
 * pédagogiques correspondantes pour chaque semaine de l'année scolaire
 * (ou de la période, si le créneau est périodique).
 *
 * Le calcul est purement déterministe : une heure de cours le mardi 8h-10h
 * produit une séance chaque mardi de la période. Le handler est idempotent :
 * les séances déjà existantes aux mêmes dates sont simplement ignorées.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { EdtCreePayload } from "@/lib/learnos/events";
import {
  datesDeLaSemaine,
  nombreDeSemaines,
  semaineScolaire,
} from "@/lib/learnos/planification-pure";
import { siteFilterFromSession } from "@/lib/site-scope";
import { StatutSeance } from "@prisma/client";

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

const JOUR_OFFSET: Record<string, number> = {
  DIMANCHE: 0,
  LUNDI: 1,
  MARDI: 2,
  MERCREDI: 3,
  JEUDI: 4,
  VENDREDI: 5,
  SAMEDI: 6,
};

function parseHeure(heure: string): { h: number; m: number } {
  const [h, m] = heure.split(":").map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

function dureeMinutes(debut: string, fin: string): number {
  const d = parseHeure(debut);
  const f = parseHeure(fin);
  return (f.h - d.h) * 60 + (f.m - d.m);
}

export async function onEmploiDuTempsCree(event: DrainedEvent): Promise<void> {
  const payload = event.payload as EdtCreePayload;
  const { tenantId } = event;

  // Scope de fond : le site est porté par l'événement (hérité de la classe).
  const siteFilter = siteFilterFromSession("TENANT_ADMIN", event.siteId, [], true);

  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId, libelle: payload.annee },
    select: { id: true, dateDebut: true, dateFin: true },
  });
  if (!annee) {
    console.warn(`[learnos/edt-cree] année ${payload.annee} introuvable pour ${tenantId}`);
    return;
  }

  // Le site du créneau est celui de la classe.
  const classe = await prisma.classe.findFirst({
    where: { id: payload.classeId, tenantId, ...siteFilter },
    select: { siteId: true },
  });
  if (!classe) {
    console.warn(`[learnos/edt-cree] classe ${payload.classeId} introuvable`);
    return;
  }
  const siteId = classe.siteId;

  let semaineDebut = 1;
  let semaineFin = nombreDeSemaines(annee.dateDebut, annee.dateFin);
  let borneDebut = annee.dateDebut;
  let borneFin = annee.dateFin;

  if (payload.periodeId) {
    const periode = await prisma.periode.findFirst({
      // eslint-disable-next-line ecolpro/require-site-filter -- tâche de fond, scope via anneeId appartenant au tenant
      where: { id: payload.periodeId, anneeId: annee.id },
      select: { dateDebut: true, dateFin: true },
    });
    if (periode) {
      borneDebut = periode.dateDebut;
      borneFin = periode.dateFin;
      semaineDebut = Math.max(1, semaineScolaire(borneDebut, annee.dateDebut));
      semaineFin = Math.min(semaineFin, semaineScolaire(borneFin, annee.dateDebut));
    }
  }

  // Séances déjà existantes pour le même créneau (même classe/matière/prof).
  const existantes = await prisma.seancePedagogique.findMany({
    // eslint-disable-next-line ecolpro/require-site-filter -- scope via identifiants pédagogiques
    where: {
      tenantId,
      classeId: payload.classeId,
      matiereId: payload.matiereId,
      enseignantId: payload.enseignantId,
      date: { gte: borneDebut, lte: borneFin },
    },
    select: { date: true },
  });
  const deja = new Set(existantes.map((s) => s.date.toISOString()));

  const jourValue = JOUR_OFFSET[payload.jour];
  if (jourValue === undefined) {
    console.warn(`[learnos/edt-cree] jour inconnu : ${payload.jour}`);
    return;
  }

  const duree = dureeMinutes(payload.heureDebut, payload.heureFin);
  const { h: hd, m: md } = parseHeure(payload.heureDebut);
  const seances = [];

  for (let s = semaineDebut; s <= semaineFin; s++) {
    const { debut } = datesDeLaSemaine(s, annee.dateDebut);
    const offset = (jourValue - debut.getDay() + 7) % 7;
    const jourDate = new Date(debut.getTime() + offset * MS_PAR_JOUR);
    const date = new Date(
      jourDate.getFullYear(),
      jourDate.getMonth(),
      jourDate.getDate(),
      hd,
      md
    );

    if (deja.has(date.toISOString())) continue;

    seances.push({
      tenantId,
      siteId,
      classeId: payload.classeId,
      matiereId: payload.matiereId,
      enseignantId: payload.enseignantId,
      date,
      dureePrevue: duree,
      semaine: s,
      statut: StatutSeance.PLANIFIEE,
    });
  }

  if (seances.length === 0) return;

  await prisma.seancePedagogique.createMany({ data: seances });
}
