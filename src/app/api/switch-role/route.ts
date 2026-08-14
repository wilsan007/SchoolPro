import { NextResponse } from "next/server";
import { auth, unstable_update } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { deriveClaims } from "@/lib/tenant-claims";
import { auditFire } from "@/lib/audit";
import { erreurJson } from "@/lib/erreurs-api";

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
 * L'utilisateur doit **posséder** le rôle cible dans `UserRole` pour ce
 * tenant. La route met à jour uniquement le rôle **actif** (pointeur dans
 * `UserTenant.role` et `User.role`) — elle ne crée ni ne supprime jamais
 * de ligne dans `UserRole`. Les autres rôles possédés restent intacts.
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

    // 1. Vérifier que l'utilisateur a une adhésion active à ce tenant.
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

    // 2. Vérifier que l'utilisateur **possède** ce rôle dans UserRole.
    //    C'est la garantie centrale : on ne peut basculer que vers un rôle
    //    qu'on possède réellement, jamais vers un rôle arbitraire.
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

    // Si le rôle demandé est déjà le rôle actif, ne rien faire.
    if (userTenant.role === targetRole) {
      return NextResponse.json({ success: true, activeRole: targetRole });
    }

    // 3. Mettre à jour uniquement le rôle ACTIF — UserTenant.role.
    //    UserRole n'est JAMAIS modifié ici : les rôles possédés sont
    //    intacts, seul le pointeur change.
    await prisma.userTenant.update({
      where: { id: userTenant.id },
      data: { role: targetRole },
    });

    // 4. Synchroniser User.role pour cohérence avec le code existant
    //    qui lit User.role directement (middleware, layout, etc.).
    // eslint-disable-next-line ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté, userId provient de la session
    await prisma.user.update({
      where: { id: userId },
      data: { role: targetRole },
    });

    // 5. Régénérer le JWT : le callback `jwt` relit le périmètre complet
    //    depuis la base, y compris availableRoles.
    await unstable_update({ user: { tenantId } } as never);

    const claims = await deriveClaims(userId, tenantId);
    if (!claims) {
      auditFire({
        userId,
        tenantId,
        action: "switch-role",
        verdict: "DENIED",
        reason: "deriveClaims a retourné null après bascule",
      });
      return erreurJson("UTILISATEUR_INTROUVABLE");
    }

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

    return NextResponse.json({
      success: true,
      activeRole: claims.role,
      availableRoles: claims.availableRoles,
    });
  } catch (error) {
    console.error("Erreur switch role:", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
