import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import type { Tenant } from "@prisma/client";

/**
 * Détecte le tenant depuis le sous-domaine ou le domaine personnalisé.
 * ex: lycee-omar-bongo.ecolpro.app → slug = "lycee-omar-bongo"
 * ex: portail.monecole.sn → domaine personnalisé
 */
export async function getTenantFromRequest(): Promise<Tenant | null> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";

  // Retirer le port si présent
  const hostname = host.split(":")[0];

  const appDomain = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
    : "ecolpro.app";

  let tenant: Tenant | null = null;

  if (hostname.endsWith(`.${appDomain}`)) {
    // Sous-domaine: lycee-demo.ecolpro.app → slug = "lycee-demo"
    const slug = hostname.replace(`.${appDomain}`, "");
    if (slug && slug !== "www") {
      tenant = await prisma.tenant.findUnique({
        where: { slug },
      });
    }
  } else if (hostname !== appDomain && hostname !== `www.${appDomain}`) {
    // Domaine personnalisé
    tenant = await prisma.tenant.findUnique({
      where: { domain: hostname },
    });
  }

  return tenant;
}

/**
 * Récupère le tenant par slug (pour les pages dashboard)
 */
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  return prisma.tenant.findUnique({ where: { slug } });
}

/**
 * Vérifie que l'utilisateur appartient bien au tenant
 */
export async function verifyTenantAccess(
  userId: string,
  tenantId: string
): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true },
  });
  return !!user;
}
