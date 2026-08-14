/**
 * EcolPro / LEARNOS — Moteur de preuves d'apprentissage
 * =====================================================
 *
 * Transforme un fait de l'ERP (une note enregistrée) en `LearningEvidence` :
 * ce que cette production dit du niveau de l'élève, et à quel point on peut
 * s'y fier.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE
 * ------------------------------------------------
 * Spécification LEARNOS §38 : « Ne pas appeler un LLM là où une règle suffit. »
 * Normaliser un score et pondérer sa fiabilité relèvent de l'arithmétique. Y
 * mettre un modèle coûterait de l'argent, introduirait de la latence, et
 * surtout rendrait le résultat non reproductible — un même bulletin
 * produirait deux analyses différentes. Le routeur IA refuserait d'ailleurs
 * ces tâches (`complexity: "deterministic"`).
 *
 * FRONTIÈRE ASSUMÉE
 * -----------------
 * Ce moteur ne déduit PAS le type d'erreur. Un score seul ne dit pas *pourquoi*
 * l'élève a échoué : confusion de concept, erreur de calcul, prérequis manquant
 * ou inattention produisent le même 8/20. Cette qualification demande de voir
 * les réponses — c'est l'objet du moteur de diagnostic (P5). Inventer un type
 * d'erreur ici produirait une donnée fausse mais crédible, ce qui est pire que
 * son absence.
 *
 * LA NOTE OFFICIELLE N'EST JAMAIS TOUCHÉE
 * ---------------------------------------
 * `masterySignal` est une estimation pédagogique, pas une note. `Note.valeur`
 * reste la seule vérité administrative (§ principe de la couche fantôme).
 */

import { createHash } from "node:crypto";
import type { EvidenceType, TypeNote } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { NoteRecordedPayload } from "@/lib/learnos/events";

/**
 * Nature pédagogique d'une production, déduite du type administratif de l'ERP.
 *
 * Les deux nomenclatures sont volontairement distinctes : `TypeNote` sert la
 * gestion (bulletins, coefficients), `EvidenceType` sert l'analyse. Le `switch`
 * est exhaustif — ajouter un `TypeNote` sans décider de sa nature pédagogique
 * casse la compilation plutôt que de retomber silencieusement sur une valeur
 * par défaut.
 */
export function evidenceTypeFromNote(type: TypeNote): EvidenceType {
  switch (type) {
    case "EXAMEN":
      return "EXAMEN";
    case "CONTROLE":
    case "DEVOIR":
      return "DEVOIR";
    case "INTERROGATION":
      return "QUIZ";
    case "PROJET":
      return "PROJET";
    case "ORAL":
      return "ORAL";
    case "TP":
      return "EXERCICE";
  }
}

/**
 * Fiabilité intrinsèque d'un type de production (0..1).
 *
 * Un examen surveillé, long et récapitulatif renseigne mieux sur la maîtrise
 * réelle qu'une interrogation surprise de cinq minutes. Ces valeurs ne sont pas
 * des vérités : ce sont des hypothèses explicites, révisables, qu'on préfère
 * lisibles ici plutôt que noyées dans un modèle.
 */
export const FIABILITE_PAR_TYPE: Record<EvidenceType, number> = {
  EXAMEN: 0.9,
  PROJET: 0.8,
  DEVOIR: 0.75,
  EXERCICE: 0.6,
  RETEST: 0.6,
  ORAL: 0.5,
  QUIZ: 0.4,
  OBSERVATION: 0.3,
  // Fait seul, sans témoin : le score peut être juste, copié, ou obtenu à
  // force de tentatives — et rien dans la donnée ne permet de trancher. 0,2
  // n'est pas une punition, c'est l'aveu de ce qu'on ignore. Conséquence
  // mécanique de l'agrégation (`weight × confidence`) : il faut une bonne
  // dizaine de séances autonomes pour peser autant qu'un devoir surveillé.
  // Tricher reste donc possible, mais sans effet mesurable — ce qui est la
  // seule défense qui ne demande ni surveillance ni suspicion.
  AUTO_ENTRAINEMENT: 0.2,
};

/**
 * Types de preuve produits sans qu'un adulte n'atteste de leur production.
 *
 * La distinction sert au verrou du jumeau d'apprentissage : une compétence ne
 * peut pas être déclarée acquise sur ces seules preuves (cf.
 * `statutDeMaitrise`). Sans ce verrou, la faible fiabilité serait contournable
 * par le volume — vingt séances autonomes finiraient par franchir le seuil.
 */
const TYPES_NON_SUPERVISES: ReadonlySet<EvidenceType> = new Set<EvidenceType>([
  "AUTO_ENTRAINEMENT",
]);

/** Un adulte atteste-t-il de la production de cette preuve ? */
export function estSupervisee(type: EvidenceType): boolean {
  return !TYPES_NON_SUPERVISES.has(type);
}

/**
 * Finesse du barème (0..1).
 *
 * Une note sur 20 distingue vingt niveaux ; une note sur 2, deux. À score
 * relatif égal, la première est plus informative. On ne pénalise donc pas la
 * *valeur* mais la *résolution* de la mesure.
 */
function facteurBareme(noteMax: number): number {
  if (noteMax >= 20) return 1;
  if (noteMax >= 10) return 0.9;
  if (noteMax >= 5) return 0.8;
  return 0.7;
}

export interface SignalCalcule {
  /** 0..1 — ce que le score dit du niveau. N'est PAS une note officielle. */
  masterySignal: number;
  /** 0..1 — à quel point on se fie à ce signal. Distinct de la maîtrise. */
  confidence: number;
  /** Poids dans l'agrégation ultérieure : le coefficient posé par l'enseignant. */
  weight: number;
}

