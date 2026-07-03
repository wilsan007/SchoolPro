import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileToken, mobileUnauthorized } from "@/lib/mobile-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyMobileToken(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { id } = await params;

  const eleve = await prisma.eleve.findFirst({
    where: { id, tenantId: user.tenantId },
    select: {
      id: true,
      matricule: true,
      nom: true,
      prenom: true,
      dateNaissance: true,
      lieuNaissance: true,
      nationalite: true,
      sexe: true,
      photoUrl: true,
      statut: true,
      regime: true,
      groupeSanguin: true,
      allergies: true,
      contactUrgenceNom: true,
      contactUrgencePhone: true,
      classe: { select: { id: true, nom: true, niveau: true } },
    },
  });

  if (!eleve) {
    return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });
  }

  const [parents, notes, absences, incidents] = await Promise.all([
    prisma.eleveParent.findMany({
      where: { eleveId: id },
      select: {
        lien: true,
        isGardien: true,
        parent: {
          select: { id: true, nom: true, prenom: true, phone: true, phone2: true, email: true, profession: true },
        },
      },
    }),
    prisma.note.findMany({
      where: { eleveId: id, tenantId: user.tenantId },
      select: {
        id: true,
        valeur: true,
        noteMax: true,
        coefficient: true,
        date: true,
        intitule: true,
        matiere: { select: { nom: true, code: true, couleur: true, coefficient: true } },
      },
      orderBy: { date: "desc" },
      take: 20,
    }),
    prisma.absence.findMany({
      where: { eleveId: id, tenantId: user.tenantId },
      select: { id: true, date: true, isRetard: true, statut: true, motif: true },
      orderBy: { date: "desc" },
      take: 10,
    }),
    prisma.incident.findMany({
      where: { eleveId: id, tenantId: user.tenantId },
      select: { id: true, type: true, statut: true, gravite: true, description: true, date: true },
      orderBy: { date: "desc" },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    eleve: {
      ...eleve,
      parents,
      notes,
      absences,
      incidents,
    },
  });
}
