import type { ErrorType } from "@prisma/client";

// ------------------------------------------------------------
// Libellés de types d'erreur
// ------------------------------------------------------------
//
// `ErrorType` est une clé de traduction, jamais une phrase : la même valeur
// voyage dans `Question.structure` (distracteur annoté), dans `GrilleCorrection`
// (erreur anticipée) et dans les erreurs relevées par une correction assistée.
// Cette carte est l'endroit unique où l'on décrit chacune d'elles.

export const TypesErreursI18n: Record<ErrorType, string> = {
  CONCEPTUAL_ERROR: "CONCEPTUAL_ERROR",
  PROCEDURAL_ERROR: "PROCEDURAL_ERROR",
  CALCULATION_ERROR: "CALCULATION_ERROR",
  READING_ERROR: "READING_ERROR",
  MISINTERPRETATION: "MISINTERPRETATION",
  MISSING_PREREQUISITE: "MISSING_PREREQUISITE",
  INCOMPLETE_REASONING: "INCOMPLETE_REASONING",
  CARELESS_ERROR: "CARELESS_ERROR",
  GUESS: "GUESS",
  UNKNOWN: "UNKNOWN",
  NOTATION_ERROR: "NOTATION_ERROR",
  ARGUMENT_UNJUSTIFIED: "ARGUMENT_UNJUSTIFIED",
  WRITING_ERROR: "WRITING_ERROR",
};

/**
 * Clé i18n d'un type d'erreur (`learnos.banque.erreur_<type>`).
 *
 * Retourne la clé même pour un type inconnu plutôt qu'une phrase en clair : une
 * clé non traduite se voit à l'écran, une phrase figée non.
 */
export function errorTypeToI18n(type: ErrorType): string {
  return TypesErreursI18n[type] ?? type;
}