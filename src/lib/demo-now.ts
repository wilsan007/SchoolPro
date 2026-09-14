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
 * Contexte de date de démo pour `unstable_cache`.
 *
 * Next.js 15 interdit d'appeler `cookies()` à l'intérieur d'`unstable_cache`.
 * Or l'extension Prisma `demo-horizon` appelle `getDemoDate()` qui lit les
 * cookies. Pour éviter l'erreur (qui invalide le cache à chaque fois et
 * provoque des rechargements de 7-30s), on résout la date UNE FOIS hors du
 * cache, puis on la passe via cet `AsyncLocalStorage` à l'extension Prisma.
 *
 * Usage :
 *   const maintenant = await getDemoNow();
 *   await withDemoDate(maintenant, () => operationQuiUtilisePrisma());
 */
const demoDateContext = new AsyncLocalStorage<Date | null>();

/**
 * Exécute `fn` avec la date de démo passée en contexte, pour que l'extension
 * Prisma `demo-horizon` puisse l'utiliser sans appeler `cookies()`.
 *
 * Passer `null` pour désactiver explicitement l'horizon dans ce scope.
 */
export async function withDemoDate<T>(
  date: Date | null,
  fn: () => Promise<T>,
): Promise<T> {
  return demoDateContext.run(date, fn);
}

/**
 * Récupère la date de démo du contexte `AsyncLocalStorage` si présent,
 * sinon `null`. Utilisé par l'extension Prisma `demo-horizon` pour éviter
 * d'appeler `cookies()` à l'intérieur d'`unstable_cache`.
 */
export function getDemoDateFromContext(): Date | null {
  return demoDateContext.getStore() ?? null;
}

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
  // 1. Contexte AsyncLocalStorage (prioritaire) : si la date a été résolue
  // hors d'un `unstable_cache` et passée via `withDemoDate`, on l'utilise
  // directement — sans appeler `cookies()`, ce que Next.js 15 interdit
  // à l'intérieur d'`unstable_cache`.
  const dateContextuelle = demoDateContext.getStore();
  if (dateContextuelle !== undefined) {
    return dateContextuelle;
  }

  // 2. Pas de contexte : résoudre via cookies (hors cache seulement).
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

    // Le scope cookie lie la date au couple [userId, tenantId] qui l'a posée.
    // S'il est absent (cookie expiré, effacé partiellement, etc.), on ne
    // rejette pas la date : on vérifie quand même que la session en cours a
    // le rôle TENANT_ADMIN. Les cookies demo_now et demo_now_enabled étant
    // httpOnly, seuls le serveur peut les poser — via le POST qui vérifie
    // déjà le rôle. Le scope ajoute une protection croisée entre comptes
    // sur un même navigateur ; son absence ne crée pas de nouveau vecteur
    // d'attaque, juste une perte de cette protection supplémentaire.
    const scopeRaw = cookieStore.get(DEMO_NOW_SCOPE_COOKIE)?.value;
    let scopeUserId: string | null = null;
    let scopeTenantId: string | null = null;

    if (scopeRaw) {
      let scope: unknown;
      try {
        scope = JSON.parse(decodeURIComponent(scopeRaw));
      } catch (e) {
        console.warn("[demo-now] scope cookie illisible:", scopeRaw.slice(0, 100));
        scope = null;
      }
      if (Array.isArray(scope) && scope.length >= 2) {
        scopeUserId = typeof scope[0] === "string" ? scope[0] : String(scope[0] ?? "");
        scopeTenantId = typeof scope[1] === "string" ? scope[1] : String(scope[1] ?? "");
      }
    } else {
      console.warn("[demo-now] scope cookie manquant — fallback sur vérification de rôle seule");
    }

    const d = new Date(decodeURIComponent(iso));
    if (isNaN(d.getTime())) {
      console.warn("[demo-now] date cookie invalide:", iso);
      return null;
    }

    // Résoudre la session dans le contexte anti-récursion.
    const session = await resolutionEnCours.run(true, () => resoudreSession());
    if (!session) {
      console.warn("[demo-now] session null — auth() a échoué ou pas de session");
      return null;
    }

    if (!peutDeplacerHorloge(session.role)) {
      console.warn("[demo-now] rôle non autorisé:", session.role);
      return null;
    }

    // Vérifier le scope seulement si le cookie était présent.
    if (scopeUserId !== null && session.id !== scopeUserId) {
      console.warn("[demo-now] userId mismatch — session:", session.id, "scope:", scopeUserId);
      return null;
    }
    if (scopeTenantId !== null && session.tenantId !== scopeTenantId) {
      console.warn("[demo-now] tenantId mismatch — session:", session.tenantId, "scope:", scopeTenantId);
      return null;
    }

    return d;
  } catch (err) {
    console.warn("[demo-now] exception dans getDemoDate():", err);
    return null;
  }
}

