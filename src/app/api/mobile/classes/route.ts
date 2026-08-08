import { NextRequest, NextResponse } from "next/server";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import prisma from "@/lib/prisma";
import { eleveScopeFilter, siteFilterForModel } from "@/lib/site-scope";

export async function GET(req: NextRequest) {
  try {
    const user = await verifyMobileScope(req);
    if (!user) return mobileUnauthorized();
    if (!user.tenantId) {
      return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
    }
    const eleveFilter = eleveScopeFilter(user, null);
    const classeFilter = siteFilterForModel("classe", user);

    // `Classe` porte `siteId` ; les élèves imbriqués sont filtrés séparément
    // pour qu'un parent ne récupère pas la liste complète de la classe.

    const classes = await prisma.classe.findMany({
      where: { tenantId: user.tenantId, ...classeFilter },
      include: {
        eleves: {
          where: { statut: "ACTIF", ...eleveFilter },
          select: {
            id: true,
            nom: true,
            prenom: true,
            photoUrl: true,
            sexe: true,
            matricule: true,
          },
          orderBy: [{ prenom: "asc" }, { nom: "asc" }],
        },
      },
      orderBy: { nom: "asc" },
    });

    return NextResponse.json({ classes });
  } catch (error) {
    console.error("[API/mobile/classes]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
