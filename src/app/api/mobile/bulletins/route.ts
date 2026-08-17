import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { eleveScopeFilter, mergeFilters } from "@/lib/site-filter";

/**
 * Bulletins accessibles depuis l'app mobile.
 *
 * Le périmètre `eleveScopeFilter` garantit qu'un parent ne reçoit que les
 * bulletins de SES enfants — jamais ceux d'un autre élève du tenant.
 */
export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const eleveId = searchParams.get("eleveId");
  const periodeId = searchParams.get("periodeId");

  const scopeFilter = eleveScopeFilter(user, "eleve");

  const bulletins = await prisma.bulletin.findMany({
    where: mergeFilters(
      {
        tenantId: user.tenantId,
        ...(eleveId ? { eleveId } : {}),
        ...(periodeId ? { periodeId } : {}),
      },
      scopeFilter
    ),
    select: {
      id: true,
      moyenneGenerale: true,
      moyenneClasse: true,
      rang: true,
      effectifClasse: true,
      appreciation: true,
      decision: true,
      isPublie: true,
      pdfUrl: true,
      eleve: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          classe: { select: { id: true, nom: true, niveau: true } },
        },
      },
      periode: {
        select: { id: true, nom: true, numero: true },
      },
    },
    orderBy: [{ periode: { numero: "asc" } }],
    take: 50,
  });

  return NextResponse.json({ bulletins });
}
