import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";

const IdSchema = z.string().min(1);

/**
 * GET /api/reinscription/invitation/[id]
 * Récupère une invitation par ID (pour le portail parent public).
 * Pas de session requise — l'ID d'invitation est le token d'accès.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ─── Rate limiting : 10 requêtes / min / IP ─────────────────────────────
  const ip = getClientIP(req);
  const rl = rateLimit({
    max: 10,
    windowSec: 60,
    key: `reinsc-invitation:${ip}`,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { id } = await params;
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES");
  }

  // Route publique : l'ID d'invitation sert de token d'accès.
  // Pas de filtre tenant — l'invitation est introuvable sans l'ID correct.
  // eslint-disable-next-line ecolpro/require-tenant-id
  const invitation = await prisma.invitationReinscription.findUnique({
    where: { id: parsed.data },
    include: {
      campagne: {
        select: { libelle: true, anneeCible: true, statut: true },
      },
      eleve: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          matricule: true,
          statut: true,
          classe: { select: { nom: true, niveau: true } },
        },
      },
    },
  });

  if (!invitation) return erreurJson("INVITATION_INTROUVABLE");

  return Response.json({
    id: invitation.id,
    statut: invitation.statut,
    campagne: invitation.campagne,
    eleve: invitation.eleve,
    dateInvitation: invitation.dateInvitation,
    dateReponse: invitation.dateReponse,
  });
}
