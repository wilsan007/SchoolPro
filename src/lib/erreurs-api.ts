/**
 * EcolPro — Erreurs d'API traduisibles
 * ====================================
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * Une route qui répond `{ error: "Élève introuvable" }` impose le français à
 * tout le monde : le client n'a plus qu'une phrase, il ne peut pas la traduire.
 * Un parent somalophone du bot verrait un message français au milieu d'un
 * échange en somali.
 *
 * On renvoie donc un **code stable** — que le client traduit — accompagné de
 * `params` pour les valeurs variables, et de `error` en français comme repli
 * pour les appelants qui ne connaissent pas le code (journaux, scripts, outils
 * externes). Le repli n'est jamais affiché quand la clé existe côté client.
 *
 * Le statut HTTP est attaché au code : « introuvable » vaut toujours 404, et
 * ne peut pas dériver d'une route à l'autre.
 */

import { NextResponse } from "next/server";

/** Valeurs interpolées dans un message d'erreur (ex. le nombre de preuves). */
export type ParamsErreur = Record<string, string | number>;

type Message = string | ((p: ParamsErreur) => string);

interface Definition {
  statut: number;
  fr: Message;
}

/**
 * Catalogue des erreurs. La clé est le contrat avec le client — la renommer
 * casse la traduction, pas la compilation : ne renommez pas, ajoutez.
 */
