import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { normaliserEmail } from "@/lib/email";
import { auditFire } from "@/lib/audit";
import { genererTokenReset } from "@/lib/password-reset";
import { sendEmail } from "@/lib/notifications/email";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { withSystemContext } from "@/lib/rls-context";

const BodySchema = z.object({
  email: z.string().trim().email(),
  // `null` accepté : un client sans widget (mobile, sitekey absente) envoie
  // null, que `optional()` seul rejette — toute demande échouait alors en silence.
  turnstileToken: z.string().nullish(),
});

const APP_URL = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

export async function POST(request: NextRequest) {
  // ─── Rate limiting ─────────────────────────────────────────────────────
  // Une école entière sort par une seule IP publique (NAT), et sans
  // TRUSTED_IP_HEADER toutes les requêtes partagent la clé « unknown » : un
  // plafond strict par IP bloquait tout l'établissement dès la 6e demande.
  // Le plafond strict porte sur l'adresse visée (3 / 15 min, plus bas) ; celui
  // par IP ne sert qu'à contenir un envoi en masse.
  const ip = getClientIP(request);
  const tropDeDemandes = () =>
    NextResponse.json(
      { success: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  if (!rateLimit({ max: 30, windowSec: 900, key: `forgot-pwd:${ip}` }).allowed) {
    return tropDeDemandes();
  }

  const body = await request.json().catch((e) => { console.warn("[non-fatal]", e); return null; });
  const parsed = BodySchema.safeParse(body);

  // ISO-4 : pré-auth, pas de session — envelopper dans un contexte système.
  return withSystemContext("auth:forgot-password", async () => {
  if (!parsed.success) {
    auditFire({
      action: "auth:forgot-password",
      verdict: "DENIED",
      resource: "user",
      reason: "Email invalide",
      metadata: { email: body?.email },
    });
    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  }

  // Appliqué que le compte existe ou non : ne révèle rien sur l'adresse.
  if (!rateLimit({ max: 3, windowSec: 900, key: `forgot-pwd:email:${normaliserEmail(parsed.data.email)}` }).allowed) {
    return tropDeDemandes();
  }

  // ─── Vérification Turnstile (anti-bot) ─────────────────────────────────
  const turnstileResult = await verifyTurnstileToken(parsed.data.turnstileToken, ip);
  if (!turnstileResult.success) {
    auditFire({
      action: "auth:forgot-password",
      verdict: "DENIED",
      resource: "user",
      reason: "Échec Turnstile",
      metadata: { email: parsed.data.email, turnstileError: turnstileResult.error },
    });
    // L'échec du défi ne dit rien sur l'existence du compte : le signaler,
    // plutôt qu'un faux « email envoyé » qui laisse l'utilisateur attendre
    // un message qui ne partira jamais.
    return NextResponse.json(
      { success: false, error: "turnstile" },
      { status: 400 },
    );
  }

  const email = normaliserEmail(parsed.data.email);

  // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- pre-auth: no session yet
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, isActive: true },
    select: { id: true, email: true, name: true },
  });

  if (user) {
    const result = await genererTokenReset(email);
    if (result.success && result.token) {
      const resetLink = `${APP_URL}/reset-password?token=${result.token}`;
      const html = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
          <h2>Réinitialisation de votre mot de passe</h2>
          <p>Bonjour,</p>
          <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe :</p>
          <p><a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;">Réinitialiser mon mot de passe</a></p>
          <p style="color:#6b7280;font-size:13px;">Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
        </div>
      `;
      const envoi = await sendEmail([user.email], "Réinitialisation de votre mot de passe", html);
      // La réponse reste générique (anti-énumération) : cette trace est la
      // seule preuve visible d'un email qui n'est jamais parti.
      if (!envoi.success) {
        console.error("[forgot-password] email de réinitialisation NON envoyé:", envoi.error);
      }

      auditFire({
        userId: user.id,
        action: "auth:forgot-password",
        verdict: envoi.success ? "ALLOWED" : "DENIED",
        resource: "user",
        resourceId: user.id,
        reason: envoi.success ? "Lien de réinitialisation envoyé" : "Échec d'envoi du lien de réinitialisation",
        metadata: { email },
      });
    }
  } else {
    auditFire({
      action: "auth:forgot-password",
      verdict: "DENIED",
      resource: "user",
      reason: "Utilisateur introuvable ou inactif",
      metadata: { email },
    });
  }

  // Réponse générique identique que l'email existe ou non (sécurité)
  return NextResponse.json({ success: true }, { status: 200 });
  }); // fin withSystemContext
}
