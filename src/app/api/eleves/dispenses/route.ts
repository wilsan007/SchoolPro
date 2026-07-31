import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json();
  const { eleveId, matiereId, motif } = body;

  if (!eleveId || !matiereId) {
    return NextResponse.json({ error: "eleveId et matiereId requis" }, { status: 400 });
  }

  const eleve = await prisma.eleve.findFirst({
    where: { id: eleveId, tenantId: session.user.tenantId },
  });
  if (!eleve) {
    return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });
  }

  const matiere = await prisma.matiere.findFirst({
    where: { id: matiereId, tenantId: session.user.tenantId },
    select: { id: true, nom: true, code: true },
  });
  if (!matiere) {
    return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  }

  const dispense = await prisma.dispenseMatiere.create({
    data: {
      tenantId: session.user.tenantId,
      eleveId,
      matiereId,
      motif: motif || null,
    },
  });

  return NextResponse.json({
    id: dispense.id,
    matiereId: matiere.id,
    matiereNom: matiere.nom,
    motif: dispense.motif,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  await prisma.dispenseMatiere.delete({
    where: { id, tenantId: session.user.tenantId },
  });

  return NextResponse.json({ success: true });
}
