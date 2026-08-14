import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const SessionSchema = z.object({
  matiereNom: z.string().min(1).max(100),
  date: z.string(),
  heureDebut: z.string().regex(/^\d{2}:\d{2}$/),
  heureFin: z.string().regex(/^\d{2}:\d{2}$/),
  salle: z.string().max(50).optional(),
  niveau: z.string().max(50).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "examens:write");
    if (denied) return denied;

    const { id } = await params;
    const tenantId = session.user.tenantId;

    // Vérifier que l'examen appartient au tenant
    const examen = await prisma.examen.findFirst({
      where: { id, tenantId, ...siteFilterForModel("examen", session.user) },
    });
    if (!examen) return NextResponse.json({ error: "Examen introuvable" }, { status: 404 });

    const body = await req.json();
    const parsed = SessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.issues }, { status: 400 });
    }

    const { matiereNom, date, heureDebut, heureFin, salle, niveau } = parsed.data;

    const sessionExam = await prisma.sessionExamen.create({
      data: {
        examId: id,
        matiereNom,
        date: new Date(date),
        heureDebut,
        heureFin,
        salle: salle ?? null,
        niveau: niveau ?? null,
      },
    });

    return NextResponse.json(sessionExam, { status: 201 });
  } catch (error) {
    console.error("[API/examens/:id/sessions POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "examens:read");
    if (denied) return denied;

    const { id } = await params;
    const tenantId = session.user.tenantId;

    const examen = await prisma.examen.findFirst({
      where: { id, tenantId, ...siteFilterForModel("examen", session.user) },
      select: { id: true },
    });
    if (!examen) return NextResponse.json({ error: "Examen introuvable" }, { status: 404 });

    const sessions = await prisma.sessionExamen.findMany({
      where: { examId: id, ...siteFilterForModel("sessionExamen", session.user) },
      orderBy: { date: "asc" },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("[API/examens/:id/sessions GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
