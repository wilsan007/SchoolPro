import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const regles = await prisma.reglesAppreciation.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ contexte: "asc" }, { seuilMin: "asc" }],
  });

  return NextResponse.json({ regles });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json();
  const { contexte, seuilMin, seuilMax, libelle, ordre } = body;

  if (!contexte || !libelle) {
    return NextResponse.json({ error: "contexte et libelle requis" }, { status: 400 });
  }

  const regle = await prisma.reglesAppreciation.create({
    data: {
      tenantId: session.user.tenantId,
      contexte,
      seuilMin: parseFloat(seuilMin),
      seuilMax: parseFloat(seuilMax),
      libelle,
      ordre: ordre ?? 0,
    },
  });

  return NextResponse.json(regle);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json();
  const { id, contexte, seuilMin, seuilMax, libelle, ordre } = body;

  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  const regle = await prisma.reglesAppreciation.update({
    where: { id, tenantId: session.user.tenantId },
    data: {
      contexte,
      seuilMin: parseFloat(seuilMin),
      seuilMax: parseFloat(seuilMax),
      libelle,
      ordre,
    },
  });

  return NextResponse.json(regle);
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

  await prisma.reglesAppreciation.delete({
    where: { id, tenantId: session.user.tenantId },
  });

  return NextResponse.json({ success: true });
}
