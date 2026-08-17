import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { resolveSiteAccess } from "@/lib/tenant-claims";
import { auditFire } from "@/lib/audit";
import { erreurJson } from "@/lib/erreurs-api";
import { refreshSessionCookie } from "@/lib/refresh-session-cookie";

const BodySchema = z.object({
  siteId: z.string().min(1).nullable(),
});

/**
 * POST /api/switch-site — bascule le site actif de l'utilisateur.
 *
 * Le JWT est re-encodé manuellement et le cookie de session est posé via
 * le header `Set-Cookie` car `unstable_update` ne persiste pas le cookie
 * dans un Route Handler (bug connu de next-auth v5 beta).
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return erreurJson("NON_AUTORISE");
    }

    const tenantId = session.user.tenantId;
    if (!tenantId) {
      return erreurJson("ETABLISSEMENT_INTROUVABLE");
    }

    let parsed;
    try {
      parsed = BodySchema.safeParse(await req.json());
    } catch {
      return erreurJson("DONNEES_INVALIDES");
    }
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES");
    }

    const { siteId } = parsed.data;
    const userId = session.user.id;

    if (siteId) {
      const access = await resolveSiteAccess(userId, tenantId, siteId);
      if (!access) {
        auditFire({
          userId,
          tenantId,
          action: "switch-site",
          verdict: "DENIED",
          resource: "site",
          resourceId: siteId,
          reason: "Accès refusé à ce site",
        });
        return erreurJson("ACCES_REFUSE");
      }
    } else {
      const membership = await prisma.userTenant.findFirst({
        where: { userId, tenantId, isActive: true },
        select: { role: true },
      });
      // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté pour le rôle
      const fallback = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, tenantId: true },
      });
      if (!fallback) {
        return erreurJson("UTILISATEUR_INTROUVABLE");
      }
      const tenantRole =
        membership?.role ?? (fallback.tenantId === tenantId ? fallback.role : null);

      if (tenantRole !== "TENANT_ADMIN" && tenantRole !== "SUPER_ADMIN") {
        auditFire({
          userId,
          tenantId,
          action: "switch-site",
          verdict: "DENIED",
          reason: "Tentative d'accès multi-sites sans privilèges admin",
          metadata: { role: tenantRole },
        });
        return erreurJson("ACCES_REFUSE");
      }
    }

    // eslint-disable-next-line ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté, userId provient de la session
    await prisma.user.update({
      where: { id: userId },
      data: { siteId },
    });

    const result = await refreshSessionCookie(userId, tenantId);
    if (!result) {
      auditFire({
        userId,
        tenantId,
        action: "switch-site",
        verdict: "DENIED",
        reason: "deriveClaims a retourné null après bascule",
      });
      return erreurJson("UTILISATEUR_INTROUVABLE");
    }

    const { claims, setCookie } = result;

    const isTenantWide = claims.role === "TENANT_ADMIN" || claims.role === "SUPER_ADMIN";
    const sites = await prisma.site.findMany({
      where: {
        tenantId,
        actif: true,
        ...(isTenantWide ? {} : { id: { in: claims.siteIds } }),
      },
      select: { id: true, nom: true, code: true },
      orderBy: { nom: "asc" },
    });

    return NextResponse.json(
      {
        success: true,
        activeSiteId: claims.siteId,
        activeRole: claims.role,
        sites,
      },
      { headers: { "Set-Cookie": setCookie } },
    );
  } catch (error) {
    console.error("Erreur switch site:", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
