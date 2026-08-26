import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";

/**
 * POST /api/reinscription/confirm
 * Confirmation publique (portail parent) — pas de session requise.
 * Body: { invitationId: string, confirme: boolean }
 *
 * Le parent reçoit un lien WhatsApp/email avec l'ID d'invitation.
 * Il confirme ou refuse la réinscription de son enfant.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.invitationId || typeof body.confirme !== "boolean") {
    return erreurJson("DONNEES_INVALIDES");
  }

  const invitation = await prisma.invitationReinscription.findUnique({
    where: { id: body.invitationId },
    include: { campagne: true },
  });

  if (!invitation) return erreurJson("INVITATION_INTROUVABLE");
  if (invitation.statut !== "INVITE" && invitation.statut !== "SANS_REPONSE") {
    return erreurJson("DEJA_REPONDU", undefined, {
      detail: `Statut actuel: ${invitation.statut}`,
    });
  }
  if (invitation.campagne.statut === "TERMINEE" || invitation.campagne.statut === "ANNULEE") {
    return erreurJson("CAMPAGNE_FERMEE");
  }

  await prisma.$transaction([
    prisma.invitationReinscription.update({
      where: { id: body.invitationId, tenantId: invitation.tenantId },
      data: {
        statut: body.confirme ? "CONFIRME" : "REFUSE",
        dateReponse: new Date(),
      },
    }),
    prisma.eleve.update({
      where: { id: invitation.eleveId, tenantId: invitation.tenantId },
      data: { statut: body.confirme ? "REINSCRIT" : "NON_REINSCRIT" },
    }),
  ]);

  // Mettre à jour les compteurs de la campagne
  const stats = await prisma.invitationReinscription.groupBy({
    by: ["statut"],
    where: { campagneId: invitation.campagneId, tenantId: invitation.tenantId },
    _count: true,
  });

  const nbReinscrits = stats.find((s) => s.statut === "CONFIRME")?._count ?? 0;
  const nbNonReinscrits =
    (stats.find((s) => s.statut === "REFUSE")?._count ?? 0) +
    (stats.find((s) => s.statut === "SANS_REPONSE")?._count ?? 0);

  await prisma.campagneReinscription.update({
    where: { id: invitation.campagneId, tenantId: invitation.tenantId },
    data: { nbReinscrits, nbNonReinscrits },
  });

  return Response.json({
    success: true,
    statut: body.confirme ? "CONFIRME" : "REFUSE",
    message: body.confirme
      ? "Réinscription confirmée. Merci !"
      : "Réinscription refusée. Merci d'avoir répondu.",
  });
}
