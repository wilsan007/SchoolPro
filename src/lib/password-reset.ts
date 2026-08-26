import crypto from "crypto";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { normaliserEmail } from "@/lib/email";
import { auditFire } from "@/lib/audit";

const EXPIRATION_MS = 60 * 60 * 1000; // 1 heure

export async function genererTokenReset(
  email: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  const normalized = normaliserEmail(email);

  try {
    await prisma.verificationToken.deleteMany({
      where: { identifier: normalized },
    });

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + EXPIRATION_MS);

    await prisma.verificationToken.create({
      data: { identifier: normalized, token, expires },
    });

    return { success: true, token };
  } catch (err) {
    console.error("[password-reset] genererTokenReset:", err);
    return { success: false, error: "Erreur serveur" };
  }
}

export async function verifierTokenReset(
  token: string
): Promise<{ valid: boolean; email?: string; error?: string }> {
  try {
    const record = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!record) return { valid: false, error: "Token invalide" };
    if (record.expires < new Date()) {
      await prisma.verificationToken.delete({ where: { token } });
      return { valid: false, error: "Token expiré" };
    }

    return { valid: true, email: record.identifier };
  } catch (err) {
    console.error("[password-reset] verifierTokenReset:", err);
    return { valid: false, error: "Erreur serveur" };
  }
}

export async function reinitialiserMotDePasse(
  token: string,
  nouveauPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const verification = await verifierTokenReset(token);
    if (!verification.valid || !verification.email) {
      return { success: false, error: verification.error };
    }

    // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- password reset, hors session
    const user = await prisma.user.findFirst({
      where: { email: { equals: verification.email, mode: "insensitive" } },
      select: { id: true, email: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return { success: false, error: "Compte introuvable ou désactivé" };
    }

    const hashedPassword = await bcrypt.hash(nouveauPassword, 10);

    /* eslint-disable ecolpro/require-tenant-id -- password reset, user already verified above */
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, mustChangePassword: false },
      }),
      prisma.verificationToken.delete({ where: { token } }),
    ]);
    /* eslint-enable ecolpro/require-tenant-id */

    auditFire({
      userId: user.id,
      action: "auth:password-reset",
      verdict: "ALLOWED",
      resource: "user",
      resourceId: user.id,
      reason: "Réinitialisation du mot de passe via token",
      metadata: { email: user.email },
    });

    return { success: true };
  } catch (err) {
    console.error("[password-reset] reinitialiserMotDePasse:", err);
    return { success: false, error: "Erreur serveur" };
  }
}
