import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";

/**
 * GET /api/reinscription/invitation/[id]
 * Récupère une invitation par ID (pour le portail parent public).
 * Pas de session requise — l'ID d'invitation est le token d'accès.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Route publique : l'ID d'invitation sert de token d'accès.
  // Pas de filtre tenant — l'invitation est introuvable sans l'ID correct.
  // eslint-disable-next-line ecolpro/require-tenant-id
  const invitation = await prisma.invitationReinscription.findUnique({
    where: { id },
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
