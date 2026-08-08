import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForRelation } from "@/lib/site-filter";

const FicheRHSchema = z.object({
  typeContrat: z.enum(["CDI", "CDD", "VACATAIRE", "FONCTIONNAIRE", "STAGIAIRE"]).optional(),
  dateEntree: z.string().optional().nullable(),
  dateSortie: z.string().optional().nullable(),
  salaireBase: z.number().optional().nullable(),
  tarifHoraire: z.number().optional().nullable(),
  diplome: z.string().optional(),
  echelon: z.number().int().min(1).optional(),
  grade: z.string().optional(),
  banque: z.string().optional(),
  rib: z.string().optional(),
  congesAnnuels: z.number().int().optional(),
  evaluation: z.string().optional(),
  observations: z.string().optional(),
});

// PATCH — créer ou mettre à jour la fiche RH d'un enseignant
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "rh:write");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const data = FicheRHSchema.parse(body);

  const siteFilter = siteFilterForRelation(session.user, "user");

  // Vérifier que l'enseignant appartient au tenant et au site
  const enseignant = await prisma.enseignant.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter },
  });

  if (!enseignant) {
    return NextResponse.json({ error: "Enseignant introuvable" }, { status: 404 });
  }

  // Upsert fiche RH
  const ficheRH = await prisma.ficheRH.upsert({
    where: { enseignantId: id },
    create: {
      enseignantId: id,
      tenantId: session.user.tenantId,
      ...data,
      dateEntree: data.dateEntree ? new Date(data.dateEntree) : null,
      dateSortie: data.dateSortie ? new Date(data.dateSortie) : null,
    },
    update: {
      ...data,
      dateEntree: data.dateEntree ? new Date(data.dateEntree) : undefined,
      dateSortie: data.dateSortie ? new Date(data.dateSortie) : undefined,
    },
  });

  return NextResponse.json({ ficheRH });
}

// POST — générer un bulletin de paie
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "rh:write");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const { mois, annee } = z.object({ mois: z.number(), annee: z.number() }).parse(body);

  const siteFilter2 = siteFilterForRelation(session.user, "user");

  const ficheRH = await prisma.ficheRH.findFirst({
    where: { enseignantId: id, tenantId: session.user.tenantId, enseignant: { ...(siteFilter2 as any).user ? { user: (siteFilter2 as any).user } : {} } },
    include: {
      enseignant: {
        include: {
          emploiTemps: { select: { heureDebut: true, heureFin: true } },
        },
      },
    },
  });

  if (!ficheRH) {
    return NextResponse.json({ error: "Fiche RH introuvable" }, { status: 404 });
  }

  // Calcul des heures hebdo depuis l'emploi du temps
  const totalMinutesHebdo = ficheRH.enseignant.emploiTemps.reduce((sum, et) => {
    const [hd, md] = et.heureDebut.split(":").map(Number);
    const [hf, mf] = et.heureFin.split(":").map(Number);
    return sum + (hf * 60 + mf) - (hd * 60 + md);
  }, 0);
  const heuresHebdo = totalMinutesHebdo / 60;

  // Approximation : 4 semaines par mois
  const heuresEffectuees = Math.round(heuresHebdo * 4 * 10) / 10;

  // Calcul paie
  let salaireBase = ficheRH.salaireBase ?? 0;
  if (ficheRH.tarifHoraire && heuresEffectuees > 0) {
    salaireBase = ficheRH.tarifHoraire * heuresEffectuees;
  }

  const netAPayer = salaireBase; // simplifié (sans cotisations pour l'instant)

  const bulletin = await prisma.bulletinPaie.upsert({
    where: { ficheRHId_mois_annee: { ficheRHId: ficheRH.id, mois, annee } },
    create: {
      ficheRHId: ficheRH.id,
      mois, annee, heuresEffectuees, salaireBase, netAPayer,
    },
    update: { heuresEffectuees, salaireBase, netAPayer },
  });

  return NextResponse.json({ bulletin });
}
