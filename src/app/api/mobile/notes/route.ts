import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { eleveScopeFilter, siteFilterForModel, mergeFilters, personalScopeFilter } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

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
  const anneeCourante = await getAnneeCouranteLibelle(user.tenantId);
  const anneeClasse = anneeCourante ? { classe: { annee: anneeCourante } } : {};
  const anneeClasseDirect = anneeCourante ? { annee: anneeCourante } : {};
  const maintenant = await getDemoNow();

  // PARENT / STUDENT : les classes affichées doivent être celles de leurs enfants / eux-mêmes.
  // TEACHER : restreindre aux classes de son périmètre (affectations + EDT).
  let teacherClasseIds: string[] | null = null;
  if (isTeacherRole(user.role as Role) && user.id) {
    const scope = await getTeacherScope(user.tenantId, user.id, user.role as Role, anneeCourante);
    teacherClasseIds = scope.classeIds;
  }
  const classeFilter = mergeFilters(
    siteFilterForModel("classe", user),
    personalScopeFilter(user, "eleves"),
    teacherClasseIds ? { id: { in: teacherClasseIds } } : {}
  );
  const noteTeacherFilter = teacherClasseIds ? { classeId: { in: teacherClasseIds } } : {};
  const [notes, matieres, classes] = await Promise.all([
    prisma.note.findMany({
      where: mergeFilters(
        {
          tenantId: user.tenantId,
          ...(eleveId ? { eleveId } : {}),
          ...(matiereId ? { matiereId } : {}),
          ...anneeClasse,
          ...noteTeacherFilter,
          date: { lte: maintenant },
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
      where: { tenantId: user.tenantId, ...siteFilterForModel("matiere", user) },
      select: { id: true, nom: true, code: true, couleur: true, coefficient: true },
      orderBy: { nom: "asc" },
    }),
    prisma.classe.findMany({
      where: { tenantId: user.tenantId, ...classeFilter, ...anneeClasseDirect },
      select: { id: true, nom: true, niveau: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  return NextResponse.json({ notes, matieres, classes });
}
