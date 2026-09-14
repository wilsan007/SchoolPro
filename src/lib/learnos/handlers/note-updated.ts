/**
 * Handler `note.updated`
 * =======================
 *
 * Quand une note est modifiée, la preuve d'apprentissage qui en était issue
 * doit être remplacée : l'ancienne preuve est supprimée, la nouvelle valeur
 * est réingérée, puis les profils et recommandations sont recalculés.
 *
 * Si la note baisse significativement (≥ 4 points sur 20), une alerte parent
 * est émise pour signaler la chute.
 *
 * Idempotent : la preuve est identifiée de façon déterministe par
 * `evidenceId("note", noteId, competenceId)`, donc un rejeu met à jour les
 * mêmes lignes au lieu d'en créer de nouvelles.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { NoteUpdatedPayload } from "@/lib/learnos/events";
import { ingererNoteCommePreuve } from "@/lib/learnos/evidence-engine";
import { recalculerProfilsApresPreuve } from "@/lib/learnos/learning-twin";
import {
  recalculerRecommandationsApresProfil,
} from "@/lib/learnos/recommendation-engine";
import { NiveauAlerteParent } from "@prisma/client";

/** Baisse de note déclenchant une alerte parent, en points sur 20. */
const SEUIL_BAISSE_ALERTE = 4;

export async function onNoteUpdated(event: DrainedEvent): Promise<void> {
  const p = event.payload as NoteUpdatedPayload;

  if (!p?.noteId || !p.eleveId || typeof p.valeur !== "number") {
    throw new Error(
      `note.updated incomplet (événement ${event.id}) : noteId/eleveId/valeur requis`
    );
  }

  // Étape 1 : supprimer les anciennes preuves liées à cette note.
  // Les preuves sont identifiées par sourceType="note" + sourceId=noteId.
   
  await prisma.learningEvidence.deleteMany({
    where: { tenantId: event.tenantId, sourceType: "note", sourceId: p.noteId },
  });

  // Étape 2 : réingérer la note avec la nouvelle valeur.
  // On construit un événement compatible avec ingererNoteCommePreuve.
  const fauxEventRecorded: DrainedEvent = {
    ...event,
    eventType: "note.recorded",
    payload: {
      noteId: p.noteId,
      eleveId: p.eleveId,
      classeId: p.classeId,
      matiereId: p.matiereId,
      periodeId: p.periodeId,
      evaluationId: p.evaluationId,
      valeur: p.valeur,
      noteMax: p.noteMax,
      coefficient: p.coefficient,
      type: p.type,
      intitule: p.intitule,
      date: p.date,
      saisieParId: p.modifieeParId,
    },
  };
  await ingererNoteCommePreuve(fauxEventRecorded);

  // Étape 3 : recalculer les profils à partir des preuves (incluant la nouvelle).
  await recalculerProfilsApresPreuve(fauxEventRecorded);

  // Étape 4 : recalculer les recommandations à partir des profils.
  await recalculerRecommandationsApresProfil(fauxEventRecorded);

  // Étape 5 : alerter les parents si la baisse est significative.
  const baisse = p.valeurAncienne - p.valeur;
  if (baisse >= SEUIL_BAISSE_ALERTE && p.noteMax > 0) {
    const baisseSur20 = (baisse / p.noteMax) * 20;
    if (baisseSur20 >= SEUIL_BAISSE_ALERTE) {
      await alerterParentBaisseNote(event.tenantId, p);
    }
  }
}

async function alerterParentBaisseNote(
  tenantId: string,
  p: NoteUpdatedPayload
): Promise<void> {
  // eslint-disable-next-line ecolpro/require-site-filter -- événement drainé, borné par (tenantId, eleveId)
  const eleve = await prisma.eleve.findFirst({
    where: { id: p.eleveId, tenantId },
    select: {
      id: true,
      siteId: true,
      prenom: true,
      nom: true,
      parents: { select: { parentId: true } },
    },
  });
  if (!eleve || eleve.parents.length === 0) return;

  const delta = p.valeur - p.valeurAncienne;
  const alertes = eleve.parents.map((ep) => ({
    tenantId,
    siteId: eleve.siteId,
    eleveId: p.eleveId,
    parentId: ep.parentId,
    niveau: NiveauAlerteParent.ATTENTION,
    cle: "note.baisse",
    params: { delta, noteId: p.noteId, intitule: p.intitule },
    empreinte: `note-baisse-${p.noteId}-${ep.parentId}`,
  }));

  await prisma.alerteParent.createMany({ data: alertes, skipDuplicates: true });
}
