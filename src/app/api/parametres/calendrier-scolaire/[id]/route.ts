import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "eleves:write");
  if (denied) return denied;

  const { id } = await params;

  // Vérifier le périmètre : l'événement doit appartenir à une année du tenant.
  const evenement = await prisma.evenementCalendaire.findFirst({
    where: {
      id,
      annee: { tenantId: session.user.tenantId },
    },
    select: { id: true },
  });
  if (!evenement) return erreurJson("EVENEMENT_INTROUVABLE");

  await prisma.evenementCalendaire.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
