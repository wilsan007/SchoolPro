import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { auditFire } from "@/lib/audit";
import { erreurJson } from "@/lib/erreurs-api";
import { refreshSessionCookie } from "@/lib/refresh-session-cookie";

const BodySchema = z.object({
  role: z.enum([
    "SUPER_ADMIN",
    "TENANT_ADMIN",
    "PRINCIPAL",
    "SECRETARY",
    "TEACHER",
    "CLASS_TEACHER",
    "COUNSELOR",
    "NURSE",
    "ACCOUNTANT",
    "CAISSIER",
    "SUPERVISOR",
    "SUBJECT_LEAD",
    "SITE_MANAGER",
    "INSPECTOR",
    "PARENT",
    "STUDENT",
  ]),
});

/**
 * POST /api/switch-role — bascule le rôle actif dans le tenant courant.
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

    const { role: targetRole } = parsed.data;
    const userId = session.user.id;
    const tenantId = session.user.tenantId;

    if (!tenantId) {
      return erreurJson("ADHESION_INTROUVABLE");
    }

    const userTenant = await prisma.userTenant.findFirst({
      where: { userId, tenantId, isActive: true },
      select: { id: true, role: true },
    });

    if (!userTenant) {
      auditFire({
        userId,
        tenantId,
        action: "switch-role",
        verdict: "DENIED",
        resource: "role",
        reason: "Aucune adhésion active à ce tenant",
      });
      return erreurJson("ADHESION_INTROUVABLE");
    }

    // eslint-disable-next-line ecolpro/require-tenant-id -- la clé composite userId_tenantId_role inclut tenantId ; self-lookup de l'utilisateur connecté
    const userRole = await prisma.userRole.findUnique({
      where: {
        userId_tenantId_role: { userId, tenantId, role: targetRole },
      },
      select: { id: true, isActive: true },
    });

    if (!userRole || !userRole.isActive) {
      auditFire({
        userId,
        tenantId,
        action: "switch-role",
        verdict: "DENIED",
        resource: "role",
        reason: `Rôle ${targetRole} non possédé dans ce tenant`,
      });
      return erreurJson("PERMISSIONS_INSUFFISANTES");
    }

    if (userTenant.role === targetRole) {
      return NextResponse.json({ success: true, activeRole: targetRole });
    }

    await prisma.userTenant.update({
      where: { id: userTenant.id },
      data: { role: targetRole },
    });

    // eslint-disable-next-line ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté, userId provient de la session
    await prisma.user.update({
      where: { id: userId },
      data: { role: targetRole },
    });

    // Re-encoder le JWT et récupérer la chaîne Set-Cookie.
    const result = await refreshSessionCookie(userId, tenantId);
    if (!result) {
      auditFire({
        userId,
        tenantId,
        action: "switch-role",
        verdict: "DENIED",
        reason: "deriveClaims a retourné null après bascule",
      });
      return erreurJson("UTILISATEUR_INTROUVABLE");
    }

    const { claims, setCookie } = result;

    auditFire({
      userId,
      tenantId,
      action: "switch-role",
      verdict: "ALLOWED",
      resource: "role",
      reason: `Bascule vers ${targetRole}`,
      metadata: {
        previousRole: userTenant.role,
        newRole: targetRole,
        availableRoles: claims.availableRoles,
      },
    });

    // Poser le Set-Cookie header manuellement — seule méthode fiable
    // dans un Route Handler Next.js 15.
    return NextResponse.json(
      {
        success: true,
        activeRole: claims.role,
        availableRoles: claims.availableRoles,
      },
      { headers: { "Set-Cookie": setCookie } },
    );
  } catch (error) {
    console.error("Erreur switch role:", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
