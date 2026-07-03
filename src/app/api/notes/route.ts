import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";

const NoteSchema = z.object({
  eleveId: z.string().min(1),
  classeId: z.string().min(1),
  matiereId: z.string().min(1),
  periodeId: z.string().min(1).optional(),
  type: z.enum(["CONTROLE", "DEVOIR", "EXAMEN", "INTERROGATION", "PROJET", "ORAL", "TP"]),
  intitule: z.string().optional(),
  valeur: z.number().min(0).max(100),
  noteMax: z.number().min(1).max(100).default(20),
  coefficient: z.number().min(0.5).max(10).default(1),
  date: z.string().datetime(),
  appreciation: z.string().optional(),
});

const BulkNoteSchema = z.object({
  notes: z.array(NoteSchema),
  isPubliee: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "notes:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const matiereId = searchParams.get("matiereId");
    const periodeId = searchParams.get("periodeId");
    const eleveId = searchParams.get("eleveId");

    const notes = await prisma.note.findMany({
      where: {
        tenantId: session.user.tenantId,
        ...(classeId && { classeId }),
        ...(matiereId && { matiereId }),
        ...(periodeId && { periodeId }),
        ...(eleveId && { eleveId }),
      },
      include: {
        eleve: { select: { nom: true, prenom: true, matricule: true } },
        matiere: { select: { nom: true, code: true, couleur: true } },
        periode: { select: { nom: true, numero: true } },
      },
      orderBy: [{ date: "desc" }],
    });

    return NextResponse.json({ notes });
  } catch (error) {
    console.error("[API/notes GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "notes:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = BulkNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const tenantId = session.user.tenantId;
    const { notes, isPubliee } = parsed.data;

    const created = await prisma.$transaction(
      notes.map((note) =>
        prisma.note.create({
          data: {
            tenantId,
            ...note,
            date: new Date(note.date),
            isPubliee,
            saisieParId: session.user.id,
          },
        })
      )
    );

    return NextResponse.json({ notes: created, count: created.length }, { status: 201 });
  } catch (error) {
    console.error("[API/notes POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
