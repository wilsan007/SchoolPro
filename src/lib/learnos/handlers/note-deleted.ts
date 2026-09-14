/**
 * Handler `note.deleted`
 * =======================
 *
 * Quand une note est supprimée, toutes les preuves d'apprentissage qui en
 * étaient issues doivent être retirées, puis les profils et recommandations
 * recalculés sans cette note.
 *
 * Idempotent : `deleteMany` sur `sourceId = noteId` ne fait rien si les
 * preuves ont déjà été supprimées. Le recalcul de profil lit les preuves
 * restantes — sans la note supprimée, le profil se met à jour naturellement.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { NoteDeletedPayload } from "@/lib/learnos/events";
import { recalculerProfilsApresPreuve } from "@/lib/learnos/learning-twin";
import {
  recalculerRecommandationsApresProfil,
} from "@/lib/learnos/recommendation-engine";

export async function onNoteDeleted(event: DrainedEvent): Promise<void> {
  const p = event.payload as NoteDeletedPayload;

  if (!p?.noteId || !p.eleveId) {
    throw new Error(
      `note.deleted incomplet (événement ${event.id}) : noteId/eleveId requis`
    );
  }

  // Étape 1 : supprimer toutes les preuves issues de cette note.
   
  await prisma.learningEvidence.deleteMany({
    where: { tenantId: event.tenantId, sourceType: "note", sourceId: p.noteId },
  });

  // Étape 2 : recalculer les profils sans cette preuve.
  // On construit un événement compatible avec recalculerProfilsApresPreuve :
  // le jumeau lit les preuves restantes et recalcule le profil à partir
  // de ce qui existe en base — la note supprimée n'y est plus.
  const fauxEventForRecalc: DrainedEvent = {
    ...event,
    eventType: "note.recorded",
    payload: {
      noteId: p.noteId,
      eleveId: p.eleveId,
      classeId: p.classeId,
      matiereId: p.matiereId,
      periodeId: null,
      evaluationId: null,
      valeur: p.valeur,
      noteMax: p.noteMax,
      coefficient: p.coefficient,
      type: p.type,
      intitule: p.intitule,
      date: p.date,
      saisieParId: p.supprimeParId,
    },
  };

  await recalculerProfilsApresPreuve(fauxEventForRecalc);

  // Étape 3 : recalculer les recommandations à partir des profils mis à jour.
  await recalculerRecommandationsApresProfil(fauxEventForRecalc);
}
