/**
 * EcolPro — Contrôle d'accès basé sur les rôles (RBAC), côté API
 * ============================================================
 * La matrice elle-même vit dans `@/lib/permissions` : ce module n'en garde
 * plus de copie. Il n'ajoute que ce qui exige Node — la session NextAuth et
 * la trace d'audit — donc ce qu'un middleware Edge ne peut pas charger.
 *
 * Utilisation dans une route handler :
 *
 *   const gate = await authorize({ permission: "eleves:write" });
 *   if (!gate.ok) return gate.response;
 *   const { tenantId, userId, role } = gate;
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import type { Session } from "next-auth";
import { auditFire } from "@/lib/audit";
import { ROLE_PERMISSIONS, roleHasPermission, type Permission, type PermissionOverrides } from "@/lib/permissions";
import { overridesPour } from "@/lib/effective-permissions";

export { ROLE_PERMISSIONS, roleHasPermission };
export type { Permission };

// ------------------------------------------------------------
// Garde d'autorisation pour les route handlers
// ------------------------------------------------------------
type AuthSuccess = {
  ok: true;
  session: Session;
  userId: string;
  tenantId: string;
  role: Role;
};
type AuthFailure = { ok: false; response: NextResponse };

export interface AuthorizeOptions {
  /** Permission(s) requise(s). Si plusieurs, une seule suffit (OU logique). */
  permission?: Permission | Permission[];
  /** Exiger un tenantId (défaut : true). Les SUPER_ADMIN en sont exemptés. */
  requireTenant?: boolean;
}

/**
 * Authentifie + autorise une requête API.
 * Retourne une union discriminée : tester `gate.ok` avant d'accéder aux données.
 */
export async function authorize(
  opts: AuthorizeOptions = {}
): Promise<AuthSuccess | AuthFailure> {
  const session = await auth();

  if (!session?.user?.id) {
    auditFire({
      action: "auth:check",
      verdict: "DENIED",
      reason: "Non authentifié",
    });
    return {
      ok: false,
      response: NextResponse.json({ error: "Non authentifié" }, { status: 401 }),
    };
  }

  const role = session.user.role;
  const tenantId = session.user.tenantId;
  const requireTenant = opts.requireTenant ?? true;

  if (requireTenant && !tenantId && role !== "SUPER_ADMIN") {
    auditFire({
      userId: session.user.id,
      action: "auth:check",
      verdict: "DENIED",
      reason: "Aucun établissement associé au compte",
      metadata: { requiredPermissions: opts.permission },
    });
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Aucun établissement associé au compte" },
        { status: 403 }
      ),
    };
  }

  if (opts.permission) {
    const needed = Array.isArray(opts.permission)
      ? opts.permission
      : [opts.permission];
    // Dérogations par utilisateur : un `deny` posé dans l'administration doit
    // retirer l'accès ici aussi, sinon l'API resterait ouverte alors que la
    // navigation et `guardPage` l'ont fermée.
    const overrides = await overridesPour(session.user.id, tenantId ?? null);
    const allowed = needed.some((p) => roleHasPermission(role, p, overrides));
    if (!allowed) {
      auditFire({
        userId: session.user.id,
        tenantId: tenantId ?? null,
        action: "auth:check",
        verdict: "DENIED",
        resource: needed.join(","),
        reason: "Privilèges insuffisants",
        metadata: { role, requiredPermissions: needed },
      });
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Accès refusé : privilèges insuffisants" },
          { status: 403 }
        ),
      };
    }
  }

  return {
    ok: true,
    session,
    userId: session.user.id,
    tenantId: (tenantId ?? "") as string,
    role,
  };
}

/**
 * Garde légère pour les routes qui conservent leur propre `await auth()`.
 * Retourne une réponse 403 si le rôle n'a pas la permission, sinon `null`.
 *
 *   const denied = await checkPermission(session.user.role, "eleves:write");
 *   if (denied) return denied;
 *
 * **Async depuis l'audit d'autorisation** : la fonction lit les dérogations
 * par utilisateur (`user_permission`). Sans cette lecture, un `deny` posé dans
 * l'interface d'administration n'avait aucun effet — la matrice des rôles
 * seule ne le voyait pas. L'identité est reprise de la session par défaut ;
 * passer `identity` évite une seconde résolution quand l'appelant la connaît
 * déjà (routes qui chargent la session elles-mêmes).
 */
export async function checkPermission(
  role: Role,
  permission: Permission,
  identity?: { userId?: string | null; tenantId?: string | null }
): Promise<NextResponse | null> {
  let overrides: PermissionOverrides = {};
  if (identity) {
    overrides = await overridesPour(identity.userId ?? null, identity.tenantId ?? null);
  } else {
    const session = await auth();
    if (session?.user?.id) {
      overrides = await overridesPour(session.user.id, session.user.tenantId ?? null);
    }
  }

  if (!roleHasPermission(role, permission, overrides)) {
    auditFire({
      action: "auth:check",
      verdict: "DENIED",
      resource: permission,
      reason: "Privilèges insuffisants",
      metadata: {
        role,
        denies: overrides.denies,
        grants: overrides.grants,
      },
    });
    return NextResponse.json(
      { error: "Accès refusé : privilèges insuffisants" },
      { status: 403 }
    );
  }
  return null;
}

/** Réservé aux administrateurs de la plateforme EcolPro. */
export async function authorizeSuperAdmin(): Promise<AuthSuccess | AuthFailure> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Non authentifié" }, { status: 401 }),
    };
  }
  if (session.user.role !== "SUPER_ADMIN") {
    auditFire({
      userId: session.user.id,
      action: "auth:super-admin",
      verdict: "DENIED",
      reason: "Rôle non super-admin",
      metadata: { role: session.user.role },
    });
    return {
      ok: false,
      response: NextResponse.json({ error: "Accès refusé" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    session,
    userId: session.user.id,
    tenantId: (session.user.tenantId ?? "") as string,
    role: session.user.role,
  };
}
