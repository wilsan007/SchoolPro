import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { auditFire } from "@/lib/audit";
import { erreurJson } from "@/lib/erreurs-api";
import { refreshSessionCookie } from "@/lib/refresh-session-cookie";

const BodySchema = z.object({
  tenantId: z.string().min(1),
});

/**
 * POST /api/switch-tenant — bascule l'établissement actif.
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

    let parsed;
    try {
      parsed = BodySchema.safeParse(await req.json());
    } catch {
      return erreurJson("DONNEES_INVALIDES");
    }
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES");
    }

    const { tenantId } = parsed.data;
    const userId = session.user.id;

    const userTenant = await prisma.userTenant.findFirst({
      where: { userId, tenantId, isActive: true },
      select: {
        role: true,
        tenant: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
    });

    if (!userTenant) {
      auditFire({
        userId,
        action: "switch-tenant",
        verdict: "DENIED",
        resource: "tenant",
        resourceId: tenantId,
        reason: "Aucune adhésion active à ce tenant",
      });
      return erreurJson("ADHESION_INTROUVABLE");
    }

    await prisma.$transaction([
      // eslint-disable-next-line ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté, reset des flags isDefault sur ses propres adhésions
      prisma.userTenant.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.userTenant.update({
        where: { userId_tenantId: { userId, tenantId } },
        data: { isDefault: true },
      }),
      // eslint-disable-next-line ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté, userId provient de la session
      prisma.user.update({
        where: { id: userId },
        data: { tenantId, role: userTenant.role, siteId: null },
      }),
    ]);

    const result = await refreshSessionCookie(userId, tenantId);
    if (!result) {
      auditFire({
        userId,
        tenantId,
        action: "switch-tenant",
        verdict: "DENIED",
        reason: "deriveClaims a retourné null après bascule",
      });
      return erreurJson("UTILISATEUR_INTROUVABLE");
    }

    const { claims, setCookie } = result;

    return NextResponse.json(
      {
        success: true,
        activeTenant: {
          tenantId: userTenant.tenant.id,
          tenantName: userTenant.tenant.name,
          tenantSlug: userTenant.tenant.slug,
          tenantLogo: userTenant.tenant.logoUrl,
          role: claims.role,
        },
        availableTenants: claims.availableTenants,
      },
      { headers: { "Set-Cookie": setCookie } },
    );
  } catch (error) {
    console.error("Erreur switch tenant:", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
