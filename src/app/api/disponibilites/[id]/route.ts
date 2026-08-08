import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForRelation } from "@/lib/site-filter";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:write");
    if (denied) return denied;

    const { id } = await params;
    const userFilter = siteFilterForRelation(session.user, "user");
    const siteFilter = Object.keys(userFilter).length > 0
      ? { enseignant: (userFilter as any).user }
      : {};

    const existing = await prisma.disponibiliteEnseignant.findFirst({
      where: { id, tenantId: session.user.tenantId, ...siteFilter },
    });
    if (!existing) return NextResponse.json({ error: "Disponibilité introuvable" }, { status: 404 });

    await prisma.disponibiliteEnseignant.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/disponibilites DELETE]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
