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
  const __t0 = Date.now();
  const __mesure = (etape: string) => console.log(`[MESURE switch-role] ${etape}: ${Date.now() - __t0} ms`);
  try {
    const session = await auth();
    __mesure("auth");
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

    // 1. Vérifier l'accès au tenant.
    //    On tolère l'ABSENCE d'adhésion — les comptes historiques n'ont qu'un
    //    `tenantId` dénormalisé, et `deriveClaims` fait de même — mais jamais
    //    une adhésion DÉSACTIVÉE. La nuance est tout sauf théorique : quand un
    //    enseignant quitte l'établissement, l'administration passe son
    //    `UserTenant.isActive` à false ; ses lignes `UserRole`, elles, restent
    //    souvent en place. Ne regarder que `isActive: true` mettait les deux
    //    situations dans le même sac, et le partant gardait le droit de
    //    basculer de rôle tant que son jeton courait.
    const adhesion = await prisma.userTenant.findFirst({
      where: { userId, tenantId },
      select: { id: true, role: true, isActive: true },
    });

    if (adhesion && !adhesion.isActive) {
      auditFire({
        userId,
        tenantId,
        action: "switch-role",
        verdict: "DENIED",
        resource: "role",
        reason: "Adhésion désactivée pour ce tenant",
      });
      return { success: false, error: "ADHESION_INTROUVABLE" };
    }

    const userTenant = adhesion;

    // 2. Vérifier la possession du rôle.
    //    UserRole est la source de vérité moderne. Mais les comptes
    //    historiques (créés avant UserRole) n'ont pas de ligne — on
    //    accepte alors le rôle actuel de la session comme possédé.
    __mesure("adhesion");
    // eslint-disable-next-line schoolpro/require-tenant-id -- la clé composite userId_tenantId_role inclut tenantId ; self-lookup de l'utilisateur connecté
    const userRole = await prisma.userRole.findUnique({
      where: {
        userId_tenantId_role: { userId, tenantId, role: targetRole },
      },
      select: { id: true, isActive: true },
    });

    __mesure("userRole");
    // Accepter le rôle actuel de la session pour les comptes sans UserRole.
    const isCurrentRole = session.user.role === targetRole;
    if ((!userRole || !userRole.isActive) && !isCurrentRole) {
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
    const currentActiveRole = userTenant?.role ?? session.user.role;
    if (currentActiveRole === targetRole) {
      return { success: true };
    }

    // 3 + 4. Rôle ACTIF dans UserTenant (si l'adhésion existe) et User.role,
    // en un seul aller-retour : deux `await` successifs coûtaient deux fois la
    // latence du serveur de base, sur un chemin déjà long.
    await prisma.$transaction([
      ...(userTenant
        ? [prisma.userTenant.update({ where: { id: userTenant.id }, data: { role: targetRole } })]
        : []),
      // eslint-disable-next-line schoolpro/require-tenant-id -- self-lookup de l'utilisateur connecté, userId provient de la session
      prisma.user.update({ where: { id: userId }, data: { role: targetRole } }),
    ]);

    __mesure("ecritures");
    // 5. Régénérer le JWT via `unstable_update`.
    //    Dans une Server Action, `unstable_update` persiste correctement
    //    le cookie de session (contrairement aux Route Handlers).
    //    Le callback `jwt` de auth.ts se déclenche avec trigger="update"
    //    et relit le périmètre complet depuis la base via deriveClaims.
    await unstable_update({ user: { tenantId } } as never);

    __mesure("unstable_update");
    // 6. Journaliser. `deriveClaims` était rappelé ici juste pour relire les
    // rôles disponibles et les écrire dans l'audit : une dérivation complète
    // du périmètre (utilisateur, adhésions, sites) pour une ligne de journal,
    // alors que `unstable_update` vient de la faire. Les rôles possédés sont
    // déjà connus de la session appelante.
    auditFire({
      userId,
      tenantId,
      action: "switch-role",
      verdict: "ALLOWED",
      resource: "role",
      reason: `Bascule vers ${targetRole}`,
      metadata: {
        previousRole: currentActiveRole,
        newRole: targetRole,
        availableRoles: session.user.availableRoles ?? [],
      },
    });

    // 7. Rafraîchir toutes les pages pour que le middleware, la sidebar
    //    et les Server Components voient le nouveau rôle immédiatement.
    revalidatePath("/", "layout");
    __mesure("revalidatePath + fin action");

    return { success: true };
  } catch (error) {
    console.error("Erreur switch role action:", error);
    return { success: false, error: "ERREUR_SERVEUR" };
  }
}
