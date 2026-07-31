import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json();
  const { periodeId, statut, dateLimiteSaisie } = body;

  if (!periodeId || !statut) {
    return NextResponse.json({ error: "periodeId et statut requis" }, { status: 400 });
  }

  if (statut !== "OUVERTE" && statut !== "CLOTUREE") {
    return NextResponse.json({ error: "statut invalide" }, { status: 400 });
  }

  const data: Record<string, unknown> = { statut };
  if (statut === "CLOTUREE") {
    data.cloturedAt = new Date();
  } else {
    data.cloturedAt = null;
  }
  if (dateLimiteSaisie) {
    data.dateLimiteSaisie = new Date(dateLimiteSaisie);
  }

  const periode = await prisma.periode.update({
    where: { id: periodeId },
    data,
  });

  return NextResponse.json(periode);
}
