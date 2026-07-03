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

  const [totalEleves, totalClasses, totalNotes] = await Promise.all([
    prisma.eleve.count({ where: { tenantId, statut: "ACTIF" } }),
    prisma.classe.count({ where: { tenantId } }),
    prisma.note.count({ where: { tenantId } }),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalAbsencesToday = await prisma.absence.count({
    where: { tenantId, date: { gte: today } },
  });

  const [absencesRecentes, notesRecentes, prochainsExamens] = await Promise.all([
    prisma.absence.findMany({
      where: { tenantId },
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
      where: { tenantId },
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
      where: { tenantId, statut: "PLANIFIE" },
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
