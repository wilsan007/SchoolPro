import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:delete");
    if (denied) return denied;

    const { id } = await params;
    const tenantId = session.user.tenantId;

    const existing = await prisma.emploiTemps.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 });

    await prisma.emploiTemps.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/emploi-du-temps/:id DELETE]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:write");
    if (denied) return denied;

    const { id } = await params;
    const tenantId = session.user.tenantId;
    const body = await req.json();

    const existing = await prisma.emploiTemps.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 });

    const updated = await prisma.emploiTemps.update({
      where: { id },
      data: {
        ...(body.salle !== undefined && { salle: body.salle }),
        ...(body.heureDebut && { heureDebut: body.heureDebut }),
        ...(body.heureFin && { heureFin: body.heureFin }),
        ...(body.enseignantId !== undefined && { enseignantId: body.enseignantId || null }),
      },
      include: {
        matiere: { select: { nom: true, code: true, couleur: true } },
        classe: { select: { nom: true } },
        enseignant: { include: { user: { select: { name: true } } } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API/emploi-du-temps/:id PATCH]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
