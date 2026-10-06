/**
 * Changement de langue synchronisé entre tous les documents de l'app.
 *
 * Le workspace charge chaque module dans une iframe same-origin
 * (`?embedded=1`). Un `router.refresh()` ne rafraîchit QUE le document qui
 * l'appelle : changer la langue depuis la barre du workspace laissait donc
 * les fenêtres ouvertes dans l'ancienne langue (et inversement depuis le
 * Header d'une iframe). On diffuse le changement : chaque document (shell,
 * iframes, autres onglets) l'applique lui-même via `<I18nProvider />`, monté
 * dans le layout racine.
 */
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_CHANNEL = "schoolpro-locale";
export const LOCALE_EVENT = "schoolpro:locale";

/** Écrit le cookie de langue et prévient tous les documents, y compris celui-ci. */
export function changerLangue(locale: string) {
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=${60 * 60 * 24 * 365}`;
  window.dispatchEvent(new CustomEvent(LOCALE_EVENT, { detail: locale }));
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(LOCALE_CHANNEL);
  channel.postMessage(locale);
  channel.close();
}
