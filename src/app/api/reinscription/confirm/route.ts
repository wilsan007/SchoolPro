import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";

const BodySchema = z.object({
  invitationId: z.string().min(1),
  confirme: z.boolean(),
});

/**
 * POST /api/reinscription/confirm
 * Confirmation publique (portail parent) — pas de session requise.
 * Body: { invitationId: string, confirme: boolean }
 *
 * Le parent reçoit un lien WhatsApp/email avec l'ID d'invitation.
 * Il confirme ou refuse la réinscription de son enfant.
 */
export async function POST(req: NextRequest) {
  // Rate limit : 5 requêtes/min par IP pour limiter l'énumération d'invitations
  const ip = getClientIP(req);
  const rl = rateLimit({ max: 5, windowSec: 60, key: `reinsc-confirm:${ip}` });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez dans un instant." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES");
  }
  const { invitationId, confirme } = parsed.data;

  const invitation = await prisma.invitationReinscription.findUnique({
    where: { id: invitationId },
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
      where: { id: invitationId, tenantId: invitation.tenantId },
      data: {
        statut: confirme ? "CONFIRME" : "REFUSE",
        dateReponse: new Date(),
      },
    }),
    prisma.eleve.update({
      where: { id: invitation.eleveId, tenantId: invitation.tenantId },
      data: { statut: confirme ? "REINSCRIT" : "NON_REINSCRIT" },
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
    statut: confirme ? "CONFIRME" : "REFUSE",
    message: confirme
      ? "Réinscription confirmée. Merci !"
      : "Réinscription refusée. Merci d'avoir répondu.",
  });
}