const CATALOGUE = {
  // — Accès et validation —
  NON_AUTORISE: { statut: 401, fr: "Non autorisé" },
  DONNEES_INVALIDES: { statut: 400, fr: "Données invalides" },
  STATUT_INVALIDE: { statut: 400, fr: "Statut invalide" },
  CHAMPS_REPONSE_REQUIS: {
    statut: 400,
    fr: "exerciceId, index et reponse sont requis",
  },

  // — Ressources introuvables —
  ELEVE_INTROUVABLE: { statut: 404, fr: "Élève introuvable" },
  EVALUATION_INTROUVABLE: { statut: 404, fr: "Évaluation introuvable" },
  MATIERE_INTROUVABLE: { statut: 404, fr: "Matière introuvable" },
  CHAPITRE_INTROUVABLE: { statut: 404, fr: "Chapitre introuvable" },
  COMPETENCE_INTROUVABLE: { statut: 404, fr: "Compétence introuvable" },
  PARCOURS_INTROUVABLE: { statut: 404, fr: "Parcours introuvable" },
  RECOMMANDATION_INTROUVABLE: { statut: 404, fr: "Recommandation introuvable" },
  SEANCE_INTROUVABLE: { statut: 404, fr: "Séance introuvable" },
  PLANIFICATION_INTROUVABLE: { statut: 404, fr: "Planification introuvable" },
  ANNEE_INTROUVABLE: { statut: 404, fr: "Année scolaire introuvable" },
  EVENEMENT_INTROUVABLE: { statut: 404, fr: "Événement calendaire introuvable" },
  AUCUNE_ANNEE_COURANTE: { statut: 400, fr: "Aucune année scolaire courante" },

  // — Périmètre : l'entrée existe peut-être, mais pas pour cet appelant —
  PREREQUIS_HORS_PERIMETRE: {
    statut: 400,
    fr: "Un ou plusieurs prérequis sont introuvables ou hors de votre périmètre.",
  },
  CHAPITRES_HORS_PERIMETRE: {
    statut: 400,
    fr: "Un ou plusieurs chapitres sont introuvables ou hors de votre périmètre.",
  },
  COMPETENCES_HORS_MATIERE: {
    statut: 400,
    fr: "Une ou plusieurs compétences sont introuvables ou hors de la matière évaluée.",
  },
  COMPETENCES_HORS_PERIMETRE: {
    statut: 400,
    fr: "Une ou plusieurs compétences sont introuvables ou hors de votre périmètre.",
  },

  // — Conflits : la demande est comprise, mais l'état la refuse —
  SEMAINES_INVERSEES: {
    statut: 400,
    fr: "La semaine de fin ne peut pas précéder la semaine de début.",
  },
  PARCOURS_DEJA_TRAITE: {
    statut: 409,
    fr: "Ce parcours n'est plus à valider — il a déjà été traité.",
  },
  CODE_COMPETENCE_DEJA_UTILISE: {
    statut: 409,
    fr: (p: ParamsErreur) =>
      `Le code « ${p.code} » est déjà utilisé par une autre compétence.`,
  },
  CYCLE_PREREQUIS: {
    statut: 409,
    fr:
      "Ce rattachement créerait un cycle : la compétence deviendrait, " +
      "directement ou indirectement, son propre prérequis.",
  },
  CHAPITRE_A_DES_COMPETENCES: {
    statut: 409,
    fr: (p: ParamsErreur) =>
      `Ce chapitre porte ${p.nb} compétence(s). Supprimez-les d'abord — les ` +
      `preuves d'apprentissage qui leur sont rattachées seraient perdues.`,
  },
  COMPETENCE_A_DES_PREUVES: {
    statut: 409,
    fr: (p: ParamsErreur) =>
      `Cette compétence porte ${p.nb} preuve(s) d'apprentissage. La supprimer ` +
      `effacerait l'historique des élèves.`,
  },
  COMPETENCE_A_DES_DEPENDANTS: {
    statut: 409,
    fr: (p: ParamsErreur) =>
      `${p.nb} compétence(s) la déclarent en prérequis. Retirez ce lien avant ` +
      `de supprimer.`,
  },

  // — Banque de questions et attestations —
  QUESTION_INTROUVABLE: { statut: 404, fr: "Question introuvable" },
  ATTESTATION_INTROUVABLE: { statut: 404, fr: "Attestation introuvable" },
  FORMAT_NON_AUTO_CORRIGEABLE: {
    statut: 400,
    fr:
      "Ce format demande un correcteur humain : il ne peut pas être servi en " +
      "entraînement autonome.",
  },
  STRUCTURE_INVALIDE: {
    statut: 400,
    fr:
      "La structure de la question est incomplète : vérifiez que chaque étape " +
      "a un énoncé, une réponse attendue, et que la bonne réponse figure bien " +
      "parmi les propositions.",
  },
  FEUILLE_DEJA_TRAITEE: {
    statut: 409,
    fr: (p: ParamsErreur) =>
      `Cette feuille n'est plus à valider — elle est déjà ${p.statut}.`,
  },
  // — Import d'un programme —
  FICHIER_INVALIDE: {
    statut: 400,
    fr: "Ce fichier n'a pas pu être lu. Attendu : un PDF.",
  },
  FICHIER_TROP_VOLUMINEUX: {
    statut: 413,
    fr: (p: ParamsErreur) =>
      `Fichier trop volumineux (limite : ${p.limiteMo} Mo). Importez le programme ` +
      `matière par matière plutôt qu'en un seul document.`,
  },
  PDF_SANS_TEXTE: {
    statut: 422,
    fr:
      "Ce PDF ne contient aucun texte : c'est une image scannée, et aucun moteur " +
      "de lecture d'images n'est configuré. Copiez le programme dans le champ " +
      "texte, ou fournissez un PDF qui n'est pas un scan.",
  },
  DOCUMENT_ILLISIBLE: {
    statut: 422,
    fr:
      "Le document a bien été scanné, mais la lecture n'a rien donné d'exploitable " +
      "— scan trop pâle, de travers, ou écriture trop serrée. Une photo mieux " +
      "éclairée, ou la saisie du texte à la main, règle le cas.",
  },
  // — Copies papier scannées —
  OCR_INDISPONIBLE: {
    statut: 503,
    fr:
      "Aucun moteur de lecture n'est disponible pour ce document. Une feuille " +
      "manuscrite exige un modèle capable de lire les images ; en attendant, " +
      "l'énoncé peut être collé dans le champ texte et les notes saisies à la main.",
  },
  FEUILLE_PAPIER_INTROUVABLE: {
    statut: 404,
    fr:
      "Aucune feuille papier n'attend de notation pour cette classe. Importez " +
      "d'abord la feuille d'énoncés, puis scannez les copies corrigées.",
  },
  POINTS_HORS_BAREME: {
    statut: 400,
    fr:
      "Une note dépasse le barème de son exercice. Corrigez-la avant " +
      "d'enregistrer — la ramener au barème à votre place inventerait votre " +
      "décision.",
  },
  IA_INDISPONIBLE: {
    statut: 503,
    fr:
      "Aucun service de génération n'est disponible actuellement. La banque " +
      "peut être remplie à la main en attendant.",
  },
} as const satisfies Record<string, Definition>;

export type CodeErreur = keyof typeof CATALOGUE;

/** Tous les codes existants — source du test de parité avec les traductions. */
export const CODES_ERREUR = Object.keys(CATALOGUE) as CodeErreur[];

/** Repli français. Sert aux journaux et aux appelants qui ignorent les codes. */
export function messageErreurFr(code: CodeErreur, params?: ParamsErreur): string {
  const { fr } = CATALOGUE[code] as Definition;
  return typeof fr === "function" ? fr(params ?? {}) : fr;
}

/** Statut HTTP associé au code — attaché ici pour qu'il ne dérive pas. */
export function statutErreur(code: CodeErreur): number {
  return (CATALOGUE[code] as Definition).statut;
}

/**
 * Réponse d'erreur normalisée.
 *
 * @param extra champs additionnels (ex. `details` d'un schéma Zod), jamais
 *              destinés à l'affichage — ils servent au diagnostic.
 */
export function erreurJson(
  code: CodeErreur,
  params?: ParamsErreur,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      code,
      error: messageErreurFr(code, params),
      ...(params ? { params } : {}),
      ...extra,
    },
    { status: statutErreur(code) }
  );
}
