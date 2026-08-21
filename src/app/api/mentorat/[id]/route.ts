import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { z } from "zod";

const STATUTS = ["ACTIF", "SUSPENDU", "TERMINE", "ANNULE"] as const;

const PatchSchema = z.object({
  statut: z.enum(STATUTS).optional(),
  notes: z.string().max(2000).nullable().optional(),
  dateFin: z.string().nullable().optional(),
  frequence: z.string().optional(),
});

/**
 * Détail d'un mentorat avec objectifs et séances.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "mentorat:read");
    if (denied) return denied;

    const { id } = await params;
    const mentorat = await prisma.mentorat.findFirst({
      where: { id, tenantId: session.user.tenantId },
      include: {
        mentor: { select: { id: true, name: true, email: true } },
        mentore: { select: { id: true, name: true, email: true } },
        objectifs: { orderBy: { priorite: "asc" } },
        seances: { orderBy: { date: "desc" } },
      },
    });

    if (!mentorat) return erreurJson("MENTORAT_INTROUVABLE");
    return NextResponse.json(mentorat);
  } catch (error) {
    console.error("[API/mentorat/:id GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

/**
 * Modifie un mentorat (statut, notes, fin).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "mentorat:write");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    const existing = await prisma.mentorat.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });
    if (!existing) return erreurJson("MENTORAT_INTROUVABLE");

    const data: Record<string, unknown> = {};
    if (parsed.data.statut !== undefined) data.statut = parsed.data.statut;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
    if (parsed.data.frequence !== undefined) data.frequence = parsed.data.frequence;
    if (parsed.data.dateFin !== undefined) data.dateFin = parsed.data.dateFin ? new Date(parsed.data.dateFin) : null;

    // Terminer un mentorat enregistre automatiquement la date de fin.
    if (parsed.data.statut === "TERMINE" && !data.dateFin) {
      data.dateFin = new Date();
    }

    const updated = await prisma.mentorat.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API/mentorat/:id PATCH]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
