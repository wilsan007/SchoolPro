import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, siteFilterForRelation } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "rapports:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const eleveFilter = siteFilterForRelation(session.user, "eleve");
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const anneeClasseDirect = anneeCourante ? { annee: anneeCourante } : {};
  const anneeClasse = anneeCourante ? { classe: { annee: anneeCourante } } : {};
  const anneeEleve = anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {};
  const anneePeriode = anneeCourante ? { periode: { annee: { libelle: anneeCourante } } } : {};
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "palmares";

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, currentYear: true, city: true, country: true, logoUrl: true },
  });

  if (type === "palmares") {
    // Palmarès : top élèves avec bulletins publiés
    const bulletins = await prisma.bulletin.findMany({
      where: { tenantId, ...siteFilterForModel("bulletin", session.user), isPublie: true, moyenneGenerale: { not: null }, ...anneePeriode },
      include: {
        eleve: {
          select: { nom: true, prenom: true, matricule: true, classe: { select: { nom: true, niveau: true } } },
        },
        periode: { select: { nom: true, numero: true } },
      },
      orderBy: { moyenneGenerale: "desc" },
    });

    return NextResponse.json({ type, tenant, data: bulletins });
  }

  const siteFilter = siteFilterForModel("eleve", session.user);
  if (type === "statistiques") {
    const [totalEleves, totalEnseignants, totalClasses, notesStats, absencesStats] = await Promise.all([
      prisma.eleve.count({ where: { tenantId, ...siteFilter, statut: "ACTIF", ...anneeClasse } }),
      prisma.enseignant.count({ where: { tenantId, ...siteFilterForModel("enseignant", session.user) } }),
      prisma.classe.count({ where: { tenantId, ...siteFilter, ...anneeClasseDirect } }),
      prisma.note.aggregate({
        where: { tenantId, ...eleveFilter, isPubliee: true, ...anneeClasse },
        _avg: { valeur: true },
        _count: { id: true },
      }),
      prisma.absence.groupBy({
        by: ["statut"],
        where: { tenantId, ...eleveFilter, ...anneeEleve },
        _count: { id: true },
      }),
      prisma.eleve.count({ where: { tenantId, ...siteFilter, statut: "ACTIF", ...anneeClasse } }),
    ]);

    const absMap = Object.fromEntries(absencesStats.map((a) => [a.statut, a._count.id]));

    return NextResponse.json({
      type, tenant,
      data: {
        totalEleves, totalEnseignants, totalClasses,
        moyenneGenerale: notesStats._avg.valeur,
        totalNotes: notesStats._count.id,
        absences: absMap,
      },
    });
  }

  if (type === "inspection") {
    // Rapport d'inspection : données complètes de l'établissement
    const [classes, matieres, enseignants, eleves] = await Promise.all([
      prisma.classe.findMany({
        where: { tenantId, ...siteFilter, ...anneeClasseDirect },
        select: { nom: true, niveau: true, filiere: true, effectifMax: true, _count: { select: { eleves: { where: { statut: "ACTIF" } } } } },
      }),
      prisma.matiere.findMany({ where: { tenantId, ...siteFilterForModel("matiere", session.user) }, select: { nom: true, code: true, coefficient: true } }),
      prisma.enseignant.findMany({
        where: { tenantId, ...siteFilterForModel("enseignant", session.user) },
        select: { specialite: true, typeContrat: true, user: { select: { name: true } } },
      }),
      prisma.eleve.groupBy({ by: ["statut"], where: { tenantId, ...siteFilter, ...anneeClasse }, _count: { id: true } }),
    ]);

    return NextResponse.json({ type, tenant, data: { classes, matieres, enseignants, elevesParStatut: eleves } });
  }

  return NextResponse.json({ error: "Type de rapport inconnu" }, { status: 400 });
}
