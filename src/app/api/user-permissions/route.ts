import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { auditFire } from "@/lib/audit";
import { ALL_PERMISSIONS } from "@/lib/permissions";

const CreateSchema = z.object({
  userId: z.string().min(1),
  permission: z.string().min(1),
  mode: z.enum(["grant", "deny"]),
});

const DeleteSchema = z.object({
  id: z.string().min(1),
});

/**
 * Une dérogation ne peut porter qu'une permission **réellement déclarée** dans
 * la matrice. Sans ce filtre, `permission: "*"` était accepté (le schéma Zod se
 * contentait d'une chaîne non vide) et la table se remplissait de valeurs
 * qu'aucune vérification ne sait interpréter.
 *
 * Les jokers (`*`, `module:*`) sont réservés au super-admin : accorder
 * `finance:*` à un caissier n'est pas une dérogation, c'est un changement de
 * rôle déguisé.
 */
function validerPermission(permission: string, role: string): string | null {
  const estJoker = permission === "*" || permission.endsWith(":*");
  if (estJoker && role !== "SUPER_ADMIN") {
    return "Un joker de permission (* ou module:*) est réservé au super-administrateur.";
  }
  if (!ALL_PERMISSIONS.includes(permission) && !estJoker) {
    return `Permission inconnue : « ${permission} ».`;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = await checkPermission(session.user.role, "parametres:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) return erreurJson("DONNEES_INVALIDES");

    const overrides = await prisma.userPermission.findMany({
      where: { userId, tenantId: session.user.tenantId },
      orderBy: { permission: "asc" },
    });

    return NextResponse.json(overrides);
  } catch (error) {
    console.error("[API/user-permissions GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    // `parametres:admin` (et non `parametres:write`) : administrer les
    // permissions d'un utilisateur est un acte de direction technique. Un
    // `parametres:write` était détenu par le comptable, qui pouvait donc
    // s'accorder n'importe quelle permission.
    const denied = await checkPermission(session.user.role, "parametres:admin");
    if (denied) return denied;

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    const { userId, permission, mode } = parsed.data;
    const tenantId = session.user.tenantId;

    const invalide = validerPermission(permission, session.user.role);
    if (invalide) {
      auditFire({
        userId: session.user.id,
        tenantId,
        action: "user-permission:update",
        verdict: "DENIED",
        resource: permission,
        reason: invalide,
      });
      return NextResponse.json({ error: invalide }, { status: 400 });
    }

    // eslint-disable-next-line ecolpro/require-site-filter -- UserPermission is tenant-scoped, not site-scoped
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });
    if (!user) return erreurJson("UTILISATEUR_INTROUVABLE");

    const override = await prisma.userPermission.upsert({
      where: {
        userId_tenantId_permission: { userId, tenantId, permission },
      },
      create: { userId, tenantId, permission, mode },
      update: { mode },
    });

    auditFire({
      userId: session.user.id,
      tenantId,
      action: "user-permission:update",
      verdict: "ALLOWED",
      resource: "user-permission",
      resourceId: override.id,
      metadata: { targetUserId: userId, permission, mode },
    });

    return NextResponse.json(override, { status: 200 });
  } catch (error) {
    console.error("[API/user-permissions POST]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    // Même exigence que POST : administrer les dérogations est un acte de
    // direction technique (cf. le commentaire de POST).
    const denied = await checkPermission(session.user.role, "parametres:admin");
    if (denied) return denied;

    const body = await req.json();
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    const { id } = parsed.data;
    const tenantId = session.user.tenantId;

    const existing = await prisma.userPermission.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return erreurJson("PERMISSIONS_INSUFFISANTES");

    await prisma.userPermission.delete({ where: { id, tenantId: session.user.tenantId } });

    auditFire({
      userId: session.user.id,
      tenantId,
      action: "user-permission:delete",
      verdict: "ALLOWED",
      resource: "user-permission",
      resourceId: id,
      metadata: { targetUserId: existing.userId, permission: existing.permission, mode: existing.mode },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API/user-permissions DELETE]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
