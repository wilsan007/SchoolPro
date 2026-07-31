import { auth } from "@/lib/auth";

/**
 * Rôles qui ont accès à tous les sites (pas de filtrage par site).
 * TENANT_ADMIN = directeur de l'établissement (voit tous les sites)
 * SUPER_ADMIN = équipe EcolPro (accès global)
 */
const SITE_ADMIN_ROLES = new Set(["TENANT_ADMIN", "SUPER_ADMIN"]);

/**
 * Retourne true si le rôle peut voir tous les sites.
 */
export function isSiteAdmin(role: string | undefined | null): boolean {
  return !!role && SITE_ADMIN_ROLES.has(role);
}

/**
 * Retourne le filtre Prisma à appliquer pour l'isolation par site.
 *
 * - TENANT_ADMIN / SUPER_ADMIN → pas de filtre (voit tous les sites)
 * - Autres rôles avec siteId → filtre sur ce site + données sans site (null)
 * - Autres rôles sans siteId → pas de filtre (accès par défaut)
 *
 * Usage:
 *   const siteFilter = await getSiteFilter();
 *   const eleves = await prisma.eleve.findMany({
 *     where: { tenantId, ...siteFilter }
 *   });
 */
export async function getSiteFilter(): Promise<Record<string, unknown>> {
  const session = await auth();
  const role = session?.user?.role;
  const siteId = (session?.user as { siteId?: string | null })?.siteId;

  if (isSiteAdmin(role) || !siteId) {
    return {};
  }

  // L'utilisateur ne voit que son site + les données non rattachées (null)
  return {
    OR: [
      { siteId },
      { siteId: null },
    ],
  };
}

/**
 * Version synchrone quand on a déjà la session.
 */
export function siteFilterFromSession(
  role: string | undefined | null,
  siteId: string | null | undefined
): Record<string, unknown> {
  if (isSiteAdmin(role) || !siteId) {
    return {};
  }

  return {
    OR: [
      { siteId },
      { siteId: null },
    ],
  };
}

/**
 * Retourne le siteId de l'utilisateur courant (ou null si admin/sans site).
 */
export async function getCurrentSiteId(): Promise<string | null> {
  const session = await auth();
  const role = session?.user?.role;
  const siteId = (session?.user as { siteId?: string | null })?.siteId;

  if (isSiteAdmin(role) || !siteId) {
    return null;
  }

  return siteId;
}
