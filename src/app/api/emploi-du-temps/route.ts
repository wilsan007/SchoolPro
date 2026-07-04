import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";

const CreateSchema = z.object({
  classeId: z.string().min(1),
  matiereId: z.string().min(1),
  enseignantId: z.string().min(1).optional().or(z.literal("")),
  jour: z.enum(["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"]),
  heureDebut: z.string().regex(/^\d{2}:\d{2}$/),
  heureFin: z.string().regex(/^\d{2}:\d{2}$/),
  salle: z.string().max(50).optional(),
  annee: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const tenantId = session.user.tenantId;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currentYear: true } });

    const emplois = await prisma.emploiTemps.findMany({
      where: {
        tenantId,
        ...(classeId ? { classeId } : {}),
        ...(tenant ? { annee: tenant.currentYear } : {}),
      },
      include: {
        matiere: { select: { nom: true, code: true, couleur: true } },
        classe: { select: { nom: true } },
        enseignant: { include: { user: { select: { name: true } } } },
      },
      orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
    });

    return NextResponse.json(emplois);
  } catch (error) {
    console.error("[API/emploi-du-temps GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.issues }, { status: 400 });
    }

    const tenantId = session.user.tenantId;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currentYear: true } });

    const { classeId, matiereId, enseignantId, jour, heureDebut, heureFin, salle } = parsed.data;

    // Vérifier chevauchement pour la classe
    const overlap = await prisma.emploiTemps.findFirst({
      where: {
        tenantId,
        classeId,
        jour,
        annee: tenant?.currentYear ?? "2025-2026",
        OR: [
          // Cas 1 : le nouveau créneau commence dans un existant
          { heureDebut: { lte: heureDebut }, heureFin: { gt: heureDebut } },
          // Cas 2 : le nouveau créneau finit dans un existant
          { heureDebut: { lt: heureFin }, heureFin: { gte: heureFin } },
          // Cas 3 : le nouveau créneau contient un existant
          { heureDebut: { gte: heureDebut }, heureFin: { lte: heureFin } },
        ],
      },
    });

    if (overlap) {
      return NextResponse.json({ error: "Ce créneau chevauche un cours existant pour cette classe" }, { status: 409 });
    }

    // Vérifier conflit enseignant
    if (enseignantId) {
      const teacherConflict = await prisma.emploiTemps.findFirst({
        where: {
          tenantId,
          enseignantId,
          jour: jour as never,
          annee: tenant?.currentYear ?? "2025-2026",
          OR: [
            { heureDebut: { lte: heureDebut }, heureFin: { gt: heureDebut } },
            { heureDebut: { lt: heureFin }, heureFin: { gte: heureFin } },
            { heureDebut: { gte: heureDebut }, heureFin: { lte: heureFin } },
          ],
        },
      });
      if (teacherConflict) {
        return NextResponse.json({ error: "L'enseignant est déjà assigné à un autre cours à cet horaire" }, { status: 409 });
      }
    }

    // Vérifier conflit salle
    if (salle) {
      const roomConflict = await prisma.emploiTemps.findFirst({
        where: {
          tenantId,
          salle,
          jour: jour as never,
          annee: tenant?.currentYear ?? "2025-2026",
          OR: [
            { heureDebut: { lte: heureDebut }, heureFin: { gt: heureDebut } },
            { heureDebut: { lt: heureFin }, heureFin: { gte: heureFin } },
            { heureDebut: { gte: heureDebut }, heureFin: { lte: heureFin } },
          ],
        },
      });
      if (roomConflict) {
        return NextResponse.json({ error: "La salle est déjà occupée à cet horaire" }, { status: 409 });
      }
    }

    const creneau = await prisma.emploiTemps.create({
      data: {
        tenantId,
        classeId,
        matiereId,
        enseignantId: enseignantId || null,
        jour,
        heureDebut,
        heureFin,
        salle: salle ?? null,
        annee: tenant?.currentYear ?? "2025-2026",
      },
      include: {
        matiere: { select: { nom: true, code: true, couleur: true } },
        classe: { select: { nom: true } },
        enseignant: { include: { user: { select: { name: true } } } },
      },
    });

    revalidatePath("/emploi-du-temps");
    return NextResponse.json(creneau, { status: 201 });
  } catch (error) {
    console.error("[API/emploi-du-temps POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