/**
 * Cœur du calcul, isolé de toute base de données pour être testable seul.
 *
 * `confidence` et `masterySignal` sont délibérément indépendants : un 2/20 est
 * un signal *bas* mais peut être *fiable*. Les confondre — comme le ferait une
 * moyenne unique — empêcherait de distinguer « cet élève ne maîtrise pas » de
 * « nous n'en savons pas assez », alors que ces deux situations appellent des
 * réactions opposées.
 */
export function calculerSignal(input: {
  valeur: number;
  noteMax: number;
  coefficient: number;
  evidenceType: EvidenceType;
}): SignalCalcule {
  const { valeur, noteMax, coefficient, evidenceType } = input;

  // Un barème nul ou négatif est une donnée aberrante : on ne peut rien en
  // normaliser. Signal neutre, confiance nulle — c'est-à-dire « aucune
  // information », et non « échec ».
  if (!Number.isFinite(noteMax) || noteMax <= 0) {
    return { masterySignal: 0, confidence: 0, weight: 0 };
  }

  // Bornage : une note au-dessus du barème (bonus) ne doit pas produire un
  // signal supérieur à 1, qui fausserait toute agrégation en aval.
  const brut = valeur / noteMax;
  const masterySignal = Math.min(1, Math.max(0, brut));

  const confidence = Math.min(
    1,
    FIABILITE_PAR_TYPE[evidenceType] * facteurBareme(noteMax)
  );

  // Le coefficient est la déclaration d'importance de l'enseignant : on la
  // reprend telle quelle, en la bornant pour qu'une saisie aberrante
  // (coefficient 999) n'écrase pas tout le reste.
  const weight = Math.min(10, Math.max(0, coefficient || 1));

  return { masterySignal, confidence, weight };
}

/**
 * Identifiant déterministe d'une preuve.
 *
 * La livraison des événements est « au moins une fois » : le même fait peut
 * être traité deux fois. Dériver l'identifiant de la source rend l'écriture
 * idempotente par construction. Une contrainte d'unicité ne suffirait pas :
 * PostgreSQL traite les NULL comme distincts, si bien que deux preuves sans
 * compétence rattachée passeraient toutes deux.
 */
export function evidenceId(
  sourceType: string,
  sourceId: string,
  competenceId: string | null
): string {
  return createHash("sha256")
    .update(`${sourceType}|${sourceId}|${competenceId ?? ""}`)
    .digest("hex")
    .slice(0, 24);
}

/**
 * Traite un événement `note.recorded` : produit une preuve par compétence
 * rattachée à l'évaluation, ou une preuve de granularité « matière » si le
 * curriculum ne dit rien encore.
 *
 * Idempotent (cf. `evidenceId`) : rejouer l'événement met à jour les mêmes
 * lignes au lieu d'en créer de nouvelles.
 */
export async function ingererNoteCommePreuve(event: DrainedEvent): Promise<void> {
  const p = event.payload as NoteRecordedPayload;

  // Garde-fou : un payload amputé indique un défaut de publication, pas une
  // situation métier. On échoue franchement pour que l'événement soit retenté
  // et que l'anomalie remonte, plutôt que d'écrire une preuve incohérente.
  if (!p?.noteId || !p.eleveId || typeof p.valeur !== "number") {
    throw new Error(
      `note.recorded incomplet (événement ${event.id}) : noteId/eleveId/valeur requis`
    );
  }

  const evidenceType = evidenceTypeFromNote(p.type as TypeNote);
  const signal = calculerSignal({
    valeur: p.valeur,
    noteMax: p.noteMax,
    coefficient: p.coefficient,
    evidenceType,
  });

  // Compétences visées par l'évaluation, si le curriculum les a rattachées.
  const rattachements = p.evaluationId
    ? await prisma.evaluationCompetence.findMany({
        where: { evaluationId: p.evaluationId, tenantId: event.tenantId },
        select: { competenceId: true, poids: true },
      })
    : [];

  // Aucun rattachement : une seule preuve, sans compétence — utile malgré tout
  // au niveau matière, et affinable plus tard par rejeu des événements.
  const cibles =
    rattachements.length > 0
      ? rattachements
      : [{ competenceId: null as string | null, poids: 1 }];

  for (const cible of cibles) {
    const id = evidenceId("note", p.noteId, cible.competenceId);

    const donnees = {
      tenantId: event.tenantId,
      siteId: event.siteId,
      eleveId: p.eleveId,
      competenceId: cible.competenceId,
      matiereId: p.matiereId ?? null,
      sourceType: "note",
      sourceId: p.noteId,
      noteId: p.noteId,
      evaluationId: p.evaluationId,
      evidenceType,
      rawScore: p.valeur,
      maxScore: p.noteMax,
      // Date du devoir, et non de l'écriture : c'est elle qui pondère la
      // récence dans le jumeau d'apprentissage.
      occurredAt: p.date ? new Date(p.date) : new Date(),
      masterySignal: signal.masterySignal,
      confidence: signal.confidence,
      // Une évaluation partagée entre plusieurs compétences ne pèse pas son
      // poids entier sur chacune : on répartit.
      weight: signal.weight * cible.poids,
      // Délibérément non renseigné : voir « frontière assumée » en tête de
      // fichier. Le diagnostic (P5) le remplira à partir des réponses.
      errorType: null,
      errorConfidence: null,
      metadata: {
        intitule: p.intitule,
        typeNote: p.type,
        coefficient: p.coefficient,
        dateNote: p.date,
        poidsCompetence: cible.poids,
      },
    };

    await prisma.learningEvidence.upsert({
      where: { id },
      create: { id, ...donnees },
      update: donnees,
    });
  }
}
