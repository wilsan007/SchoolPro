// ------------------------------------------------------------
// Fiabilité observée du correcteur assisté
// ------------------------------------------------------------
//
// Module pur. La seule vérité disponible sur la qualité d'un correcteur assisté
// est ce que les enseignants en font : ils confirment la proposition, ou la
// changent. Chaque validation est donc une mesure — gratuite, et faite sur de
// vraies copies.

/**
 * Type de preuve produit à la validation : `EXERCICE`, c'est-à-dire supervisé.
 *
 * Un adulte a relu la production : la preuve vaut ce que vaut un exercice corrigé
 * par un enseignant (cf. `FIABILITE_PAR_TYPE.EXERCICE`). Lui appliquer la décote
 * de l'entraînement autonome reviendrait à ignorer qu'une personne l'a vérifiée ;
 * la traiter comme un examen, à surestimer ce qui reste un exercice.
 */
export const EVIDENCE_TYPE_VALIDATION = "EXERCICE" as const;

/**
 * Nombre de critères sur lesquels l'enseignant diffère du modèle.
 */
export function compterEcarts(
  proposes: readonly string[],
  valides: readonly string[],
  tousLesCriteres: readonly string[]
): number {
  const p = new Set(proposes);
  const v = new Set(valides);
  return tousLesCriteres.filter((id) => p.has(id) !== v.has(id)).length;
}

export interface MesureValidation {
  /** `false` pour un rejet pur. */
  validee: boolean;
  ecarts: number;
  nbCriteres: number;
}

export interface FiabiliteCorrecteur {
  /** Corrections relues (validées ou rejetées). */
  relues: number;
  /** Part des propositions confirmées telles quelles. */
  tauxConfirmees: number;
  /** Part des critères sur lesquels l'enseignant a changé d'avis. */
  tauxEcartCriteres: number;
  /** Part des propositions écartées en bloc. */
  tauxRejets: number;
  /** Faux de la mesure : en dessous, la fiabilité n'est pas interprétable. */
  suffisant: boolean;
}

/** Échantillon minimal avant d'afficher une fiabilité comme autre chose qu'un ordre de grandeur. */
export const ECHANTILLON_MIN = 30;

/**
 * Résume la fiabilité observée à partir des validations.
 *
 * Aucune valeur par défaut flatteuse : sans mesure, tous les taux valent 0 et
 * `suffisant` est faux — l'appelant doit afficher « pas assez de données », pas
 * « 100 % ».
 */
export function fiabiliteObservee(mesures: readonly MesureValidation[]): FiabiliteCorrecteur {
  const relues = mesures.length;
  if (relues === 0) {
    return { relues: 0, tauxConfirmees: 0, tauxEcartCriteres: 0, tauxRejets: 0, suffisant: false };
  }
  const rejets = mesures.filter((m) => !m.validee).length;
  const validees = mesures.filter((m) => m.validee);
  const confirmees = validees.filter((m) => m.ecarts === 0).length;
  const criteres = validees.reduce((s, m) => s + m.nbCriteres, 0);
  const ecarts = validees.reduce((s, m) => s + m.ecarts, 0);

  return {
    relues,
    tauxConfirmees: confirmees / relues,
    tauxEcartCriteres: criteres > 0 ? ecarts / criteres : 0,
    tauxRejets: rejets / relues,
    suffisant: relues >= ECHANTILLON_MIN,
  };
}
