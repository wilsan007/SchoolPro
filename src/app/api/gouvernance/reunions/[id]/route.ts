import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { z } from "zod";

const STATUTS = ["PLANIFIEE", "EN_COURS", "TERMINEE", "ANNULEE"] as const;

const PatchSchema = z.object({
  titre: z.string().min(2).max(200).optional(),
  date: z.string().optional(),
  lieu: z.string().max(200).nullable().optional(),
  ordreDuJour: z.string().max(5000).nullable().optional(),
  statut: z.enum(STATUTS).optional(),
  compteRendu: z.string().max(10000).nullable().optional(),
  presences: z.any().optional(),
});

/**
 * Modifie une réunion (statut, compte-rendu, présences).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "gouvernance:write");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    // Vérifier l'appartenance via la chaîne réunion -> conseil -> tenant
    const existing = await prisma.réunion.findFirst({
      where: { id, conseil: { tenantId: session.user.tenantId } },
    });
    if (!existing) return erreurJson("REUNION_INTROUVABLE");

    const data: Record<string, unknown> = {};
    if (parsed.data.titre !== undefined) data.titre = parsed.data.titre;
    if (parsed.data.date !== undefined) data.date = new Date(parsed.data.date);
    if (parsed.data.lieu !== undefined) data.lieu = parsed.data.lieu;
    if (parsed.data.ordreDuJour !== undefined) data.ordreDuJour = parsed.data.ordreDuJour;
    if (parsed.data.statut !== undefined) data.statut = parsed.data.statut;
    if (parsed.data.compteRendu !== undefined) data.compteRendu = parsed.data.compteRendu;
    if (parsed.data.presences !== undefined) data.presences = parsed.data.presences;

    const updated = await prisma.réunion.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API/gouvernance/reunions/:id PATCH]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
