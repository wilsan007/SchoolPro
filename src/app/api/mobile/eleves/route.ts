import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { eleveScopeFilter, mergeFilters } from "@/lib/site-filter";

const QuerySchema = z.object({
  q: z.string().optional(),
  classeId: z.string().optional(),
  annee: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const tenantId = user.tenantId;
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", details: parsed.error.issues }, { status: 400 });
  }

  const { q, classeId, annee } = parsed.data;
  const anneeLibelle = annee ?? (await getAnneeCouranteLibelle(tenantId));

  const scopeFilter = eleveScopeFilter(user, null);

  const eleves = await prisma.eleve.findMany({
    where: mergeFilters(
      {
        tenantId,
        ...(anneeLibelle ? { anneeInscription: anneeLibelle } : {}),
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
