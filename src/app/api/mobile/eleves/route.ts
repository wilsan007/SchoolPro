import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { eleveScopeFilter, mergeFilters } from "@/lib/site-filter";

export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const tenantId = user.tenantId;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const classeId = searchParams.get("classeId");

  // Isolation par site + périmètre personnel, appliquée directement sur `Eleve`.
  // `mergeFilters` est indispensable : le `OR` de recherche ci-dessous écraserait
  // un fragment étalé naïvement.
  const scopeFilter = eleveScopeFilter(user, null);

  const eleves = await prisma.eleve.findMany({
    where: mergeFilters(
      {
        tenantId,
        ...(classeId ? { classeId } : {}),
        ...(q
          ? {
              OR: [
                { nom: { contains: q, mode: "insensitive" as const } },
                { prenom: { contains: q, mode: "insensitive" as const } },
                { matricule: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      scopeFilter
    ),
    select: {
      id: true,
      matricule: true,
      nom: true,
      prenom: true,
      dateNaissance: true,
      sexe: true,
      statut: true,
      photoUrl: true,
      classe: { select: { id: true, nom: true, niveau: true } },
    },
    orderBy: { prenom: "asc" },
    take: 100,
  });

  return NextResponse.json({ eleves });
}
