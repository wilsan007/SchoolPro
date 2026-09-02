/**
 * Décision de fin d'année et appréciation générale, dérivées de la moyenne
 * annuelle (barème sur 20).
 *
 * Le bulletin annuel est le document décisionnel : les trois bulletins
 * trimestriels donnent les moyennes, le bilan annuel prononce le passage, le
 * passage conditionnel ou le redoublement. Les fonctions renvoient des CODES
 * stables — la traduction (fr/en/so) est faite à l'affichage, jamais ici, pour
 * respecter l'internationalisation.
 */

export type DecisionAnnuelleCode =
  | "PASSAGE"
  | "PASSAGE_CONDITIONNEL"
  | "REDOUBLEMENT";

export type MentionCode =
  | "FELICITATIONS"
  | "COMPLIMENTS"
  | "ENCOURAGEMENTS"
  | "SATISFAISANT"
  | "EFFORTS"
  | "INSUFFISANT";

/**
 * Décision du conseil de classe.
 *   ≥ 10   passage en classe supérieure
 *   8–10   passage conditionnel (soumis à l'appréciation du conseil)
 *   < 8    redoublement
 */
export function decisionAnnuelle(moyenne: number | null): DecisionAnnuelleCode | null {
  if (moyenne === null) return null;
  if (moyenne >= 10) return "PASSAGE";
  if (moyenne >= 8) return "PASSAGE_CONDITIONNEL";
  return "REDOUBLEMENT";
}

/** Mention / appréciation générale portée sur le bulletin. */
export function mentionAnnuelle(moyenne: number | null): MentionCode | null {
  if (moyenne === null) return null;
  if (moyenne >= 16) return "FELICITATIONS";
  if (moyenne >= 14) return "COMPLIMENTS";
  if (moyenne >= 12) return "ENCOURAGEMENTS";
  if (moyenne >= 10) return "SATISFAISANT";
  if (moyenne >= 8) return "EFFORTS";
  return "INSUFFISANT";
}
