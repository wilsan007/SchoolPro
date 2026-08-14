import { NextRequest, NextResponse } from "next/server";
import { auth, unstable_update } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { auditFire } from "@/lib/audit";
import { erreurJson } from "@/lib/erreurs-api";
import type { Role } from "@prisma/client";
import type { Session } from "next-auth";

const ImpersonateSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
});

/**
 * POST /api/super-admin/impersonate
 *
 * Permet à un SUPER_ADMIN de prendre le contrôle d'un tenant cible en
 * empruntant l'identité d'un utilisateur de ce tenant. L'action est tracée
 * dans AuditLog. Le JWT est mis à jour pour basculer le tenantId tout en
 * conservant le rôle SUPER_ADMIN et les informations de session originale.
 */
export async function POST(request: NextRequest) {
  const session = (await auth()) as Session | null;
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return erreurJson("ACCES_REFUSE");
  }

  let parsed;
  try {
    parsed = ImpersonateSchema.safeParse(await request.json());
  } catch {
    return erreurJson("DONNEES_INVALIDES");
  }
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES");
  }

  const { tenantId, userId } = parsed.data;
  const adminId = session.user.id;
  const originalTenantId = session.user.tenantId;
  const originalRole = session.user.role as Role;

  // Vérifier que le tenant cible existe
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- super-admin cross-tenant lookup
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) {
    return erreurJson("ETABLISSEMENT_INTROUVABLE");
  }

  // Vérifier que l'utilisateur cible existe dans ce tenant
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- super-admin cross-tenant lookup
  const targetUser = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!targetUser) {
    return erreurJson("UTILISATEUR_INTROUVABLE");
  }

  // Tracer l'action dans AuditLog
  auditFire({
    userId: adminId,
    tenantId,
    action: "impersonation:start",
    verdict: "ALLOWED",
    resource: "user",
    resourceId: targetUser.id,
    reason: `SUPER_ADMIN ${session.user.email} a pris le contrôle du tenant ${tenant.name} (${tenant.slug}) en tant que ${targetUser.email}`,
    metadata: {
      targetTenantId: tenantId,
      targetTenantName: tenant.name,
      targetUserId: targetUser.id,
      targetUserEmail: targetUser.email,
      targetUserRole: targetUser.role,
      originalTenantId,
      originalRole,
    },
  });

  // Également tracer dans JournalApprentissage pour l'audit inter-tenants
  // (typeAnalyse: "impersonation" comme spécifié)
  try {
    await prisma.journalApprentissage.create({
      data: {
        tenantId,
        typeAnalyse: "impersonation",
        resume: `Prise de contrôle par ${session.user.email} sur ${tenant.name} en tant que ${targetUser.email}`,
        detail: JSON.stringify({
          action: "impersonation:start",
          adminId,
          adminEmail: session.user.email,
          targetTenantId: tenantId,
          targetTenantName: tenant.name,
          targetUserId: targetUser.id,
          targetUserEmail: targetUser.email,
          originalTenantId,
          originalRole,
        }),
        echantillon: 1,
        perimetre: `tenant:${tenant.slug}`,
      },
    });
  } catch (err) {
    console.error("[impersonate] Échec écriture JournalApprentissage:", err);
  }

  // Mettre à jour le JWT : basculer vers le tenant cible avec le flag d'impersonation
  await unstable_update({
    tenantId,
    impersonating: true,
    impersonatedTenantId: tenantId,
    impersonatedTenantName: tenant.name,
    impersonatedUserEmail: targetUser.email,
    originalRole,
    originalTenantId,
  } as never);

  return NextResponse.json({
    success: true,
    impersonatedTenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
    },
    impersonatedUser: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
    },
  });
}

/**
 * DELETE /api/super-admin/impersonate
 *
 * Quitte l'impersonation : restaure le tenant et le rôle originaux.
 * L'action est tracée dans AuditLog.
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return erreurJson("NON_AUTORISE");
  }

  // Vérifier qu'on est bien en impersonation
  const isImpersonating = (session.user as { impersonating?: boolean }).impersonating;
  if (!isImpersonating) {
    return erreurJson("ACCES_REFUSE");
  }

  const originalTenantId =
    (session.user as { originalTenantId?: string | null }).originalTenantId ?? null;
  const originalRole = (session.user as { originalRole?: Role | null }).originalRole ?? null;
  const impersonatedTenantName =
    (session.user as { impersonatedTenantName?: string | null }).impersonatedTenantName ?? null;
  const impersonatedUserEmail =
    (session.user as { impersonatedUserEmail?: string | null }).impersonatedUserEmail ?? null;

  // Tracer la fin d'impersonation
  auditFire({
    userId: session.user.id,
    tenantId: session.user.tenantId,
    action: "impersonation:exit",
    verdict: "ALLOWED",
    resource: "session",
    reason: `Fin d'impersonation sur ${impersonatedTenantName ?? "?"} (utilisateur: ${impersonatedUserEmail ?? "?"})`,
    metadata: {
      originalTenantId,
      originalRole,
      impersonatedTenantName,
      impersonatedUserEmail,
    },
  });

  // Restaurer le JWT original
  await unstable_update({
    tenantId: originalTenantId,
    clearImpersonation: true,
  } as never);

  return NextResponse.json({ success: true });
}
