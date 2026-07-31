import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json();
  const { eleveIds, nouvelleClasseId } = body as {
    eleveIds: string[];
    nouvelleClasseId: string;
  };

  if (!eleveIds?.length || !nouvelleClasseId) {
    return NextResponse.json({ error: "eleveIds et nouvelleClasseId requis" }, { status: 400 });
  }

  const targetClasse = await prisma.classe.findFirst({
    where: { id: nouvelleClasseId, tenantId: session.user.tenantId },
  });

  if (!targetClasse) {
    return NextResponse.json({ error: "Classe destination introuvable" }, { status: 404 });
  }

  const result = await prisma.eleve.updateMany({
    where: {
      id: { in: eleveIds },
      tenantId: session.user.tenantId,
    },
    data: { classeId: nouvelleClasseId },
  });

  return NextResponse.json({ count: result.count });
}
