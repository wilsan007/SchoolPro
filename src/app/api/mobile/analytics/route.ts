import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileToken, mobileUnauthorized } from "@/lib/mobile-auth";

export async function GET(req: NextRequest) {
  const user = await verifyMobileToken(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const tenantId = user.tenantId;

  const [
    totalEleves,
    totalClasses,
    totalEnseignants,
    totalNotes,
    totalAbsences,
    totalIncidents,
  ] = await Promise.all([
    prisma.eleve.count({ where: { tenantId, statut: "ACTIF" } }),
    prisma.classe.count({ where: { tenantId } }),
    prisma.enseignant.count({ where: { tenantId } }),
    prisma.note.count({ where: { tenantId } }),
    prisma.absence.count({ where: { tenantId } }),
    prisma.incident.count({ where: { tenantId } }),
  ]);

  const classes = await prisma.classe.findMany({
    where: { tenantId },
    select: { id: true, nom: true, niveau: true },
    orderBy: { nom: "asc" },
  });

  const elevesParClasse = await Promise.all(
    classes.map(async (c) => {
      const effectif = await prisma.eleve.count({
        where: { tenantId, classeId: c.id, statut: "ACTIF" },
      });
      return { id: c.id, nom: c.nom, niveau: c.niveau, effectif };
    })
  );

  const matieres = await prisma.matiere.findMany({
    where: { tenantId },
    select: { id: true, nom: true, code: true, couleur: true },
    orderBy: { nom: "asc" },
  });

  const notesParMatiere = await Promise.all(
    matieres.map(async (m) => {
      const count = await prisma.note.count({
        where: { tenantId, matiereId: m.id },
      });
      return { id: m.id, nom: m.nom, code: m.code, couleur: m.couleur, count };
    })
  );

  const moyennesParClasse = await Promise.all(
    classes.map(async (c) => {
      const notes = await prisma.note.findMany({
        where: { tenantId, classeId: c.id },
        select: { valeur: true, noteMax: true, coefficient: true },
      });

      const moyenne =
        notes.length > 0
          ? notes.reduce((acc, n) => acc + (n.valeur / n.noteMax) * 20 * n.coefficient, 0) /
            notes.reduce((acc, n) => acc + n.coefficient, 0)
          : null;
      return { classeId: c.id, classeNom: c.nom, moyenne };
    })
  );

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
