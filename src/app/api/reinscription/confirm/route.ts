import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";
import { auditFire } from "@/lib/audit";

const BodySchema = z.object({
  // API-H3 (audit v2) : token aléatoire remplaçant l'ID incrémental.
  invitationId: z.string().min(1).optional(),
  token: z.string().min(32).max(128).optional(),
  confirme: z.boolean(),
}).refine((d) => d.invitationId || d.token, {
  message: "invitationId ou token requis",
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

  const raw = await req.json().catch((e) => { console.warn("[non-fatal]", e); return null; });
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES");
  }
  const { invitationId, token, confirme } = parsed.data;

  // API-H3 (audit v2) : recherche par token (prioritaire) ou par ID (legacy).
  let invitation;
  if (token) {
    // eslint-disable-next-line ecolpro/require-tenant-id -- token public, pas de tenant
    invitation = await prisma.invitationReinscription.findFirst({
      where: { token },
      include: { campagne: true },
    });
  } else {
     
    invitation = await prisma.invitationReinscription.findUnique({
      where: { id: invitationId! },
      include: { campagne: true },
    });
  }

  if (!invitation) return erreurJson("INVITATION_INTROUVABLE");

  // API-H3 : vérifier l'expiration du token si définie.
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return erreurJson("INVITATION_EXPIREE");
  }

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
      where: { id: invitation.id, tenantId: invitation.tenantId },
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

  auditFire({
    tenantId: invitation.tenantId,
    userId: null,
    action: "reinscription:confirm",
    verdict: "ALLOWED",
    resource: "eleve",
    resourceId: invitation.eleveId,
    metadata: { confirme, invitationId: invitation.id },
  });

  return Response.json({
    success: true,
    statut: confirme ? "CONFIRME" : "REFUSE",
    message: confirme
      ? "Réinscription confirmée. Merci !"
      : "Réinscription refusée. Merci d'avoir répondu.",
  });
}
