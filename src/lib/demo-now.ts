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
import type { Role } from "@prisma/client";

/**
 * Rôles autorisés à déplacer l'horloge.
 *
 * POURQUOI C'EST RESTREINT
 * Déplacer l'horloge ne fait plus seulement varier un affichage : depuis
 * l'ajout de l'horizon de démonstration (cf. `demo-horizon`), elle MASQUE des
 * données. Laisser n'importe quel compte s'en servir reviendrait à lui offrir
 * une vue tronquée de l'établissement — et, à l'inverse, à laisser une famille
 * se placer à une date où un bulletin n'était pas encore publié.
 *
 * L'administrateur du tenant est le seul destinataire : c'est lui qui fait la
 * démonstration. `SUPER_ADMIN` en est volontairement exclu, n'ayant pas de
 * tenant actif — il est redirigé vers son propre espace.
 */
export const ROLES_HORLOGE: readonly Role[] = ["TENANT_ADMIN"];

/**
 * Ce rôle peut-il déplacer l'horloge ?
 *
 * Vérifié côté serveur à chaque appel : masquer le bouton ne protège rien, un
 * composant client ne pouvant rien garantir.
 */
export function peutDeplacerHorloge(role: Role | string | undefined | null): boolean {
  return !!role && ROLES_HORLOGE.includes(role as Role);
}

/** Cookie contenant la date de démo (chaîne ISO). */
export const DEMO_NOW_COOKIE = "demo_now";

/** Cookie indiquant si le mode démo est actif ("true" / autre). */
export const DEMO_NOW_ENABLED_COOKIE = "demo_now_enabled";

/**
 * Date de démonstration brute, ou `null` hors démo.
 *
 * Contrairement à `getDemoNow()`, ne retombe jamais sur `new Date()` : renvoie
 * `null` quand le mode démo est inactif, la valeur est absente, ou le contexte
 * de requête n'est pas disponible. Les appelants qui veulent « maintenant »
 * doivent utiliser `getDemoNow()` ; les appelants qui veulent savoir s'il y a
 * une démo active (et quelle date) doivent utiliser `getDemoDate()`.
 *
 * Ne lève jamais : hors contexte de requête (scripts, cron, tests),
 * `cookies()` échoue et l'on considère qu'il n'y a pas de démonstration.
 */
export async function getDemoDate(): Promise<Date | null> {
  try {
    const cookieStore = await cookies();
    if (cookieStore.get(DEMO_NOW_ENABLED_COOKIE)?.value !== "true") {
      return null;
    }

    const iso = cookieStore.get(DEMO_NOW_COOKIE)?.value;
    if (!iso) return null;

    const d = new Date(decodeURIComponent(iso));
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Date « maintenant » à utiliser pour tous les calculs temporels.
 *
 * Renvoie la date de démo si le mode est actif et la valeur valide,
 * sinon l'heure réelle.
 */
export async function getDemoNow(): Promise<Date> {
  return (await getDemoDate()) ?? new Date();
}

/**
 * Rend "2026-03-15" à partir d'une date, en **heure locale**.
 *
 * `toISOString().slice(0, 10)` serait faux ici : à 23 h 30 sous un fuseau
 * positif il rend la veille. Une clé de cache basculerait alors de jour sans
 * que la date affichée bouge, et l'écran resservirait les chiffres d'hier.
 */
export function jourISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Bornes [00:00:00.000 ; 23:59:59.999] du jour de `d`, sans modifier `d`.
 *
 * Évite le `new Date(new Date().setHours(...))` recopié de page en page, qui
 * mute une date intermédiaire et se prête aux confusions de fuseau.
 */
export function bornesDuJour(d: Date): { debut: Date; fin: Date } {
  const debut = new Date(d);
  debut.setHours(0, 0, 0, 0);
  const fin = new Date(d);
  fin.setHours(23, 59, 59, 999);
  return { debut, fin };
}
