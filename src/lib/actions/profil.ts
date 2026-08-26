"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { validerMotDePasse } from "@/lib/password-validation";

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "PASSWORD_CURRENT_REQUIRED"),
  newPassword: z.string().min(1, "PASSWORD_NEW_REQUIRED"),
  confirmPassword: z.string().min(1, "PASSWORD_CONFIRM_REQUIRED"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "PASSWORD_DONT_MATCH",
  path: ["confirmPassword"],
});

/**
 * Change le mot de passe de l'utilisateur connecté.
 *
 * - Vérifie l'ancien mot de passe avec bcrypt
 * - Valide la complexité du nouveau (8+ caractères, majuscule, minuscule,
 *   chiffre, caractère spécial) via `validerMotDePasse`
 * - Hash le nouveau mot de passe
 * - Met mustChangePassword = false (l'utilisateur a changé)
 * - Log l'action dans l'audit
 *
 * @throws Error avec un code stable (ex. `PASSWORD_TOO_SHORT`) que le client
 *         traduit via `common.password.*` ou `erreurs-api`.
 */
export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("NON_AUTORISE");
  }

  const parsed = ChangePasswordSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { currentPassword, newPassword } = parsed.data;

  // Vérifier la complexité du nouveau mot de passe
  const erreursComplexite = validerMotDePasse(newPassword);
  if (erreursComplexite) {
    throw new Error(erreursComplexite.join(","));
  }

  // Récupérer le mot de passe actuel hashé
  // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  });

  if (!user || !user.password) {
    throw new Error("UTILISATEUR_INTROUVABLE");
  }

  const passwordMatch = await bcrypt.compare(currentPassword, user.password);
  if (!passwordMatch) {
    throw new Error("WRONG_CURRENT_PASSWORD");
  }

  // Vérifier que le nouveau mot de passe est différent de l'ancien
  const sameAsOld = await bcrypt.compare(newPassword, user.password);
  if (sameAsOld) {
    throw new Error("PASSWORD_SAME_AS_OLD");
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
