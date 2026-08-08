import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

// GET — liste des élèves avec leur parcours et recommandation
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "orientation:read");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const eleveId = searchParams.get("eleveId");


  const siteFilter = siteFilterForModel("eleve", session.user);
  if (eleveId) {
    // Parcours complet d'un élève
    const [eleve, parcours, notes, absences, incidents] = await Promise.all([
      prisma.eleve.findFirst({
        where: { id: eleveId, tenantId: session.user.tenantId, ...siteFilter },
        include: {
          classe: { select: { nom: true, niveau: true, filiere: true } },
          parents: { include: { parent: { select: { nom: true, prenom: true, phone: true } } } },
        },
      }),
      prisma.parcoursScolaire.findMany({
        where: { eleveId, tenantId: session.user.tenantId },
        orderBy: { annee: "desc" },
      }),
      prisma.note.findMany({
        where: { eleveId, tenantId: session.user.tenantId, isPubliee: true },
        select: { valeur: true, noteMax: true, coefficient: true, matiere: { select: { nom: true } }, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.absence.count({ where: { eleveId, tenantId: session.user.tenantId, statut: "INJUSTIFIEE" } }),
      prisma.incident.count({ where: { eleveId, tenantId: session.user.tenantId } }),
    ]);

    return NextResponse.json({ eleve, parcours, notes, absencesInjust: absences, incidents });
  }

  // Liste élèves avec résumé parcours
  const eleves = await prisma.eleve.findMany({
    where: { tenantId: session.user.tenantId, ...siteFilter, statut: "ACTIF" },
    include: {
      classe: { select: { nom: true, niveau: true } },
      parcours: { orderBy: { annee: "desc" }, take: 1 },
      notes: { where: { isPubliee: true }, select: { valeur: true, noteMax: true, coefficient: true } },
      absences: { where: { statut: "INJUSTIFIEE" }, select: { id: true } },
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  return NextResponse.json({ eleves });
}

// POST — créer / mettre à jour un parcours scolaire
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "orientation:write");
  if (denied) return denied;

  const body = await req.json();
  const Schema = z.object({
    eleveId: z.string(),
    annee: z.string(),
    classe: z.string(),
    niveau: z.string(),
    moyenneAnnuelle: z.number().optional(),
    rang: z.number().optional(),
    effectif: z.number().optional(),
    decision: z.string().optional(),
    mention: z.string().optional(),
    recommandation: z.enum([
      "FILIERE_SCIENTIFIQUE", "FILIERE_LITTERAIRE", "FILIERE_TECHNIQUE",
      "FILIERE_PROFESSIONNELLE", "REDOUBLEMENT", "SOUTIEN_RENFORCE", "EXCELLENTE_VOIE",
    ]).optional(),
    commentaire: z.string().optional(),
  });

  const data = Schema.parse(body);

  const parcours = await prisma.parcoursScolaire.upsert({
    where: { eleveId_annee: { eleveId: data.eleveId, annee: data.annee } },
    create: { ...data, tenantId: session.user.tenantId },
    update: data,
  });

  return NextResponse.json({ parcours }, { status: 201 });
}
