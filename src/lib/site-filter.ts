import { auth } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import {
  resolveSiteScope,
  siteWhere,
  siteWhereForRelation,
  IMPOSSIBLE_ID,
  type SessionSiteClaims,
  type SiteScope,
} from "@/lib/site-scope";

/**
 * EcolPro — Isolation par site : liaison avec la session
 * =====================================================
 * La logique de décision vit dans `@/lib/site-scope` (module pur, testable
 * sans runtime d'authentification). Ce fichier n'ajoute que les helpers qui
 * lisent la session, et ré-exporte l'API pour les appelants existants.
 */

export * from "@/lib/site-scope";

// ------------------------------------------------------------
// API asynchrone (lit la session)
// ------------------------------------------------------------

/**
 * Extrait les revendications de site de la session courante.
 */
export async function getSessionSiteClaims(): Promise<SessionSiteClaims & { userId?: string; tenantId?: string | null }> {
  const session = await auth();
  const user = session?.user as
    | {
        id?: string;
        role?: string;
        tenantId?: string | null;
        siteId?: string | null;
        siteIds?: string[];
        tenantHasSites?: boolean;
      }
    | undefined;

  return {
    userId: user?.id,
    tenantId: user?.tenantId ?? null,
    role: user?.role,
    siteId: user?.siteId ?? null,
    siteIds: user?.siteIds ?? [],
    tenantHasSites: user?.tenantHasSites,
  };
}

/**
 * Périmètre de sites de l'utilisateur courant.
 */
export async function getSiteScope(): Promise<SiteScope> {
  return resolveSiteScope(await getSessionSiteClaims());
}

/**
 * Fragment de filtrage par site pour l'utilisateur courant.
 */
export async function getSiteFilter(): Promise<Record<string, unknown>> {
  return siteWhere(await getSiteScope());
}

/**
 * Contexte complet pour les requêtes Prisma : `tenantId` + `where` combinant
 * l'isolation tenant et l'isolation site.
 *
 * Fail-closed : sans tenant actif, le `where` renvoyé ne correspond à rien.
 */
export async function getTenantContext(): Promise<{
  tenantId: string;
  scope: SiteScope;
  where: Prisma.EleveWhereInput;
}> {
  const claims = await getSessionSiteClaims();
  const tenantId = claims.tenantId;

  if (!tenantId) {
    return {
      tenantId: "",
      scope: { kind: "NONE" },
      where: { tenantId: IMPOSSIBLE_ID } as Prisma.EleveWhereInput,
    };
  }

  const scope = resolveSiteScope(claims);

  return {
    tenantId,
    scope,
    where: { tenantId, ...siteWhere(scope) } as Prisma.EleveWhereInput,
  };
}

/**
 * Sites autorisés pour l'utilisateur courant.
 * `null` = tous les sites du tenant (direction générale) ou périmètre
 * relationnel. Tableau vide = aucun accès.
 */
export async function getCurrentSiteIds(): Promise<string[] | null> {
  const scope = await getSiteScope();
  switch (scope.kind) {
    case "ALL":
    case "RELATION":
      return null;
    case "NONE":
      return [];
    case "SITES":
      return scope.siteIds;
  }
}

/**
 * Site principal de l'utilisateur courant.
 * @deprecated Utiliser `getCurrentSiteIds()` / `getSiteScope()`.
 */
export async function getCurrentSiteId(): Promise<string | null> {
  const scope = await getSiteScope();
  return scope.kind === "SITES" && scope.siteIds.length === 1 ? scope.siteIds[0] : null;
}

