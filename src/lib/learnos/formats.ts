/**
 * EcolPro / LEARNOS — Formats de question
 * =======================================
 *
 * Module minuscule et volontairement isolé : le sélecteur a besoin de savoir
 * quels formats il peut servir à un élève seul, et le moteur d'entraînement a
 * besoin de composer des feuilles. Loger la constante chez l'un des deux
 * créerait un cycle d'import — et dupliquer la liste garantirait qu'elle
 * diverge le jour où un format s'ajoute.
 */

import type { FormatQuestion } from "@prisma/client";

/**
 * Formats corrigeables sans enseignant.
 *
 * `SAISIE_LIBRE` en est exclu, et c'est toute la frontière du dispositif : une
 * rédaction demande un lecteur. La servir à un élève qui travaille seul
 * produirait une copie que personne ne relèvera, et une feuille éternellement
 * inachevée.
 */
export const FORMATS_AUTO_CORRIGEABLES: readonly FormatQuestion[] = [
  "SAISIE_COURTE",
  "CHOIX_UNIQUE",
  "ETAPES_GUIDEES",
  "REMISE_EN_ORDRE",
  "APPARIEMENT",
];

export function estAutoCorrigeable(format: FormatQuestion): boolean {
  return FORMATS_AUTO_CORRIGEABLES.includes(format);
}
