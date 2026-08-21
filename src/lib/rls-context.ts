import { AsyncLocalStorage } from "node:async_hooks";

/**
 * EcolPro — Contexte RLS de la requête en cours
 * =============================================
 *
 * PROBLÈME RÉSOLU
 * L'isolation multi-tenant repose aujourd'hui entièrement sur les filtres
 * `tenantId` posés dans le code (et sur les règles ESLint qui les
 * imposent). C'est solide, mais c'est une seule ligne de défense : le jour
 * où une requête passe à travers, rien en aval ne rattrape la fuite.
 *
 * La RLS PostgreSQL est cette seconde ligne. Pour qu'elle fonctionne, la
 * base doit savoir « au nom de qui » chaque requête est exécutée. Ce
 * module transporte cette information depuis la session authentifiée
 * jusqu'au client Prisma, sans avoir à la faire passer en paramètre dans
 * toute l'application.
 *
 * POURQUOI AsyncLocalStorage
 * Node exécute les requêtes en concurrence sur un seul thread : une
 * variable de module serait partagée entre deux requêtes simultanées et
 * ferait fuiter le tenant de l'une vers l'autre — exactement la faille
 * qu'on cherche à fermer. AsyncLocalStorage crée un espace propre à
 * chaque chaîne d'exécution asynchrone.
 *
 * Fonctionne dans le runtime Node de Next.js (pages, routes, actions
 * serveur, tâches planifiées). Le middleware tourne en runtime Edge, où
 * aucune requête Prisma n'a lieu : il n'est pas concerné.
 */

export interface RlsContext {
  /** Tenant actif. `null` ⇒ aucune donnée de tenant n'est visible. */
  tenantId: string | null;
  /** Site sélectionné (information ; le filtrage utilise `siteIds`). */
  siteId: string | null;
  /** Périmètre de sites autorisés. Vide ⇒ seules les lignes de niveau tenant. */
  siteIds: string[];
  /**
   * Traverse volontairement les tenants. Réservé à deux cas :
   *   - un SUPER_ADMIN authentifié ;
   *   - les opérations système d'avant-authentification (recherche du
   *     compte à la connexion, dérivation des claims), via
   *     `withSystemContext`.
   * Chaque usage doit être un choix explicite et relisible.
   */
  superAdmin: boolean;
  /** Étiquette libre : sert aux journaux et au diagnostic. */
  origin?: string;
}

const storage = new AsyncLocalStorage<RlsContext>();

/** Contexte de la requête en cours, ou `undefined` hors de tout scope. */
export function getRlsContext(): RlsContext | undefined {
  return storage.getStore();
}

/**
 * Exécute `fn` avec le contexte RLS donné. Toute requête Prisma émise à
 * l'intérieur (y compris après un `await`) posera ce contexte en base.
 */
export function withRlsContext<T>(context: RlsContext, fn: () => Promise<T>): Promise<T> {
  // `async () => await fn()` et non `fn` directement : les promesses
  // Prisma sont PARESSEUSES — la requête ne part qu'au premier `.then()`.
  // Passer `fn` tel quel ferait sortir `storage.run` avant l'exécution
  // réelle, et le contexte serait déjà perdu au moment où Prisma
  // interroge la base. Le symptôme est trompeur (« aucun contexte RLS »
  // alors que l'appel est bien enveloppé) ; l'`await` interne force le
  // départ de la requête à l'intérieur du scope.
  return storage.run(context, async () => await fn());
}

/**
 * Exécute `fn` en franchissant l'isolation par tenant.
 *
 * À N'UTILISER QUE pour ce qui, par nature, précède ou dépasse le tenant :
 * recherche du compte à la connexion, dérivation des revendications,
 * changement d'établissement, tâches planifiées multi-tenants, écrans
 * super-admin. La raison est obligatoire : elle apparaît dans les
 * journaux, et rend chaque franchissement audita­ble a posteriori.
 *
 * C'est le pendant, côté base, des `eslint-disable ecolpro/require-tenant-id`
 * déjà présents dans le code : même exception, même exigence de
 * justification.
 */
export function withSystemContext<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  return storage.run(
    { tenantId: null, siteId: null, siteIds: [], superAdmin: true, origin: `system:${reason}` },
    async () => await fn() // même raison que dans withRlsContext
  );
}
