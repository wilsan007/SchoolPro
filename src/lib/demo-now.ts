/**
 * Time Machine — date « maintenant » ajustable pour les démonstrations.
 *
 * En usage normal, `getDemoNow()` renvoie l'heure réelle. Pendant une démo,
 * l'utilisateur fixe une date via le modal Time Machine ; elle est stockée
 * dans des cookies et toute l'application se comporte comme si on était à
 * cette date. Cela permet d'avancer dans le temps pour montrer l'évolution
 * des indicateurs, la vérification des prédictions et le recalibrage.
 *
 * ATTENTION : ce module est réservé au serveur (il lit `next/headers`).
 * Les composants client passent par la route `/api/demo-now`.
 *
 *   import { getDemoNow } from "@/lib/demo-now";
 *   const maintenant = await getDemoNow();
 */

import { cookies, headers } from "next/headers";
import { AsyncLocalStorage } from "node:async_hooks";
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
 * Cookie liant la date de démo au compte et au tenant qui l'ont choisie.
 *
 * Sans ce lien, un `PARENT` dont le navigateur aurait conservé les cookies
 * posés par un `TENANT_ADMIN` (session partagée, profil de navigateur, etc.)
 * se verrait appliquer la date simulée bien que l'API lui réponde
 * `autorise: false`. Le scope est un tableau JSON `[userId, tenantId]`.
 */
export const DEMO_NOW_SCOPE_COOKIE = "demo_now_scope";

/**
 * Verrou anti-récursion.
 *
 * La résolution de session (`auth()` ou `verifyMobileScope()`) peut elle-même
 * déclencher du code qui appellerait `getDemoDate()` — typiquement via
 * `getDemoNow()` dans un callback ou un middleware. Sans protection, cela
 * créerait une boucle infinie. Ce `AsyncLocalStorage` marque l'appel en cours
 * : tout appel imbriqué à `getDemoDate()` renvoie `null` immédiatement, sans
 * tenter de résoudre la session à nouveau.
 */
const resolutionEnCours = new AsyncLocalStorage<boolean>();

/**
 * Périmètre de session minimal requis pour appliquer la date de démo.
 */
interface ScopeSession {
  id: string;
  tenantId: string | null;
  role: string;
}

/**
 * Résout la session en cours, en distinguant web et mobile.
 *
 * - Si un en-tête `Authorization: Bearer …` est présent, on utilise
 *   `verifyMobileScope` (jeton mobile). Un jeton invalide échoue fermé : on ne
 *   retombe pas sur la session web, car un client mobile n'en a pas.
 * - Sinon, on utilise `auth()` (session web NextAuth).
 *
 * Les imports sont dynamiques pour casser le cycle de module :
 * `@/lib/auth` importe Prisma, qui peut importer du code appelant
 * `getDemoNow()` — d'où le risque de boucle.
 */
async function resoudreSession(): Promise<ScopeSession | null> {
  const h = await headers();
  const authHeader = h.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const { verifyMobileScope } = await import("@/lib/mobile-auth");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost", { headers: h });
    const user = await verifyMobileScope(req);
    if (!user) return null;
    return { id: user.id, tenantId: user.tenantId, role: user.role };
  }

  const { auth } = await import("@/lib/auth");
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id ?? "",
    tenantId: session.user.tenantId ?? null,
    role: session.user.role ?? "",
  };
}

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
 *
 * CONTRÔLE D'ACCÈS
 * La date n'est appliquée que si la session en cours :
 *   1. a le rôle `TENANT_ADMIN` (cf. `ROLES_HORLOGE`) ;
 *   2. correspond au compte qui a posé le cookie (scope userId) ;
 *   3. correspond au tenant qui a posé le cookie (scope tenantId).
 * Un cookie résiduel chez un autre compte — ou un autre tenant — est ignoré.
 */
export async function getDemoDate(): Promise<Date | null> {
  // Anti-récursion : si on est déjà en train de résoudre la session pour un
  // appel précédent, on ne re-déclenche pas la résolution.
  if (resolutionEnCours.getStore() === true) return null;

  try {
    const cookieStore = await cookies();
    if (cookieStore.get(DEMO_NOW_ENABLED_COOKIE)?.value !== "true") {
      return null;
    }

    const iso = cookieStore.get(DEMO_NOW_COOKIE)?.value;
    if (!iso) return null;

    const scopeRaw = cookieStore.get(DEMO_NOW_SCOPE_COOKIE)?.value;
    if (!scopeRaw) return null;

    let scope: [string, string];
    try {
      scope = JSON.parse(decodeURIComponent(scopeRaw));
    } catch {
      return null;
    }
    if (!Array.isArray(scope) || scope.length < 2 || typeof scope[0] !== "string" || typeof scope[1] !== "string") {
      return null;
    }
    const [scopeUserId, scopeTenantId] = scope;

    const d = new Date(decodeURIComponent(iso));
    if (isNaN(d.getTime())) return null;

    // Résoudre la session dans le contexte anti-récursion.
    const session = await resolutionEnCours.run(true, () => resoudreSession());
    if (!session) return null;

    if (!peutDeplacerHorloge(session.role)) return null;
    if (session.id !== scopeUserId) return null;
    if (session.tenantId !== scopeTenantId) return null;

    return d;
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
