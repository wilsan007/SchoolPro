import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { eleveScopeFilter, mergeFilters } from "@/lib/site-filter";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";

export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const eleveId = searchParams.get("eleveId");
  const limit = parseInt(searchParams.get("limit") ?? "50");

  // Les incidents de vie scolaire sont des données sensibles : filtrage par site
  // via l'élève, et périmètre personnel pour les comptes parent/élève.
  const scopeFilter = eleveScopeFilter(user, "eleve");
  const anneeCourante = await getAnneeCouranteLibelle(user.tenantId);
  const anneeEleve = anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {};
  const maintenant = await getDemoNow();

  const incidents = await prisma.incident.findMany({
    where: mergeFilters(
      {
        tenantId: user.tenantId,
        ...(eleveId ? { eleveId } : {}),
        ...anneeEleve,
        date: { lte: maintenant },
      },
      scopeFilter
    ),
    select: {
      id: true,
      type: true,
      statut: true,
      gravite: true,
      description: true,
      lieu: true,
      date: true,
      eleve: { select: { id: true, nom: true, prenom: true, photoUrl: true } },
      rapportePar: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
    take: limit,
  });

  const list = incidents ?? [];
  const stats = {
    total: list.length,
    enAttente: list.filter((i) => i.statut === "OUVERT" || i.statut === "EN_TRAITEMENT").length,
    resolus: list.filter((i) => i.statut === "RESOLU").length,
    graves: list.filter((i) => i.gravite >= 3).length,
  };

  return NextResponse.json({ incidents: list, stats });
}
