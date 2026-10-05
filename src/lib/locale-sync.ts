/**
 * Changement de langue synchronisé entre tous les documents de l'app.
 *
 * Le workspace charge chaque module dans une iframe same-origin
 * (`?embedded=1`). Un `router.refresh()` ne rafraîchit QUE le document qui
 * l'appelle : changer la langue depuis la barre du workspace laissait donc
 * les fenêtres ouvertes dans l'ancienne langue (et inversement depuis le
 * Header d'une iframe). On diffuse le changement sur un BroadcastChannel :
 * chaque document (shell, iframes, autres onglets) se rafraîchit lui-même
 * via `<LocaleSync />`, monté dans le layout racine.
 */
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_CHANNEL = "schoolpro-locale";

/** Écrit le cookie de langue et prévient les autres documents. */
export function changerLangue(locale: string) {
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=${60 * 60 * 24 * 365}`;
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(LOCALE_CHANNEL);
  channel.postMessage(locale);
  channel.close();
}
