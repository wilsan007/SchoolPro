"use client";

import { useTranslations } from "next-intl";

/**
 * Recompose un motif ou une action dans la langue du lecteur.
 *
 * POURQUOI CE DÉTOUR
 * Les moteurs enregistrent la **règle déclenchée** et ses **paramètres**, pas
 * une phrase. Une phrase française figée en base interdirait au bot parent de
 * s'adresser à une famille en somali ou en arabe, et changer la langue de
 * l'établissement ne retraduirait rien.
 *
 * REPLI ASSUMÉ
 * Le texte rendu au moment de la décision reste stocké et sert de secours :
 * une règle retirée du catalogue, ou une décision ancienne dont les paramètres
 * n'ont pas été enregistrés, s'affiche quand même — un texte dans la mauvaise
 * langue vaut mieux qu'une clé brute sous les yeux d'un parent.
 */
export function TexteRegle({
  regle,
  params,
  secours,
  action = false,
}: {
  regle: string;
  params: unknown;
  /** Rendu enregistré à la décision, affiché si la règle est inconnue. */
  secours: string;
  /** `true` pour l'action proposée, `false` pour le motif. */
  action?: boolean;
}) {
  const t = useTranslations("learnos.regles");
  const cle = action ? `${regle}_action` : regle;

  if (!params || typeof params !== "object") return <>{secours}</>;

  try {
    return <>{t(cle, params as Record<string, string | number>)}</>;
  } catch {
    // Clé absente du catalogue : on retombe sur le rendu d'origine.
    return <>{secours}</>;
  }
}
