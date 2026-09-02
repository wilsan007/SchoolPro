import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { siteFilterForModel, mergeFilters } from "@/lib/site-scope";

// ============================================================
// GET /api/facturation/existing?eleveId=xxx
// ============================================================
//
// Récupère les factures existantes (non annulées) d'un élève
// pour le verrouillage UI du formulaire multi-services.
//
// Règles respectées :
//  - tenantId obligatoire (règle 1)
//  - fail-closed via siteFilterForModel (règle 6)

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const eleveId = req.nextUrl.searchParams.get("eleveId");
  if (!eleveId) {
    return NextResponse.json({ error: "eleveId requis" }, { status: 400 });
  }

  const factures = await prisma.facture.findMany({
    where: mergeFilters(
      { tenantId: session.user.tenantId, eleveId, statut: { not: "ANNULEE" } },
      siteFilterForModel("facture", session.user),
    ),
    select: { id: true, numero: true, type: true, statut: true, mois: true },
  });

  return NextResponse.json({
    factures: factures.map((f) => ({
      id: f.id,
      numero: f.numero,
      type: f.type,
      statut: f.statut,
      mois: f.mois,
    })),
  });
}
