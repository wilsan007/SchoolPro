import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { siteFilterForRelation, siteFilterForModel, isRelationScopedRole, personalScopeFilter } from "@/lib/site-filter";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  // `EmploiTemps` n'a pas de colonne `siteId` : filtrage via la classe.
  const anneeCourante = await getAnneeCouranteLibelle(user.tenantId);

  // Support du filtre par trimestre (periodeId) — si fourni, on retourne
  // les créneaux spécifiques à cette période + les créneaux annuels
  // (periodeId null). Sinon, tous les créneaux de l'année.
  const { searchParams } = new URL(req.url);
  const periodeId = searchParams.get("periodeId");

  // PARENT / STUDENT : restreindre aux seules classes de l'utilisateur / de ses enfants.
  let classeIds: string[] | null = null;
  if (isRelationScopedRole(user.role)) {
    const eleves = await prisma.eleve.findMany({
      where: {
        tenantId: user.tenantId,
        ...siteFilterForModel("eleve", user),
        ...personalScopeFilter(user, null),
      },
      select: { classeId: true },
    });
    if (eleves.length === 0) {
      return NextResponse.json({ emploi: [] });
    }
    classeIds = [...new Set(eleves.map((e) => e.classeId).filter((id): id is string => id !== null))];
  }

  const emploi = await prisma.emploiTemps.findMany({
    where: {
      tenantId: user.tenantId,
      ...siteFilterForRelation(user, "classe"),
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...(classeIds ? { classeId: { in: classeIds } } : {}),
      // Filtre période : spécifique à cette période OU annuel (periodeId null)
      ...(periodeId
        ? { OR: [{ periodeId }, { periodeId: null }] }
        : {}),
    },
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
