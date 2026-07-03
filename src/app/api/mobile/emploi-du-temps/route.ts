import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileToken, mobileUnauthorized } from "@/lib/mobile-auth";

export async function GET(req: NextRequest) {
  const user = await verifyMobileToken(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const emploi = await prisma.emploiTemps.findMany({
    where: { tenantId: user.tenantId },
    select: {
      id: true,
      jour: true,
      heureDebut: true,
      heureFin: true,
      salle: true,
      classe: { select: { id: true, nom: true } },
      matiere: { select: { id: true, nom: true, code: true, couleur: true } },
      enseignant: {
        select: {
          id: true,
          user: { select: { name: true } },
        },
      },
    },
    orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
  });

  return NextResponse.json({ emploi });
}
