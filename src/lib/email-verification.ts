import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { normaliserEmail } from "@/lib/email";
import { sendEmail, renderNotificationEmail } from "@/lib/notifications/email";
import { auditFire } from "@/lib/audit";

const EXPIRATION_MS = 24 * 60 * 60 * 1000;

const APP_URL =
  process.env.NEXTAUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

export async function genererTokenVerification(email: string): Promise<string> {
  const identifier = normaliserEmail(email);
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  const token = randomUUID();
  const expires = new Date(Date.now() + EXPIRATION_MS);
  await prisma.verificationToken.create({
    data: { identifier, token, expires },
  });
  return token;
}

export async function verifierTokenVerification(
  token: string
): Promise<{ valid: boolean; email?: string }> {
  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });
  if (!record) return { valid: false };
  if (record.expires < new Date()) return { valid: false };
  return { valid: true, email: record.identifier };
}

export async function confirmerEmail(
  token: string
): Promise<{ success: boolean; error?: string }> {
  const { valid, email } = await verifierTokenVerification(token);
  if (!valid || !email) {
    return { success: false, error: "token_invalide" };
  }

  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- vérification d'email, hors session
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, tenantId: true },
  });
  if (!user) return { success: false, error: "utilisateur_introuvable" };

  // eslint-disable-next-line ecolpro/require-tenant-id -- email verification, user already looked up above
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: new Date() },
  });
  await prisma.verificationToken.delete({ where: { token } });

  auditFire({
    userId: user.id,
    tenantId: user.tenantId,
    action: "auth:verify-email",
    verdict: "ALLOWED",
    resource: "user",
    resourceId: user.id,
    reason: "Email vérifié",
  });

  return { success: true };
}

export async function envoyerEmailVerification(
  email: string,
  ecoleNom?: string
): Promise<void> {
  const normalized = normaliserEmail(email);
  const token = await genererTokenVerification(normalized);
  const lien = `${APP_URL}/verify-email?token=${token}`;
  const nom = ecoleNom ?? "EcolPro";
  const html = renderNotificationEmail(
    nom,
    "Vérification de votre adresse email",
    `Cliquez sur le lien suivant pour vérifier votre adresse email :\n\n${lien}\n\nCe lien expire dans 24 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`
  );
  await sendEmail([normalized], "Vérification de votre adresse email", html);
}
