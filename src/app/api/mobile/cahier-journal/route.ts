import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

/**
 * Séances pédagogiques (cahier-journal) accessibles depuis l'app mobile.
 *
 * GET /api/mobile/cahier-journal?classeId=...&semaine=...
 *
 * Respecte le scope enseignant (un prof ne voit que ses classes/matieres)
 * et l'isolation site. Filtré par année courante.
 */
export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const classeId = searchParams.get("classeId");
  const semaine = searchParams.get("semaine");

  const anneeCourante = await getAnneeCouranteLibelle(user.tenantId);

  // Scope enseignant
  const teacherScope = isTeacherRole(user.role as Role)
    ? await getTeacherScope(user.tenantId, user.id, user.role as Role, anneeCourante)
    : null;
  const scopeFilter = teacherScope?.isRestricted
    ? {
        AND: [
          ...(teacherScope.classeIds.length > 0
            ? [{ classeId: { in: teacherScope.classeIds } }]
            : [{ id: "__none__" as const }]),
          ...(teacherScope.matiereIds.length > 0
            ? [{ matiereId: { in: teacherScope.matiereIds } }]
            : [{ id: "__none__" as const }]),
        ],
      }
    : {};

  const seances = await prisma.seancePedagogique.findMany({
    where: {
      tenantId: user.tenantId,
      ...siteFilterForModel("seancePedagogique", user),
      ...scopeFilter,
      ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
      ...(classeId ? { classeId } : {}),
      ...(semaine ? { semaine: parseInt(semaine, 10) } : {}),
    },
    select: {
      id: true,
      date: true,
      statut: true,
      contenu: true,
      semaine: true,
      dureePrevue: true,
      dureeReelle: true,
      rythme: true,
      presents: true,
      absents: true,
      classe: { select: { id: true, nom: true, niveau: true } },
      matiere: { select: { id: true, nom: true, code: true, couleur: true } },
      enseignant: {
        select: { id: true, user: { select: { name: true } } },
      },
    },
    orderBy: [{ date: "desc" }],
    take: 50,
  });

  return NextResponse.json({ seances });
}
