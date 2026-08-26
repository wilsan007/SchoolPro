import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { auditFire } from "@/lib/audit";

const CreateSchema = z.object({
  userId: z.string().min(1),
  permission: z.string().min(1),
  mode: z.enum(["grant", "deny"]),
});

const DeleteSchema = z.object({
  id: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "parametres:read");
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
    const denied = checkPermission(session.user.role, "parametres:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    const { userId, permission, mode } = parsed.data;
    const tenantId = session.user.tenantId;

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
    const denied = checkPermission(session.user.role, "parametres:write");
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

    await prisma.userPermission.delete({ where: { id } });

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
