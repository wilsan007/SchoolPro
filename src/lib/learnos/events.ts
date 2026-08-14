/**
 * EcolPro / LEARNOS — Bus d'événements (publication)
 * ==================================================
 *
 * LEARNOS observe l'ERP ; il ne le modifie pas. Ce module est le seul point
 * de contact entre les deux, et il obéit à une règle non négociable
 * (spécification LEARNOS §49-1) :
 *
 *     LEARNOS ne doit JAMAIS casser l'ERP.
 *
 * D'où trois propriétés tenues ici :
 *
 *  1. **`publishEvent` ne lève jamais.** Une saisie de notes doit aboutir même
 *     si LEARNOS est en panne, mal configuré, ou si sa table est absente.
 *     L'échec de publication est signalé en console, jamais propagé.
 *
 *  2. **Publication ≠ traitement.** On n'écrit qu'une ligne (quelques
 *     millisecondes) ; l'analyse, elle, est drainée à part par
 *     `src/lib/learnos/event-bus.ts`. L'enseignant n'attend jamais un LLM.
 *
 *  3. **Instantané autosuffisant.** Le `payload` porte tout ce dont le
 *     traitement aura besoin. Il ne relit pas la note : celle-ci a pu être
 *     corrigée ou supprimée entre-temps, et c'est bien l'état *au moment du
 *     fait* qui constitue la preuve d'apprentissage.
 */

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

/**
 * Faits observables de l'ERP. Ajouter un type ici ne suffit pas à le rendre
 * actif : il faut aussi le publier depuis le code métier concerné, et lui
 * associer un traitement dans `event-bus.ts`.
 */
export const LEARNOS_EVENT_TYPES = [
  "note.recorded",
  "note.updated",
  "note.deleted",
  "absence.recorded",
  "evaluation.completed",
] as const;

export type LearnosEventType = (typeof LEARNOS_EVENT_TYPES)[number];

/** Instantané d'une note au moment où elle est enregistrée. */
export interface NoteRecordedPayload {
  noteId: string;
  eleveId: string;
  classeId: string;
  matiereId: string;
  periodeId: string | null;
  evaluationId: string | null;
  valeur: number;
  noteMax: number;
  coefficient: number;
  type: string;
  intitule: string | null;
  date: string;
  saisieParId: string | null;
}

export interface LearnosEventInput {
  tenantId: string;
  /**
   * Site de rattachement, hérité de l'élève concerné (et non du site
   * « sélectionné » par l'utilisateur, qui peut différer).
   */
  siteId?: string | null;
  eventType: LearnosEventType;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

/**
 * Enregistre un fait observé, sans jamais interrompre l'appelant.
 *
 * Ne pas `await` sur le chemin critique si la latence compte : l'appel est
 * bref, mais un `void publishEvent(...)` reste possible. Préférer malgré tout
 * l'`await` — sur Vercel, une promesse non attendue peut être perdue au gel de
 * la fonction, ce qui est précisément ce que l'outbox cherche à éviter.
 */
export async function publishEvent(input: LearnosEventInput): Promise<void> {
  await publishEvents([input]);
}

/**
 * Variante groupée — une seule requête pour un lot (saisie d'une classe
 * entière, import). Préférer celle-ci dès qu'il y a plus d'un événement.
 */
export async function publishEvents(inputs: LearnosEventInput[]): Promise<void> {
  if (inputs.length === 0) return;

  try {
    await prisma.learnosEvent.createMany({
      data: inputs.map((e) => ({
        tenantId: e.tenantId,
        siteId: e.siteId ?? null,
        eventType: e.eventType,
        aggregateType: e.aggregateType,
        aggregateId: e.aggregateId,
        payload: e.payload as Prisma.InputJsonValue,
      })),
    });
  } catch (error) {
    // Volontairement avalé : voir l'en-tête de fichier. Un incident LEARNOS ne
    // doit pas transformer une saisie de notes réussie en erreur 500.
    console.error(
      `[learnos/events] publication de ${inputs.length} événement(s) échouée`,
      error
    );
  }
}
