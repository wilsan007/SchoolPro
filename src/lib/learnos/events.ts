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
  "seance.cloturee",
  "devoir.enretard",
  "decalage.detecte",
  // Gestion du curriculum et de la planification pédagogique.
  "curriculum.imported",
  "chapitre.created",
  "competence.created",
  // Emploi du temps.
  "edt.cree",
  "edt.modifie",
  "edt.supprime",
  // Facturation.
  "facture.emise",
  // Périodes scolaires.
  "periode.cloturee",
  // Bulletins.
  "bulletin.publie",
  // Évaluations.
  "evaluation.publiee",
  // Cahier de textes.
  "devoir.corrige",
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

/** Instantané d'une absence au moment de l'appel. */
export interface AbsenceRecordedPayload {
  absenceId: string;
  eleveId: string;
  classeId: string;
  date: string;
  isRetard: boolean;
  motif: string;
}

/** Instantané d'une séance au moment où elle est clôturée (EFFECTUEE). */
export interface SeanceClotureePayload {
  seanceId: string;
  classeId: string;
  matiereId: string;
  chapitreId: string | null;
  enseignantId: string | null;
  semaine: number;
  competences: { competenceId: string; niveau: string }[];
  devoirsDonnes: number;
  presents: number | null;
  absents: number | null;
}

/** Instantané d'un devoir en retard (dateRendu dépassée, non rendu/corrigé). */
export interface DevoirEnRetardPayload {
  devoirId: string;
  classeId: string;
  matiereId: string;
  joursRetard: number;
}

/** Décalage détecté entre la planification et la réalité du terrain. */
export interface DecalageDetectePayload {
  classeId: string | null;
  matiereId: string;
  chapitreId: string;
  semainePrevue: number;
  semaineActuelle: number;
  niveauDecalage: string;
}

/** Instantané d'un import de programme : il déclenche la planification. */
export interface CurriculumImportedPayload {
  matiereId: string;
  niveau: string;
  chapitresCrees: number;
  competencesCreees: number;
}

/** Instantané d'un chapitre créé manuellement. */
export interface ChapitreCreatedPayload {
  chapitreId: string;
  matiereId: string;
  niveau: string;
  ordre: number;
  competencesCreees: number;
}

/** Instantané d'une compétence créée manuellement. */
export interface CompetenceCreatedPayload {
  competenceId: string;
  chapitreId: string;
}

/** Base d'un créneau d'emploi du temps. */
interface EdtSlotPayload {
  emploiTempsId: string;
  classeId: string;
  matiereId: string;
  enseignantId: string | null;
  jour: string;
  heureDebut: string;
  heureFin: string;
  salle: string | null;
  annee: string;
  periodeId: string | null;
}

/** Instantané d'un créneau d'emploi du temps créé. */
export interface EdtCreePayload extends EdtSlotPayload {}

/** Instantané d'un créneau d'emploi du temps modifié. */
export interface EdtModifiePayload extends EdtSlotPayload {}

/** Instantané d'un créneau d'emploi du temps supprimé. */
export interface EdtSupprimePayload extends EdtSlotPayload {}

/** Instantané d'une facture émise : génère l'échéancier par défaut. */
export interface FactureEmisePayload {
  factureId: string;
  eleveId: string;
  montant: number;
  devise: string;
  echeance: string | null;
  nbEcheances?: number;
  intervalleJours?: number;
  datePremiereEcheance?: string;
}

/** Instantané d'une période clôturée : pré-génère les bulletins. */
export interface PeriodeClotureePayload {
  periodeId: string;
  anneeId: string;
  anneeLibelle: string;
  statut: string;
}

/** Instantané d'une publication de bulletins : alerte parents. */
export interface BulletinPubliePayload {
  classeId: string;
  periodeId: string;
  periodeNom: string;
  anneeLibelle: string;
}

/** Instantané d'une évaluation publiée : alerte parents. */
export interface EvaluationPublieePayload {
  evaluationId: string;
  classeId: string;
  matiereId: string;
  matiereNom: string;
  periodeId: string | null;
  intitule: string | null;
  eleveIds: string[];
}

/** Instantané d'un devoir corrigé : alerte parents. */
export interface DevoirCorrigePayload {
  devoirId: string;
  classeId: string;
  matiereId: string;
  matiereNom: string;
  titre: string;
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
