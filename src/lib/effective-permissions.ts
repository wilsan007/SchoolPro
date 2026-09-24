/**
 * Dérogations de permissions par utilisateur — lecture unique par requête.
 * ============================================================
 *
 * Le tableau « Permissions utilisateur » écrit dans `user_permission` depuis
 * toujours, mais rien ne le lisait : `roleHasPermission`, `canAccessRoute`,
 * `guardPage` et `authorize` ne consultaient que la matrice des rôles. Un
 * `deny` donnait donc l'illusion d'une révocation, et un `grant` ne changeait
 * rien. Ce module est le point de lecture unique qui manquait.
 *
 * `cache()` de React déduplique l'appel **à l'échelle d'une requête** : la
 * page, `guardPage` et l'API partagent la même lecture, il n'y a pas une
 * requête SQL par vérification. Le module n'est chargé que côté serveur
 * (Prisma) ; le middleware Edge, lui, n'a pas de session utilisateur résolue
 * en base et continue de n'appliquer que la matrice des rôles.
 */

import { cache } from "react";
import { getUserPermissionOverrides } from "@/lib/user-permissions";
import type { PermissionOverrides } from "@/lib/permissions";

export const overridesPour = cache(
  async (userId: string | null | undefined, tenantId: string | null | undefined): Promise<PermissionOverrides> => {
    if (!userId || !tenantId) return {};
    const { grants, denies } = await getUserPermissionOverrides(userId, tenantId);
    return { grants, denies };
  }
);
