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
  CLASSE_INTROUVABLE: { statut: 404, fr: "Classe introuvable" },
  SITE_INTROUVABLE: { statut: 404, fr: "Site introuvable" },
  PERIODE_INTROUVABLE: { statut: 404, fr: "Période introuvable" },
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

  // — Accès et périmètre (vie-scolaire, multi-tenant, multi-site) —
  ACCES_REFUSE: { statut: 403, fr: "Accès refusé" },
  ADHESION_INTROUVABLE: {
    statut: 403,
    fr: "Aucune adhésion active à ce tenant",
  },
  PERMISSIONS_INSUFFISANTES: { statut: 403, fr: "Permissions insuffisantes" },
  TOKEN_INVALIDE: { statut: 401, fr: "Token invalide" },
  SIGNATURE_INVALIDE: { statut: 401, fr: "Signature invalide" },

  // — Ressources introuvables (suite) —
  INCIDENT_INTROUVABLE: { statut: 404, fr: "Incident introuvable" },
  // — Vie scolaire : documentation de la résolution —
  ACTION_PRISE_REQUISE: {
    statut: 400,
    fr: "Vous devez décrire l'action concrètement prise pour résoudre l'incident",
  },
  MOTIF_CLASSEMENT_REQUIS: {
    statut: 400,
    fr: "Vous devez préciser le motif du classement sans suite",
  },
  // — Vie scolaire : cycle de vie des exclusions —
  SANCTION_INTROUVABLE: { statut: 404, fr: "Sanction introuvable" },
  SANCTION_NON_EXCLUSION: {
    statut: 400,
    fr: "Cette sanction n'est pas une exclusion : aucune réintégration à tracer",
  },
  EXCLUSION_DEJA_CLOSE: {
    statut: 409,
    fr: "Cette exclusion est déjà close : l'élève a déjà été réintégré",
  },
  TRAVAIL_DONNE_REQUIS: {
    statut: 400,
    fr: "La continuité pédagogique est obligatoire : renseignez le travail donné à l'élève",
  },
  ETABLISSEMENT_INTROUVABLE: { statut: 404, fr: "Établissement introuvable" },
  UTILISATEUR_INTROUVABLE: { statut: 404, fr: "Utilisateur introuvable" },

  // — Gouvernance —
  CONSEIL_INTROUVABLE: { statut: 404, fr: "Conseil introuvable" },
  REUNION_INTROUVABLE: { statut: 404, fr: "Réunion introuvable" },
  RESOLUTION_INTROUVABLE: { statut: 404, fr: "Résolution introuvable" },

  // — Mentorat —
  MENTORAT_INTROUVABLE: { statut: 404, fr: "Mentorat introuvable" },
  CONFLIT_MENTORAT_EXISTANT: {
    statut: 409,
    fr: "Une relation de mentorat active existe déjà entre ces deux personnes",
  },

  // — Conflits (suite) —
  SLUG_DEJA_UTILISE: { statut: 409, fr: "Ce slug est déjà utilisé" },

  // — Configuration et serveur —
  CONFIGURATION_MANQUANTE: { statut: 500, fr: "Configuration non définie" },
  ERREUR_SERVEUR: { statut: 500, fr: "Erreur serveur" },

  // — Facturation —
  FACTURE_INTROUVABLE: { statut: 404, fr: "Facture introuvable" },
  ECHEANCIER_INTROUVABLE: { statut: 404, fr: "Échéancier introuvable" },

  // — Réinscription —
  INVITATION_INTROUVABLE: { statut: 404, fr: "Invitation introuvable" },
  DEJA_REPONDU: { statut: 409, fr: "Vous avez déjà répondu à cette invitation" },
  CAMPAGNE_FERMEE: { statut: 403, fr: "La campagne de réinscription est fermée" },

  // — Mot de passe : complexité requise —
  PASSWORD_TOO_SHORT: {
    statut: 400,
    fr: "Le mot de passe doit faire au moins 8 caractères",
  },
  PASSWORD_MISSING_UPPERCASE: {
    statut: 400,
    fr: "Le mot de passe doit contenir au moins une lettre majuscule",
  },
  PASSWORD_MISSING_LOWERCASE: {
    statut: 400,
    fr: "Le mot de passe doit contenir au moins une lettre minuscule",
  },
  PASSWORD_MISSING_NUMBER: {
    statut: 400,
    fr: "Le mot de passe doit contenir au moins un chiffre",
  },
  PASSWORD_MISSING_SPECIAL: {
    statut: 400,
    fr: "Le mot de passe doit contenir au moins un caractère spécial (!@#$%^&*…)",
  },
  PASSWORD_DONT_MATCH: {
    statut: 400,
    fr: "Les mots de passe ne correspondent pas",
  },
  PASSWORD_SAME_AS_OLD: {
    statut: 400,
    fr: "Le nouveau mot de passe doit être différent de l'ancien",
  },
  WRONG_CURRENT_PASSWORD: {
    statut: 400,
    fr: "Le mot de passe actuel est incorrect",
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
