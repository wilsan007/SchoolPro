import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForRelation } from "@/lib/site-filter";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:write");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();
    const { appreciation, decision, moyenneGenerale, rang } = body;

    const siteFilter = siteFilterForRelation(session.user, "eleve");

    const existing = await prisma.bulletin.findFirst({
      where: { id, tenantId: session.user.tenantId, ...siteFilter },
    });
    if (!existing) return NextResponse.json({ error: "Bulletin introuvable" }, { status: 404 });

    const updated = await prisma.bulletin.update({
      where: { id },
      data: {
        appreciation: appreciation !== undefined ? appreciation : undefined,
        decision: decision !== undefined ? decision : undefined,
        moyenneGenerale: moyenneGenerale !== undefined ? moyenneGenerale : undefined,
        rang: rang !== undefined ? rang : undefined,
      },
    });

    return NextResponse.json({ success: true, bulletin: updated });
  } catch (error) {
    console.error("[API/bulletins/[id]] PUT Error", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:delete");
    if (denied) return denied;

    const { id } = await params;

    const siteFilter2 = siteFilterForRelation(session.user, "eleve");

    const existing = await prisma.bulletin.findFirst({
      where: { id, tenantId: session.user.tenantId, ...siteFilter2 },
    });
    if (!existing) return NextResponse.json({ error: "Bulletin introuvable" }, { status: 404 });

    await prisma.bulletin.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/bulletins/[id]] DELETE Error", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
