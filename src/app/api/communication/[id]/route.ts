import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { dispatchNotification } from "@/lib/notifications/dispatch";

// PATCH — envoyer une notification en brouillon
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "communication:send");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const { action } = body; // "envoyer" | "annuler"

  const notif = await prisma.notification.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!notif) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  if (action === "envoyer") {
    try {
      const result = await dispatchNotification(id);
      const updated = await prisma.notification.findUnique({ where: { id } });
      return NextResponse.json({ notification: updated, envoi: result });
    } catch (e) {
      console.error("[Communication] Échec dispatch:", e);
      await prisma.notification.update({ where: { id }, data: { statut: "ECHEC" } });
      return NextResponse.json({ error: "Échec de l'envoi" }, { status: 500 });
    }
  }

  if (action === "annuler") {
    await prisma.notification.delete({ where: { id } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Action invalide" }, { status: 400 });
}
