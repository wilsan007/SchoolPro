import { NextResponse } from "next/server";
import { auth, unstable_update } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { deriveClaims } from "@/lib/tenant-claims";
import { auditFire } from "@/lib/audit";
import { erreurJson } from "@/lib/erreurs-api";

const BodySchema = z.object({
  tenantId: z.string().min(1),
});

/**
 * POST /api/switch-tenant — bascule l'établissement actif.
 *
 * L'accès est prouvé par une adhésion `UserTenant` active. Le rôle appliqué est
 * celui porté par cette adhésion : jamais celui d'un autre établissement.
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

    // Vérifier que l'utilisateur a bien une adhésion ACTIVE à ce tenant.
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
      // `siteId` est remis à null : les sites appartiennent à un tenant, en
      // conserver un d'un autre établissement produirait un périmètre incohérent.
      // eslint-disable-next-line ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté, userId provient de la session
      prisma.user.update({
        where: { id: userId },
        data: { tenantId, role: userTenant.role, siteId: null },
      }),
    ]);

    // Régénérer le JWT : le callback `jwt` relit le périmètre complet depuis la
    // base pour le tenant demandé (sites autorisés, rôle, drapeau multi-sites).
    await unstable_update({ user: { tenantId } } as never);

    const claims = await deriveClaims(userId, tenantId);
    if (!claims) {
      auditFire({
        userId,
        tenantId,
        action: "switch-tenant",
        verdict: "DENIED",
        reason: "deriveClaims a retourné null après bascule",
      });
      return erreurJson("UTILISATEUR_INTROUVABLE");
    }

    return NextResponse.json({
      success: true,
      activeTenant: {
        tenantId: userTenant.tenant.id,
        tenantName: userTenant.tenant.name,
        tenantSlug: userTenant.tenant.slug,
        tenantLogo: userTenant.tenant.logoUrl,
        role: claims.role,
      },
      availableTenants: claims.availableTenants,
    });
  } catch (error) {
    console.error("Erreur switch tenant:", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
