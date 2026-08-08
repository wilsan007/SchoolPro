import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { eleveScopeFilter, siteFilterForModel, mergeFilters } from "@/lib/site-scope";

export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const eleveId = searchParams.get("eleveId");
  const matiereId = searchParams.get("matiereId");

  // Sans filtre, un appel sans `eleveId` renvoyait les notes de TOUS les élèves
  // du tenant — tous sites confondus, et y compris pour un compte parent.
  const noteFilter = eleveScopeFilter(user, "eleve");

  const classeFilter = siteFilterForModel("classe", user);
  const [notes, matieres, classes] = await Promise.all([
    prisma.note.findMany({
      where: mergeFilters(
        {
          tenantId: user.tenantId,
          ...(eleveId ? { eleveId } : {}),
          ...(matiereId ? { matiereId } : {}),
        },
        noteFilter
      ),
      select: {
        id: true,
        valeur: true,
        noteMax: true,
        coefficient: true,
        date: true,
        intitule: true,
        type: true,
        eleve: { select: { id: true, nom: true, prenom: true } },
        matiere: { select: { id: true, nom: true, code: true, couleur: true, coefficient: true } },
        classe: { select: { id: true, nom: true } },
      },
      orderBy: { date: "desc" },
      take: 50,
    }),
    prisma.matiere.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, nom: true, code: true, couleur: true, coefficient: true },
      orderBy: { nom: "asc" },
    }),
    prisma.classe.findMany({
      where: { tenantId: user.tenantId, ...classeFilter },
      select: { id: true, nom: true, niveau: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  return NextResponse.json({ notes, matieres, classes });
}
