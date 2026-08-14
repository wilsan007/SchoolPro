"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Le mot de passe actuel est requis"),
  newPassword: z.string().min(8, "Le nouveau mot de passe doit faire au moins 8 caractères"),
  confirmPassword: z.string().min(1, "La confirmation est requise"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

/**
 * Change le mot de passe de l'utilisateur connecté.
 *
 * - Vérifie l'ancien mot de passe avec bcrypt
 * - Hash le nouveau mot de passe
 * - Met mustChangePassword = false (l'utilisateur a changé)
 * - Log l'action dans l'audit
 */
export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Non autorisé");
  }

  const parsed = ChangePasswordSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { currentPassword, newPassword } = parsed.data;

  // Récupérer le mot de passe actuel hashé
  // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  });

  if (!user || !user.password) {
    throw new Error("Compte introuvable ou sans mot de passe");
  }

  const passwordMatch = await bcrypt.compare(currentPassword, user.password);
  if (!passwordMatch) {
    throw new Error("Le mot de passe actuel est incorrect");
  }

  // Vérifier que le nouveau mot de passe est différent de l'ancien
  const sameAsOld = await bcrypt.compare(newPassword, user.password);
  if (sameAsOld) {
    throw new Error("Le nouveau mot de passe doit être différent de l'ancien");
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, 10);

  // eslint-disable-next-line ecolpro/require-tenant-id -- self-update: session.user.id est l'utilisateur connecté lui-même
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      password: hashedNewPassword,
      mustChangePassword: false,
    },
  });

  // Audit log
  if (session.user.tenantId) {
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        action: "user.password.change",
        verdict: "ALLOWED",
        resource: "user",
        resourceId: session.user.id,
        reason: "Changement de mot de passe depuis le profil",
      },
    });
  }

  revalidatePath("/profil");
  return { success: true };
}
