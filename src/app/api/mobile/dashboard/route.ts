import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { eleveScopeFilter, siteFilterForModel, siteFilterForRelation, isRelationScopedRole } from "@/lib/site-scope";
import { getDemoNow } from "@/lib/demo-now";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const tenantId = user.tenantId;
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  // Les compteurs eux-mêmes fuitaient : ils révélaient les volumes de
  // l'ensemble de l'établissement, tous sites confondus.
  const eleveRelFilter = eleveScopeFilter(user, "eleve");
  const eleveSelfFilter = eleveScopeFilter(user, null);
  const classeRelFilter = siteFilterForRelation(user, "classe");

  const classeFilter = siteFilterForModel("classe", user);
  const anneeClasse = anneeCourante ? { classe: { annee: anneeCourante } } : {};
  const anneeEleve = anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {};
  const anneeClasseDirect = anneeCourante ? { annee: anneeCourante } : {};

  // PARENT / STUDENT : restreindre les compteurs et listes aux seuls enfants /
  // à sa propre classe.
  let classeIds: string[] | null = null;
  if (isRelationScopedRole(user.role)) {
    const eleves = await prisma.eleve.findMany({
      where: { tenantId, ...eleveSelfFilter },
      select: { classeId: true },
    });
    if (eleves.length === 0) {
      return NextResponse.json({
        stats: { totalEleves: 0, totalClasses: 0, totalAbsencesToday: 0, totalNotes: 0 },
        absencesRecentes: [],
        notesRecentes: [],
        prochainsExamens: [],
      });
    }
    classeIds = [...new Set(eleves.map((e) => e.classeId).filter((id): id is string => id !== null))];
  }

  const [totalEleves, totalClasses, totalNotes] = await Promise.all([
    prisma.eleve.count({ where: { tenantId, statut: "ACTIF", ...eleveSelfFilter, ...anneeClasse } }),
    prisma.classe.count({ where: { tenantId, ...(classeIds ? { ...classeFilter, id: { in: classeIds }, ...anneeClasseDirect } : { ...classeFilter, ...anneeClasseDirect }) } }),
    prisma.note.count({ where: { tenantId, ...eleveRelFilter, ...anneeClasse } }),
  ]);

  const today = await getDemoNow();
  today.setHours(0, 0, 0, 0);

  const totalAbsencesToday = await prisma.absence.count({
    where: { tenantId, date: { gte: today }, ...eleveRelFilter, ...anneeEleve },
  });

  const [absencesRecentes, notesRecentes, prochainsExamens] = await Promise.all([
    prisma.absence.findMany({
      where: { tenantId, ...eleveRelFilter, ...anneeEleve },
      select: {
        id: true,
        date: true,
        isRetard: true,
        statut: true,
        motif: true,
        eleve: { select: { id: true, nom: true, prenom: true, photoUrl: true } },
      },
      orderBy: { date: "desc" },
      take: 5,
    }),
    prisma.note.findMany({
      where: { tenantId, ...eleveRelFilter, ...anneeClasse },
      select: {
        id: true,
        valeur: true,
        noteMax: true,
        date: true,
        intitule: true,
        eleve: { select: { id: true, nom: true, prenom: true } },
        matiere: { select: { nom: true, code: true } },
      },
      orderBy: { date: "desc" },
      take: 5,
    }),
    prisma.evaluation.findMany({
      where: { tenantId, statut: "PLANIFIE", ...(classeIds ? { ...classeRelFilter, classeId: { in: classeIds } } : { ...classeRelFilter, ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}) }) },
      select: {
        id: true,
        titre: true,
        date: true,
        classe: { select: { nom: true } },
        matiere: { select: { nom: true } },
      },
      orderBy: { date: "asc" },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    stats: {
      totalEleves,
      totalClasses,
      totalAbsencesToday,
      totalNotes,
    },
    absencesRecentes,
    notesRecentes,
    prochainsExamens,
  });
}
