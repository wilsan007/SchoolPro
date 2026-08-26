import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import { getSchoolGroup, SCHOOL_GROUP_ORDER } from "@/lib/school-groups";
import type { Role } from "@prisma/client";

/**
 * Hiérarchie des classes : Catégorie → Niveau → Classe.
 *
 * GET /api/mobile/classes-hierarchie
 *
 * Version mobile de src/lib/classes-hierarchie.ts.
 * Respecte le scope enseignant, site, et année courante.
 */
export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const anneeCourante = await getAnneeCouranteLibelle(user.tenantId);
  const siteFilter = siteFilterForModel("classe", user);

  // Scope enseignant
  let classeIds: string[] | null = null;
  if (user.id && user.role && isTeacherRole(user.role as Role)) {
    const scope = await getTeacherScope(user.tenantId, user.id, user.role as Role, anneeCourante);
    classeIds = scope.classeIds;
  }

  const classes = await prisma.classe.findMany({
    where: {
      tenantId: user.tenantId,
      deletedAt: null,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...(classeIds ? { id: { in: classeIds } } : {}),
      ...siteFilter,
    },
    select: {
      id: true,
      nom: true,
      niveau: true,
      filiere: true,
      siteId: true,
      _count: { select: { eleves: { where: { statut: "ACTIF" } } } },
    },
    orderBy: { nom: "asc" },
  });

  // Grouper par catégorie → niveau
  const parCategorie = new Map<string, Map<string, typeof classes>>();

  for (const classe of classes) {
    const categorie = getSchoolGroup(classe.niveau);
    if (!parCategorie.has(categorie)) parCategorie.set(categorie, new Map());
    const parNiveau = parCategorie.get(categorie)!;
    if (!parNiveau.has(classe.niveau)) parNiveau.set(classe.niveau, []);
    parNiveau.get(classe.niveau)!.push(classe);
  }

  // Construire la réponse ordonnée par SCHOOL_GROUP_ORDER
  const hierarchie = SCHOOL_GROUP_ORDER.map((categorie) => {
    const parNiveau = parCategorie.get(categorie);
    if (!parNiveau) return null;

    const niveaux = Array.from(parNiveau.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([niveau, classesNiveau]) => ({
        niveau,
        classes: classesNiveau.map((c) => ({
          id: c.id,
          nom: c.nom,
          niveau: c.niveau,
          filiere: c.filiere,
          effectif: c._count.eleves,
        })),
      }));

    return { categorie, niveaux };
  }).filter(Boolean);

  return NextResponse.json({ hierarchie });
}
