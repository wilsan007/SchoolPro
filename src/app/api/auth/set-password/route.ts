import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { auditFire } from "@/lib/audit";
import { erreurJson } from "@/lib/erreurs-api";
import { validerMotDePasse } from "@/lib/password-validation";

const BodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return erreurJson("NON_AUTORISE");

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES");
  }

  const { currentPassword, newPassword } = parsed.data;

  // Vérifier la complexité du nouveau mot de passe
  const erreursComplexite = validerMotDePasse(newPassword);
  if (erreursComplexite) {
    return NextResponse.json(
      { success: false, error: "weak_password", codes: erreursComplexite },
      { status: 400 }
    );
  }

  // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- own user record
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, password: true, email: true },
  });

  if (!user?.password) {
    return erreurJson("UTILISATEUR_INTROUVABLE");
  }

  const passwordMatch = await bcrypt.compare(currentPassword, user.password);
  if (!passwordMatch) {
    auditFire({
      userId: user.id,
      action: "auth:set-password",
      verdict: "DENIED",
      resource: "user",
      resourceId: user.id,
      reason: "Mot de passe actuel incorrect",
    });
    return NextResponse.json(
      { success: false, error: "wrong_current_password" },
      { status: 400 }
    );
  }

  // Vérifier que le nouveau mot de passe est différent de l'ancien
  const sameAsOld = await bcrypt.compare(newPassword, user.password);
  if (sameAsOld) {
    return NextResponse.json(
      { success: false, error: "same_as_old" },
      { status: 400 }
    );
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // eslint-disable-next-line ecolpro/require-tenant-id -- own user record, verified above
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword, mustChangePassword: false },
  });

  auditFire({
    userId: user.id,
    action: "auth:set-password",
    verdict: "ALLOWED",
    resource: "user",
    resourceId: user.id,
    reason: "Mot de passe défini par l'utilisateur",
    metadata: { email: user.email },
  });

  return NextResponse.json({ success: true }, { status: 200 });
}
