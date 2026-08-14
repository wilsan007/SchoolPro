/**
 * EcolPro — Contrôle d'accès basé sur les rôles (RBAC)
 * ============================================================
 * Source unique de vérité pour l'autorisation côté serveur.
 *
 * Modèle : permissions au format "<module>:<action>".
 *   - "*"            → toutes les permissions (super-admin / directeur)
 *   - "<module>:*"   → toutes les actions d'un module
 *   - "<module>:read" / ":write" / ":delete" / ":publish" / ":send" / ":manage"
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

export type Permission = string;

// ------------------------------------------------------------
// Matrice des permissions par rôle
// ------------------------------------------------------------
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // Plateforme EcolPro — accès total (y compris super-admin)
  SUPER_ADMIN: ["*"],

  // Directeur / Propriétaire de l'établissement — tout sauf l'administration plateforme
  TENANT_ADMIN: [
    "eleves:*", "parents:*", "enseignants:*", "classes:*", "matieres:*",
    "notes:*", "evaluations:*", "bulletins:*", "absences:*", "examens:*",
    "emploi-du-temps:*", "communication:*", "messages:*", "vie-scolaire:*",
    "admissions:*", "rh:*", "finance:*", "inventaire:*", "alumni:*",
    "orientation:*", "cours:*", "analytics:*", "rapports:*", "documents:*",
    "ai:*", "audit:read", "entrainement:*",
  ],

  // Chef d'établissement — pédagogie & vie scolaire complètes, pas la finance/RH en écriture
  PRINCIPAL: [
    "eleves:*", "parents:*", "enseignants:*", "classes:*", "matieres:*",
    "notes:*", "evaluations:*", "bulletins:*", "absences:*", "examens:*",
    "emploi-du-temps:*", "communication:*", "messages:*", "vie-scolaire:*",
    "admissions:*", "rh:read", "finance:read", "inventaire:*", "alumni:*",
    "orientation:*", "cours:*", "analytics:*", "rapports:*", "documents:*",
    "ai:*", "entrainement:*",
  ],

  // Secrétariat — gestion administrative
  SECRETARY: [
    "eleves:*", "parents:*", "classes:read", "matieres:read",
    "absences:*", "emploi-du-temps:*", "communication:read", "communication:send",
    "messages:*", "admissions:*", "examens:read", "inventaire:read",
    "documents:*", "alumni:read", "bulletins:read", "rapports:read",
  ],

  // Enseignant — sa pédagogie
  TEACHER: [
    "eleves:read", "classes:read", "matieres:read",
    "notes:*", "evaluations:*", "absences:read", "absences:write",
    "bulletins:read", "emploi-du-temps:read", "messages:*",
    "cours:*", "analytics:read", "examens:read", "ai:teacher",
    "entrainement:*",
  ],

  // Professeur principal — enseignant + bulletins/conseil + vie scolaire
  CLASS_TEACHER: [
    "eleves:read", "classes:read", "matieres:read",
    "notes:*", "evaluations:*", "absences:*",
    "bulletins:read", "bulletins:write", "bulletins:publish",
    "emploi-du-temps:read", "messages:*", "cours:*",
    "vie-scolaire:*", "orientation:read", "orientation:write",
    "analytics:read", "examens:read", "parents:read", "ai:teacher",
    "entrainement:*",
  ],

  // Conseiller / CPE — vie scolaire & orientation
  COUNSELOR: [
    "eleves:read", "absences:read", "vie-scolaire:*", "orientation:*",
    "messages:*", "parents:read", "communication:read", "analytics:read",
  ],

  // Infirmier(e) — consultation santé/élèves
  NURSE: [
    "eleves:read", "absences:read", "messages:read", "messages:write",
  ],

  // Comptable — finance & paie
  ACCOUNTANT: [
    "finance:*", "rh:*", "eleves:read", "parents:read", "inventaire:*",
    "analytics:read", "messages:*", "rapports:read",
  ],

  // Parent — consultation de son périmètre (lecture seule + messagerie)
  PARENT: [
    "bulletins:read", "absences:read", "notes:read", "messages:*",
    "communication:read", "cours:read", "orientation:read",
    "emploi-du-temps:read", "ai:parent", "entrainement:read",
  ],

  // Élève — consultation de son périmètre (lecture seule + messagerie limitée)
  // Un élève peut lire et répondre dans une conversation où il est déjà participant,
  // mais ne peut pas initier de nouvelle conversation (règle École360).
  // `entrainement:write` est la seule écriture ouverte à un élève. Elle ne
  // touche ni note ni bulletin : elle alimente la couche d'analyse LEARNOS,
  // dont les preuves sont explicitement moins fiables que le travail surveillé.
  STUDENT: [
    "bulletins:read", "absences:read", "notes:read",
    "messages:read", "messages:reply",
    "communication:read", "cours:*", "emploi-du-temps:read",
    "entrainement:read", "entrainement:write",
  ],
};

// ------------------------------------------------------------
// Vérification de permission
// ------------------------------------------------------------
export function roleHasPermission(role: Role, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  if (perms.includes("*")) return true;
  if (perms.includes(permission)) return true;
  const moduleName = permission.split(":")[0];
  if (perms.includes(`${moduleName}:*`)) return true;
  return false;
}

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
    const allowed = needed.some((p) => roleHasPermission(role, p));
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
 *   const denied = checkPermission(session.user.role, "eleves:write");
 *   if (denied) return denied;
 */
export function checkPermission(
  role: Role,
  permission: Permission
): NextResponse | null {
  if (!roleHasPermission(role, permission)) {
    auditFire({
      action: "auth:check",
      verdict: "DENIED",
      resource: permission,
      reason: "Privilèges insuffisants",
      metadata: { role },
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
