import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { z } from "zod";

const STATUTS = ["ADOPTÉE", "REJETÉE", "EN_ATTENTE", "RETIRÉE"] as const;

const PatchSchema = z.object({
  titre: z.string().min(2).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  statut: z.enum(STATUTS).optional(),
  dateVote: z.string().nullable().optional(),
  resultats: z.object({
    pour: z.number().int().min(0),
    contre: z.number().int().min(0),
    abstentions: z.number().int().min(0),
  }).nullable().optional(),
  dateEffet: z.string().nullable().optional(),
});

/**
 * Modifie une résolution (vote, statut, dates d'effet).
 *
 * Le vote enregistre le statut (ADOPTÉE/REJETÉE), les résultats et la date.
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

    const existing = await prisma.résolution.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });
    if (!existing) return erreurJson("RESOLUTION_INTROUVABLE");

    const data: Record<string, unknown> = {};
    if (parsed.data.titre !== undefined) data.titre = parsed.data.titre;
    if (parsed.data.description !== undefined) data.description = parsed.data.description;
    if (parsed.data.statut !== undefined) data.statut = parsed.data.statut;
    if (parsed.data.dateVote !== undefined) data.dateVote = parsed.data.dateVote ? new Date(parsed.data.dateVote) : null;
    if (parsed.data.resultats !== undefined) data.resultats = parsed.data.resultats;
    if (parsed.data.dateEffet !== undefined) data.dateEffet = parsed.data.dateEffet ? new Date(parsed.data.dateEffet) : null;

    // Un vote (ADOPTÉE/REJETÉE) enregistre automatiquement la date du vote
    // si elle n'est pas fournie.
    if (parsed.data.statut === "ADOPTÉE" || parsed.data.statut === "REJETÉE") {
      if (!data.dateVote) data.dateVote = new Date();
    }

    const updated = await prisma.résolution.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API/gouvernance/resolutions/:id PATCH]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
