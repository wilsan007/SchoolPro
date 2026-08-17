"use server";

import { auth, unstable_update } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { deriveClaims } from "@/lib/tenant-claims";
import { auditFire } from "@/lib/audit";
import { revalidatePath } from "next/cache";

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
 * Server Action : bascule le rôle actif dans le tenant courant.
 *
 * Contrairement à l'API route `/api/switch-role`, cette Server Action
 * utilise `unstable_update()` qui **persiste correctement le cookie
 * de session** dans les Server Actions (pas dans les Route Handlers).
 * La page est ensuite rafraîchie via `revalidatePath` pour que le
 * middleware, la sidebar et les Server Components voient le nouveau
 * rôle immédiatement.
 *
 * L'utilisateur doit **posséder** le rôle cible dans `UserRole` pour ce
 * tenant. La route met à jour uniquement le rôle **actif** (pointeur dans
 * `UserTenant.role` et `User.role`) — elle ne crée ni ne supprime jamais
 * de ligne dans `UserRole`. Les autres rôles possédés restent intacts.
 */
export async function switchRoleAction(role: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "NON_AUTORISE" };
    }

    const parsed = BodySchema.safeParse({ role });
    if (!parsed.success) {
      return { success: false, error: "DONNEES_INVALIDES" };
    }

    const { role: targetRole } = parsed.data;
    const userId = session.user.id;
    const tenantId = session.user.tenantId;

    if (!tenantId) {
      return { success: false, error: "ADHESION_INTROUVABLE" };
    }

    // 1. Vérifier l'adhésion active au tenant.
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
      return { success: false, error: "ADHESION_INTROUVABLE" };
    }

    // 2. Vérifier la possession du rôle dans UserRole.
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
      return { success: false, error: "PERMISSIONS_INSUFFISANTES" };
    }

    // Si déjà actif, ne rien faire.
    if (userTenant.role === targetRole) {
      return { success: true };
    }

    // 3. Mettre à jour le rôle ACTIF.
    await prisma.userTenant.update({
      where: { id: userTenant.id },
      data: { role: targetRole },
    });

    // 4. Synchroniser User.role.
    // eslint-disable-next-line ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté, userId provient de la session
    await prisma.user.update({
      where: { id: userId },
      data: { role: targetRole },
    });

    // 5. Régénérer le JWT via `unstable_update`.
    //    Dans une Server Action, `unstable_update` persiste correctement
    //    le cookie de session (contrairement aux Route Handlers).
    //    Le callback `jwt` de auth.ts se déclenche avec trigger="update"
    //    et relit le périmètre complet depuis la base via deriveClaims.
    await unstable_update({ user: { tenantId } } as never);

    // 6. Vérifier que les claims sont corrects.
    const claims = await deriveClaims(userId, tenantId);
    if (!claims) {
      auditFire({
        userId,
        tenantId,
        action: "switch-role",
        verdict: "DENIED",
        reason: "deriveClaims a retourné null après bascule",
      });
      return { success: false, error: "UTILISATEUR_INTROUVABLE" };
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

    // 7. Rafraîchir toutes les pages pour que le middleware, la sidebar
    //    et les Server Components voient le nouveau rôle immédiatement.
    revalidatePath("/", "layout");

    return { success: true };
  } catch (error) {
    console.error("Erreur switch role action:", error);
    return { success: false, error: "ERREUR_SERVEUR" };
  }
}
