import { cache } from "react";
import type { Role } from "@prisma/client";
import type { RlsContext } from "@/lib/rls-context";

/**
 * EcolPro — Contexte RLS déduit de la session authentifiée
 * ========================================================
 *
 * POURQUOI DÉDUIRE PLUTÔT QU'ENVELOPPER CHAQUE APPEL
 * 292 fichiers appellent `auth()`. Envelopper chacun d'eux dans
 * `withRlsContext(...)` serait 292 occasions d'en oublier un — et chaque
 * oubli deviendrait une page vide en production une fois `RLS_MODE` passé
 * à `enforce`. Le contexte est donc déduit de la session, à la demande, au
 * moment de la première requête Prisma de la requête HTTP.
 *
 * `withRlsContext(...)` reste utile là où il n'y a pas de session : tâches
 * planifiées, scripts, files d'attente. Un contexte posé explicitement a
 * toujours la priorité sur celui déduit ici.
 *
 * POURQUOI `cache()` DE REACT
 * Il mémoïse pour la durée d'UNE requête HTTP (Server Components, actions
 * serveur et Route Handlers du App Router). Sans lui, `auth()` — donc le
 * décodage et la vérification du JWT — serait refait à chaque requête
 * Prisma : une page qui fait vingt requêtes paierait vingt vérifications
 * de jeton. Hors contexte de requête (script, cron), `cache()` ne mémoïse
 * pas, ce qui est sans importance : ces chemins passent par
 * `withSystemContext`.
 */

interface SessionUserClaims {
  role?: Role;
  tenantId?: string | null;
  siteId?: string | null;
  siteIds?: string[];
}

export const resolveRlsContextFromSession = cache(
  async (): Promise<RlsContext | undefined> => {
    let user: SessionUserClaims | undefined;
    try {
      // Import différé : `@/lib/auth` importe le client Prisma, qui importe
      // ce module. Une importation statique créerait un cycle au chargement.
      const { auth } = await import("@/lib/auth");
      const session = await auth();
      user = session?.user as SessionUserClaims | undefined;
    } catch {
      // Pas de contexte de requête (script, tâche planifiée) ou session
      // illisible : on ne devine pas. L'appelant retombe sur l'échec fermé.
      return undefined;
    }

    if (!user?.role) return undefined;

    // SUPER_ADMIN hors usurpation d'identité : pas de tenant actif, mais un
    // accès transverse légitime (support, tableau de bord global).
    // Pendant une usurpation, `role` porte le rôle de la cible et
    // `tenantId` celui de l'établissement visé : le super-admin est alors
    // borné à ce tenant, ce qui est exactement l'effet recherché.
    if (user.role === "SUPER_ADMIN") {
      return {
        tenantId: user.tenantId ?? null,
        siteId: user.siteId ?? null,
        siteIds: user.siteIds ?? [],
        superAdmin: true,
        origin: "session:super-admin",
      };
    }

    if (!user.tenantId) return undefined;

    return {
      tenantId: user.tenantId,
      siteId: user.siteId ?? null,
      siteIds: user.siteIds ?? [],
      superAdmin: false,
      origin: "session",
    };
  }
);
