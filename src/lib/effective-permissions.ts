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
import { referentiel } from "@/lib/cache-referentiel";
import type { PermissionOverrides } from "@/lib/permissions";

export const overridesPour = cache(
  async (userId: string | null | undefined, tenantId: string | null | undefined): Promise<PermissionOverrides> => {
    if (!userId || !tenantId) return {};
    // Au-delà de la requête : la lecture précède CHAQUE page et CHAQUE appel
    // d'API. Elle est tenue en cache court, vidé dès qu'une dérogation est
    // écrite (src/lib/cache-referentiel.ts) — une révocation s'applique donc
    // immédiatement sur la machine qui l'enregistre, et en 30 s au plus ailleurs.
    return referentiel("permissions", `${tenantId}:${userId}`, async () => {
      const { grants, denies } = await getUserPermissionOverrides(userId, tenantId);
      return { grants, denies };
    });
  }
);
