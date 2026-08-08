import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { siteFilterForRelation } from "@/lib/site-filter";

export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  // `EmploiTemps` n'a pas de colonne `siteId` : filtrage via la classe.
  const emploi = await prisma.emploiTemps.findMany({
    where: { tenantId: user.tenantId, ...siteFilterForRelation(user, "classe") },
    select: {
      id: true,
      jour: true,
      heureDebut: true,
      heureFin: true,
      salle: true,
      classe: { select: { id: true, nom: true, niveau: true } },
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
