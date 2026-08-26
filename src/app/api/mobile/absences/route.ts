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
  const date = searchParams.get("date");

  // `Absence` n'a pas de colonne `siteId` : filtrage via la relation `eleve`,
  // plus périmètre personnel pour les comptes parent/élève.
  const scopeFilter = eleveScopeFilter(user, "eleve");
  const anneeCourante = await getAnneeCouranteLibelle(user.tenantId);
  const anneeEleve = anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {};
  const maintenant = await getDemoNow();

  const absences = await prisma.absence.findMany({
    where: mergeFilters(
      {
        tenantId: user.tenantId,
        ...(eleveId ? { eleveId } : {}),
        date: { lte: maintenant, ...(date ? { gte: new Date(date) } : {}) },
        ...anneeEleve,
      },
      scopeFilter
    ),
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
