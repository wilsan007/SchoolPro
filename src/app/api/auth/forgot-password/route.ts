import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { normaliserEmail } from "@/lib/email";
import { auditFire } from "@/lib/audit";
import { genererTokenReset } from "@/lib/password-reset";
import { sendEmail } from "@/lib/notifications/email";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";
import { verifyTurnstileToken } from "@/lib/security/turnstile";

const BodySchema = z.object({
  email: z.string().trim().email(),
  turnstileToken: z.string().optional(),
});

const APP_URL = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

export async function POST(request: NextRequest) {
  // ─── Rate limiting : 5 requêtes / 15 min / IP ──────────────────────────
  const ip = getClientIP(request);
  const rl = rateLimit({ max: 5, windowSec: 900, key: `forgot-pwd:${ip}` });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: true }, // Réponse générique pour ne pas révéler le rate limit
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);

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
    return NextResponse.json(
      { success: true }, // Réponse générique
      { status: 200 },
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
      await sendEmail([user.email], "Réinitialisation de votre mot de passe", html);

      auditFire({
        userId: user.id,
        action: "auth:forgot-password",
        verdict: "ALLOWED",
        resource: "user",
        resourceId: user.id,
        reason: "Lien de réinitialisation envoyé",
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
}
