/**
 * EcolPro — Lecture côté client d'une erreur d'API
 *
 * Pendant de `erreurs-api.ts`. Volontairement séparé : ce module est importé
 * par des composants clients et ne doit rien entraîner de `next/server` dans
 * le bundle du navigateur.
 */

/** Forme d'une réponse d'erreur produite par `erreurJson`. */
export interface ReponseErreur {
  code?: string;
  error?: string;
  params?: Record<string, string | number>;
  /**
   * Cause technique renvoyée par le serveur (`erreurJson(code, _, { detail })`).
   *
   * Destinée au diagnostic, jamais à l'affichage — sauf quand le client n'a
   * rien de meilleur à montrer : une panne serveur dont le `detail` porte la
   * raison réelle (« Quota dépassé », « … ») informe davantage que la
   * traduction générique du code « Erreur serveur ».
   */
  detail?: string;
}

/** Traducteur minimal accepté — compatible avec celui de next-intl. */
export interface Traducteur {
  (cle: string, params?: Record<string, string | number>): string;
  has(cle: string): boolean;
}

/**
 * Texte à afficher pour une erreur d'API, par ordre de préférence :
 * la traduction du code, sinon le repli français renvoyé par le serveur,
 * sinon un message générique.
 *
 * Le repli intermédiaire compte : une route pas encore migrée, ou un code
 * ajouté sans sa clé de traduction, affiche une phrase utile plutôt que
 * `learnos.erreurs.XXX`.
 */
export function texteErreur(
  data: ReponseErreur | null | undefined,
  t: Traducteur,
  generique: string
): string {
  if (data?.code && t.has(data.code)) return t(data.code, data.params);
  return data?.error ?? generique;
}
