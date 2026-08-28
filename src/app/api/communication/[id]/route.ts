import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { siteFilterForModel } from "@/lib/site-scope";
import { auditFire } from "@/lib/audit";

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

  const notifFilter = siteFilterForModel("notification", session.user);
  const notif = await prisma.notification.findFirst({
    where: { id, tenantId: session.user.tenantId, ...notifFilter },
  });
  if (!notif) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  if (action === "envoyer") {
    try {
      const result = await dispatchNotification(id, session.user.tenantId);
      const updated = await prisma.notification.findFirst({ where: { id, tenantId: session.user.tenantId, ...notifFilter } });
      return NextResponse.json({ notification: updated, envoi: result });
    } catch (e) {
      console.error("[Communication] Échec dispatch:", e);
      // eslint-disable-next-line ecolpro/require-tenant-id -- id déjà vérifié par findFirst ci-dessus (ligne 23-25)
      await prisma.notification.update({ where: { id }, data: { statut: "ECHEC" } });
      return NextResponse.json({ error: "Échec de l'envoi" }, { status: 500 });
    }
  }

  if (action === "annuler") {
    auditFire({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "notification:cancel",
      verdict: "ALLOWED",
      resource: "notification",
      resourceId: id,
    });
    // eslint-disable-next-line ecolpro/require-tenant-id -- id déjà vérifié par findFirst ci-dessus (ligne 23-25)
    await prisma.notification.delete({ where: { id } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Action invalide" }, { status: 400 });
}
