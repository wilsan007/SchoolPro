import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { siteFilterForModel, mergeFilters, personalScopeFilter } from "@/lib/site-scope";
import { checkPermission } from "@/lib/rbac";
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
//  - permission `finance:read` (règle 1 bis du RBAC) : cette route expose des
//    numéros et statuts de factures ; sans elle, un compte famille énumérait
//    la facturation de n'importe quel `eleveId` du tenant.
//  - périmètre relationnel pour PARENT/STUDENT, dont le filtre de site est
//    neutre

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const denied = await checkPermission(session.user.role, "finance:read");
  if (denied) return denied;

  const eleveId = req.nextUrl.searchParams.get("eleveId");
  if (!eleveId) {
    return NextResponse.json({ error: "eleveId requis" }, { status: 400 });
  }

  const factures = await prisma.facture.findMany({
    where: mergeFilters(
      { tenantId: session.user.tenantId, eleveId, statut: { not: "ANNULEE" } },
      siteFilterForModel("facture", session.user),
      personalScopeFilter(session.user),
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
