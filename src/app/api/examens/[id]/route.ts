import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const PatchSchema = z.object({
  intitule: z.string().min(2).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  statut: z.enum(["PROGRAMME", "EN_COURS", "TERMINE", "ANNULE"]).optional(),
  dateDebut: z.string().optional(),
  dateFin: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "examens:write");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const tenantId = session.user.tenantId;

    const existing = await prisma.examen.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ error: "Examen introuvable" }, { status: 404 });

    const { intitule, description, statut, dateDebut, dateFin } = parsed.data;

    const updated = await prisma.examen.update({
      where: { id },
      data: {
        ...(intitule && { intitule }),
        ...(description !== undefined && { description }),
        ...(statut && { statut }),
        ...(dateDebut && { dateDebut: new Date(dateDebut) }),
        ...(dateFin && { dateFin: new Date(dateFin) }),
      },
      include: { sessions: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API/examens/:id PATCH]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "examens:delete");
    if (denied) return denied;

    const { id } = await params;
    const tenantId = session.user.tenantId;

    const existing = await prisma.examen.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ error: "Examen introuvable" }, { status: 404 });

    await prisma.examen.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/examens/:id DELETE]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
