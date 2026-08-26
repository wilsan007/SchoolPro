import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { siteFilterForModel, siteFilterForRelation } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";

export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  // Les statistiques agrégées ne doivent pas trahir les volumes des sites
  // auxquels l'utilisateur n'a pas accès.
  if (user.role === "PARENT" || user.role === "STUDENT") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const tenantId = user.tenantId;
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const eleveRelFilter = siteFilterForRelation(user, "eleve");
  const classeRelFilter = siteFilterForRelation(user, "classe");

  const eleveFilter = siteFilterForModel("eleve", user);
  const anneeClasse = anneeCourante ? { classe: { annee: anneeCourante } } : {};
  const anneeEleve = anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {};
  const anneeClasseDirect = anneeCourante ? { annee: anneeCourante } : {};
  const maintenant = await getDemoNow();
  const [
    totalEleves,
    totalClasses,
    totalEnseignants,
    totalNotes,
    totalAbsences,
    totalIncidents,
  ] = await Promise.all([
    prisma.eleve.count({ where: { tenantId, statut: "ACTIF", ...eleveFilter, ...anneeClasse } }),
    prisma.classe.count({ where: { tenantId, ...eleveFilter, ...anneeClasseDirect } }),
    prisma.enseignant.count({ where: { tenantId, ...siteFilterForModel("enseignant", user) } }),
    prisma.note.count({ where: { tenantId, ...eleveRelFilter, ...anneeClasse, date: { lte: maintenant } } }),
    prisma.absence.count({ where: { tenantId, ...eleveRelFilter, ...anneeEleve, date: { lte: maintenant } } }),
    prisma.incident.count({ where: { tenantId, ...eleveRelFilter, ...anneeEleve, date: { lte: maintenant } } }),
  ]);

  const classes = await prisma.classe.findMany({
    where: { tenantId, ...eleveFilter, ...anneeClasseDirect },
    select: { id: true, nom: true, niveau: true },
    orderBy: { nom: "asc" },
  });

  const classIds = classes.map((c) => c.id);

  // --- 1. Effectifs par classe : 1 groupBy au lieu de N count ---
  const effectifGroups = await prisma.eleve.groupBy({
    by: ["classeId"],
    where: { tenantId, classeId: { in: classIds }, statut: "ACTIF", ...eleveFilter },
    _count: { _all: true },
  });
  const effectifByClasseId = new Map(
    effectifGroups.map((g) => [g.classeId, g._count._all])
  );
  const elevesParClasse = classes.map((c) => ({
    id: c.id,
    nom: c.nom,
    niveau: c.niveau,
    effectif: effectifByClasseId.get(c.id) ?? 0,
  }));

  const matieres = await prisma.matiere.findMany({
    where: { tenantId, ...siteFilterForModel("matiere", user) },
    select: { id: true, nom: true, code: true, couleur: true },
    orderBy: { nom: "asc" },
  });

  // --- 2. Notes par matière : 1 groupBy au lieu de N count ---
  const matiereIds = matieres.map((m) => m.id);
  const noteGroups = await prisma.note.groupBy({
    by: ["matiereId"],
    where: { tenantId, matiereId: { in: matiereIds }, ...eleveRelFilter, ...anneeClasse },
    _count: { _all: true },
  });
  const countByMatiereId = new Map(
    noteGroups.map((g) => [g.matiereId, g._count._all])
  );
  const notesParMatiere = matieres.map((m) => ({
    id: m.id,
    nom: m.nom,
    code: m.code,
    couleur: m.couleur,
    count: countByMatiereId.get(m.id) ?? 0,
  }));

  // --- 3. Moyennes par classe : 1 findMany + groupement en mémoire ---
  const allNotes = await prisma.note.findMany({
    where: { tenantId, classeId: { in: classIds }, ...eleveRelFilter, ...anneeClasse },
    select: { classeId: true, valeur: true, noteMax: true, coefficient: true },
  });
  const notesByClasseId = new Map<string, typeof allNotes>();
  for (const n of allNotes) {
    const arr = notesByClasseId.get(n.classeId);
    if (arr) arr.push(n);
    else notesByClasseId.set(n.classeId, [n]);
  }
  const moyennesParClasse = classes.map((c) => {
    const notes = notesByClasseId.get(c.id) ?? [];
    const moyenne =
      notes.length > 0
        ? notes.reduce((acc, n) => acc + (n.valeur / n.noteMax) * 20 * n.coefficient, 0) /
          notes.reduce((acc, n) => acc + n.coefficient, 0)
        : null;
    return { classeId: c.id, classeNom: c.nom, moyenne };
  });

  return NextResponse.json({
    stats: {
      totalEleves,
      totalClasses,
      totalEnseignants,
      totalNotes,
      totalAbsences,
      totalIncidents,
    },
    elevesParClasse,
    notesParMatiere,
    moyennesParClasse,
    absencesParMois: totalAbsences,
  });
}
