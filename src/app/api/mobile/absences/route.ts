import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileToken, mobileUnauthorized } from "@/lib/mobile-auth";

export async function GET(req: NextRequest) {
  const user = await verifyMobileToken(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const eleveId = searchParams.get("eleveId");
  const date = searchParams.get("date");

  const absences = await prisma.absence.findMany({
    where: {
      tenantId: user.tenantId,
      ...(eleveId ? { eleveId } : {}),
      ...(date ? { date: { gte: new Date(date) } } : {}),
    },
    select: {
      id: true,
      date: true,
      isRetard: true,
      statut: true,
      motif: true,
      commentaire: true,
      eleve: {
        select: { id: true, nom: true, prenom: true, photoUrl: true, classeId: true },
      },
    },
    orderBy: { date: "desc" },
    take: 50,
  });

  const list = absences ?? [];
  const stats = {
    total: list.length,
    injustifiees: list.filter((a) => a.statut === "INJUSTIFIEE").length,
    justifiees: list.filter((a) => a.statut === "JUSTIFIEE").length,
    enAttente: list.filter((a) => a.statut === "EN_ATTENTE").length,
    retards: list.filter((a) => a.isRetard).length,
  };

  return NextResponse.json({ absences: list, stats });
}
