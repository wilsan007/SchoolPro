/**
 * Formatage des dates — déterministe entre serveur et navigateur.
 * =============================================================
 * POURQUOI CE MODULE EXISTE
 *
 * `new Date(x).toLocaleDateString()` sans argument n'est pas une fonction pure :
 * la locale effective est celle du runtime. Le serveur Node en a une, le
 * navigateur une autre. Sur `/devoirs`, le serveur rendait `23/09/2026` et le
 * navigateur `9/23/2026` : React détectait la divergence d'hydratation,
 * abandonnait le HTML du serveur et régénérait l'arbre côté client — l'élève
 * français voyait donc soudain une date au format américain.
 *
 * Le remède est d'imposer la locale. L'application en compte trois (fr/en/so) :
 * chacune est associée à une locale ICU explicite, choisie une fois pour toutes
 * ici plutôt que dans un ternaire recopié à chaque appel.
 *
 * Le domaine métier n'est pas concerné : `src/lib/domain/note.ts` traite les
 * notes, ce module ne fait que de l'affichage.
 */

/** Locales supportées par l'application (cf. next-intl). */
export type LocaleApp = "fr" | "en" | "so";

/**
 * Correspondance langue applicative → locale ICU.
 *
 * `so-SO` peut ne pas être connu de toutes les plateformes ICU ; le navigateur
 * retombe alors sur la locale par défaut, mais il retombe de la MÊME façon au
 * rendu serveur et au rendu client dès lors que la chaîne est explicite : la
 * cohérence d'hydratation est donc préservée.
 */
const LOCALE_ICU: Record<LocaleApp, string> = {
  fr: "fr-FR",
  en: "en-US",
  so: "so-SO",
};

/** Convertit une langue applicative en locale ICU, avec repli sur le français. */
export function localeICU(locale: string | undefined | null): string {
  return LOCALE_ICU[(locale ?? "fr") as LocaleApp] ?? LOCALE_ICU.fr;
}

/** Options par défaut : date numérique complète, jour puis mois (usage courant en France). */
const OPTIONS_DATE: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

/**
 * Formate une date dans la langue de l'utilisateur.
 *
 * @param valeur  Date, ISO string ou timestamp.
 * @param locale  Langue applicative (`useLocale()` dans un composant client).
 * @param options Options `Intl.DateTimeFormatOptions`, facultatives.
 * @returns       Une date formatée, identique au rendu serveur et au rendu client.
 */
export function formatDate(
  valeur: Date | string | number,
  locale: string | undefined | null,
  options: Intl.DateTimeFormatOptions = OPTIONS_DATE,
): string {
  const date = valeur instanceof Date ? valeur : new Date(valeur);
  // Une date invalide ne doit pas faire échouer le rendu d'une page entière :
  // on préfère un tiret explicite à « Invalid Date » sous les yeux de l'élève.
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(localeICU(locale), options);
}

/** Formate une date et son heure, dans la langue de l'utilisateur. */
export function formatDateHeure(
  valeur: Date | string | number,
  locale: string | undefined | null,
): string {
  return formatDate(valeur, locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}