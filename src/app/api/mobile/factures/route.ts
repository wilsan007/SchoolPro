import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { eleveScopeFilter, mergeFilters } from "@/lib/site-filter";

/**
 * Factures accessibles depuis l'app mobile.
 *
 * Réservé au parent GARDIEN (isGardien: true) — un tuteur non gardien
 * n'a pas accès aux factures. Le filtre `gardienOnly` restreint les
 * `EleveParent` à ceux où `isGardien` est `true`.
 */
export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const eleveId = searchParams.get("eleveId");

  const scopeFilter = eleveScopeFilter(user, "eleve", { gardienOnly: true });

  const factures = await prisma.facture.findMany({
    where: mergeFilters(
      {
        tenantId: user.tenantId,
        ...(eleveId ? { eleveId } : {}),
      },
      scopeFilter
    ),
    select: {
      id: true,
      numero: true,
      libelle: true,
      montant: true,
      devise: true,
      statut: true,
      echeance: true,
      createdAt: true,
      eleve: {
        select: { id: true, nom: true, prenom: true },
      },
      paiements: {
        select: {
          id: true,
          montant: true,
          date: true,
          methode: true,
        },
        orderBy: { date: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const stats = {
    total: factures.length,
    payees: factures.filter((f) => f.statut === "PAYEE").length,
    enAttente: factures.filter((f) => f.statut === "EN_ATTENTE").length,
    enRetard: factures.filter((f) => f.statut === "EN_RETARD").length,
    montantDu: factures
      .filter((f) => f.statut !== "PAYEE" && f.statut !== "ANNULEE")
      .reduce((sum, f) => sum + f.montant, 0),
  };

  return NextResponse.json({ factures, stats });
}