/**
 * Diagnostic détaillé de la résolution de date de démo.
 *
 * Retourne l'état de chaque étape : cookies présents, scope parsé, session
 * résolue, et le point exact de failure si la date est rejetée. Utilisé par
 * la route `/api/demo-now/debug` pour aider à diagnostiquer pourquoi la Time
 * Machine ne fonctionne pas.
 */
export async function diagnostiquerDemoDate(): Promise<{
  enabled: boolean;
  dateCookie: string | null;
  scopeCookie: string | null;
  scopeParsed: unknown;
  session: { id: string; tenantId: string | null; role: string } | null;
  echec: string | null;
  date: Date | null;
}> {
  try {
    if (resolutionEnCours.getStore() === true) {
      return { enabled: false, dateCookie: null, scopeCookie: null, scopeParsed: null, session: null, echec: "anti-récursion actif", date: null };
    }

    const cookieStore = await cookies();
    const enabled = cookieStore.get(DEMO_NOW_ENABLED_COOKIE)?.value === "true";
    const dateCookie = cookieStore.get(DEMO_NOW_COOKIE)?.value ?? null;
    const scopeCookie = cookieStore.get(DEMO_NOW_SCOPE_COOKIE)?.value ?? null;

    if (!enabled) return { enabled, dateCookie, scopeCookie, scopeParsed: null, session: null, echec: "cookie enabled != true", date: null };
    if (!dateCookie) return { enabled, dateCookie, scopeCookie, scopeParsed: null, session: null, echec: "cookie date manquant", date: null };

    // Le scope cookie est optionnel : s'il manque, on fallback sur la
    // vérification de rôle seule (cf. getDemoDate).
    let scopeParsed: unknown = null;
    let scopeUserId: string | null = null;
    let scopeTenantId: string | null = null;

    if (scopeCookie) {
      try {
        scopeParsed = JSON.parse(decodeURIComponent(scopeCookie));
      } catch (e) {
        console.warn("[non-fatal]", e);
        return { enabled, dateCookie, scopeCookie, scopeParsed: null, session: null, echec: "scope cookie illisible", date: null };
      }
      if (!Array.isArray(scopeParsed) || scopeParsed.length < 2) {
        return { enabled, dateCookie, scopeCookie, scopeParsed, session: null, echec: "scope n'est pas un tableau valide", date: null };
      }
      scopeUserId = typeof scopeParsed[0] === "string" ? scopeParsed[0] : String(scopeParsed[0] ?? "");
      scopeTenantId = typeof scopeParsed[1] === "string" ? scopeParsed[1] : String(scopeParsed[1] ?? "");
    }

    const d = new Date(decodeURIComponent(dateCookie));
    if (isNaN(d.getTime())) {
      return { enabled, dateCookie, scopeCookie, scopeParsed, session: null, echec: "date cookie invalide", date: null };
    }

    const session = await resolutionEnCours.run(true, () => resoudreSession());
    if (!session) {
      return { enabled, dateCookie, scopeCookie, scopeParsed, session: null, echec: "session null (auth échoué)", date: null };
    }

    if (!peutDeplacerHorloge(session.role)) {
      return { enabled, dateCookie, scopeCookie, scopeParsed, session, echec: `rôle non autorisé: ${session.role}`, date: null };
    }
    if (scopeUserId !== null && session.id !== scopeUserId) {
      return { enabled, dateCookie, scopeCookie, scopeParsed, session, echec: `userId mismatch (session=${session.id} vs scope=${scopeUserId})`, date: null };
    }
    if (scopeTenantId !== null && session.tenantId !== scopeTenantId) {
      return { enabled, dateCookie, scopeCookie, scopeParsed, session, echec: `tenantId mismatch (session=${session.tenantId} vs scope=${scopeTenantId})`, date: null };
    }

    return { enabled, dateCookie, scopeCookie, scopeParsed, session, echec: scopeCookie ? null : "OK (scope manquant, fallback rôle)", date: d };
  } catch (err) {
    console.warn("[non-fatal]", err);
    return { enabled: false, dateCookie: null, scopeCookie: null, scopeParsed: null, session: null, echec: `exception: ${String(err)}`, date: null };
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
