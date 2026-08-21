import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { z } from "zod";

const TYPES = ["ACADEMIQUE", "PROFESSIONNEL", "PERSONNEL"] as const;
const STATUTS = ["ACTIF", "SUSPENDU", "TERMINE", "ANNULE"] as const;
const FREQUENCES = ["HEBDOMADAIRE", "BIHEBDOMADAIRE", "MENSUEL", "PONCTUEL"] as const;

const CreateSchema = z.object({
  mentorId: z.string().min(1),
  mentoreId: z.string().min(1),
  type: z.enum(TYPES).default("ACADEMIQUE"),
  frequence: z.enum(FREQUENCES).default("MENSUEL"),
  notes: z.string().max(2000).optional(),
  dateDebut: z.string().optional(),
});

/**
 * Liste les mentorats du tenant avec filtres optionnels.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "mentorat:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const statut = searchParams.get("statut");
    const mentorId = searchParams.get("mentorId");

    const mentorats = await prisma.mentorat.findMany({
      where: {
        tenantId: session.user.tenantId,
        ...(statut ? { statut } : {}),
        ...(mentorId ? { mentorId } : {}),
      },
      include: {
        mentor: { select: { id: true, name: true, email: true } },
        mentore: { select: { id: true, name: true, email: true } },
        objectifs: { orderBy: { priorite: "asc" } },
        seances: { orderBy: { date: "desc" }, take: 5 },
        _count: { select: { objectifs: true, seances: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ mentorats });
  } catch (error) {
    console.error("[API/mentorat GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

/**
 * Crée une relation de mentorat.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "mentorat:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    if (parsed.data.mentorId === parsed.data.mentoreId) {
      return erreurJson("DONNEES_INVALIDES", undefined, {
        fr: "Le mentor et le mentoré ne peuvent pas être la même personne",
      });
    }

    // Vérifier l'unicité (une relation active ne doit pas déjà exister)
    const existant = await prisma.mentorat.findFirst({
      where: {
        mentorId: parsed.data.mentorId,
        mentoreId: parsed.data.mentoreId,
        statut: "ACTIF",
        tenantId: session.user.tenantId,
      },
    });
    if (existant) {
      return erreurJson("CONFLIT_MENTORAT_EXISTANT");
    }

    const mentorat = await prisma.mentorat.create({
      data: {
        tenantId: session.user.tenantId,
        mentorId: parsed.data.mentorId,
        mentoreId: parsed.data.mentoreId,
        type: parsed.data.type,
        frequence: parsed.data.frequence,
        notes: parsed.data.notes ?? null,
        dateDebut: parsed.data.dateDebut ? new Date(parsed.data.dateDebut) : new Date(),
      },
      include: {
        mentor: { select: { id: true, name: true } },
        mentore: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(mentorat, { status: 201 });
  } catch (error) {
    console.error("[API/mentorat POST]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
