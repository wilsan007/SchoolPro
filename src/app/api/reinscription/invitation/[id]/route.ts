import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";

const TokenSchema = z.string().min(32).max(128);

/**
 * GET /api/reinscription/invitation/[id]?token=xxx
 * Récupère une invitation par token aléatoire (API-H3, audit v2).
 * Le paramètre [id] est ignoré pour compatibilité rétroactive ; seul le
 * `token` query string est utilisé pour la recherche. Si aucun token
 * n'est fourni, on retombe sur l'ID (legacy, à retirer après migration).
 * Pas de session requise — le token est le token d'accès.
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

  await params; // consommer le paramètre (compatibilité route)

  const token = new URL(req.url).searchParams.get("token");
  const parsedToken = token ? TokenSchema.safeParse(token) : null;

  // Route publique : le token (ou l'ID legacy) sert de token d'accès.
  // Pas de filtre tenant — l'invitation est introuvable sans le token correct.
  let invitation;
  if (parsedToken?.success) {
    // eslint-disable-next-line ecolpro/require-tenant-id -- token public, pas de tenant
    invitation = await prisma.invitationReinscription.findFirst({
      where: { token: parsedToken.data },
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
  } else {
    // Fallback legacy : recherche par ID (à retirer après migration complète)
    // eslint-disable-next-line ecolpro/require-tenant-id -- route publique legacy
    invitation = await prisma.invitationReinscription.findUnique({
      where: { id: new URL(req.url).searchParams.get("id") ?? "" },
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
  }

  if (!invitation) return erreurJson("INVITATION_INTROUVABLE");

  // API-H3 : vérifier l'expiration du token si définie.
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return erreurJson("INVITATION_EXPIREE");
  }

  return Response.json({
    id: invitation.id,
    statut: invitation.statut,
    campagne: invitation.campagne,
    eleve: invitation.eleve,
    dateInvitation: invitation.dateInvitation,
    dateReponse: invitation.dateReponse,
  });
}
