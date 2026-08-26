import { NextRequest, NextResponse } from "next/server";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import prisma from "@/lib/prisma";
import { eleveScopeFilter, siteFilterForModel, isRelationScopedRole } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const user = await verifyMobileScope(req);
    if (!user) return mobileUnauthorized();
    if (!user.tenantId) {
      return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
    }
    const eleveFilter = eleveScopeFilter(user, null);
    const classeFilter = siteFilterForModel("classe", user);
    const anneeCourante = await getAnneeCouranteLibelle(user.tenantId);

    // `Classe` porte `siteId` ; les élèves imbriqués sont filtrés séparément
    // pour qu'un parent ne récupère pas la liste complète de la classe.
    // PARENT / STUDENT : ne montrer que les classes de ses enfants / lui-même.
    // TEACHER : ne montrer que les classes de son périmètre (affectations + EDT).
    let classeIds: string[] | null = null;
    if (isRelationScopedRole(user.role)) {
      const eleves = await prisma.eleve.findMany({
        where: { tenantId: user.tenantId, ...eleveFilter },
        select: { classeId: true },
      });
      if (eleves.length === 0) {
        return NextResponse.json({ classes: [] });
      }
      classeIds = [...new Set(eleves.map((e) => e.classeId).filter((id): id is string => id !== null))];
    } else if (isTeacherRole(user.role as Role) && user.id) {
      const scope = await getTeacherScope(user.tenantId, user.id, user.role as Role, anneeCourante);
      if (scope.classeIds.length === 0) {
        return NextResponse.json({ classes: [] });
      }
      classeIds = scope.classeIds;
    }

    const classes = await prisma.classe.findMany({
      where: {
        tenantId: user.tenantId,
        ...(classeIds
          ? { ...classeFilter, id: { in: classeIds }, ...(anneeCourante ? { annee: anneeCourante } : {}) }
          : { ...classeFilter, ...(anneeCourante ? { annee: anneeCourante } : {}) }),
      },
      include: {
        eleves: {
          where: { statut: "ACTIF", ...eleveFilter },
          select: {
            id: true,
            nom: true,
            prenom: true,
            photoUrl: true,
            sexe: true,
            matricule: true,
          },
          orderBy: [{ prenom: "asc" }, { nom: "asc" }],
        },
      },
      orderBy: { nom: "asc" },
    });

    return NextResponse.json({ classes });
  } catch (error) {
    console.error("[API/mobile/classes]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
