/**
 * Time Machine — date « maintenant » ajustable pour les démonstrations.
 *
 * En usage normal, `getDemoNow()` renvoie l'heure réelle. Pendant une démo,
 * l'utilisateur fixe une date via le modal Time Machine ; elle est stockée
 * dans deux cookies et toute l'application se comporte comme si on était à
 * cette date. Cela permet d'avancer dans le temps pour montrer l'évolution
 * des indicateurs, la vérification des prédictions et le recalibrage.
 *
 * ATTENTION : ce module est réservé au serveur (il lit `next/headers`).
 * Les composants client passent par la route `/api/demo-now`.
 *
 *   import { getDemoNow } from "@/lib/demo-now";
 *   const maintenant = await getDemoNow();
 */

import { cookies } from "next/headers";

/** Cookie contenant la date de démo (chaîne ISO). */
export const DEMO_NOW_COOKIE = "demo_now";

/** Cookie indiquant si le mode démo est actif ("true" / autre). */
export const DEMO_NOW_ENABLED_COOKIE = "demo_now_enabled";

/**
 * Date « maintenant » à utiliser pour tous les calculs temporels.
 *
 * Renvoie la date de démo si le mode est actif et la valeur valide,
 * sinon l'heure réelle. Ne lève jamais : hors contexte de requête
 * (tests, scripts, cron), retombe sur `new Date()`.
 */
export async function getDemoNow(): Promise<Date> {
  try {
    const cookieStore = await cookies();
    if (cookieStore.get(DEMO_NOW_ENABLED_COOKIE)?.value !== "true") {
      return new Date();
    }

    const iso = cookieStore.get(DEMO_NOW_COOKIE)?.value;
    if (!iso) return new Date();

    const d = new Date(decodeURIComponent(iso));
    return isNaN(d.getTime()) ? new Date() : d;
  } catch {
    return new Date();
  }
}
