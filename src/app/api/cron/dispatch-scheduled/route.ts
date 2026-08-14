import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * Cron — Envoi des notifications planifiées arrivées à échéance.
 * ============================================================
 * À appeler par un ordonnanceur (Vercel Cron, GitHub Actions, cron-job.org…).
 * Protégé par CRON_SECRET : `Authorization: Bearer <CRON_SECRET>`.
 * Vercel Cron envoie automatiquement ce header si CRON_SECRET est défini.
 *
 * Planifié toutes les 5 min via vercel.json.
 */
async function handler(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization");

  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const now = new Date();

  // Verrou léger : on passe les notifications dues en EN_ENVOI d'abord,
  // pour éviter qu'un second tick ne les reprenne en parallèle.
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- cron cross-tenant : traite toutes les notifications dues, protégé par CRON_SECRET, pas de session utilisateur
  const due = await prisma.notification.findMany({
    where: { statut: "PLANIFIEE", planifieeAt: { lte: now } },
    select: { id: true, tenantId: true },
    take: 100,
  });

  if (due.length === 0) {
    return NextResponse.json({ processed: 0, results: [] });
  }

  // eslint-disable-next-line ecolpro/require-tenant-id -- cron cross-tenant : ids proviennent de la requête ci-dessus
  await prisma.notification.updateMany({
    where: { id: { in: due.map((d) => d.id) } },
    data: { statut: "EN_ENVOI" },
  });

  const results = [];
  for (const n of due) {
    try {
      const r = await dispatchNotification(n.id, n.tenantId);
      results.push({ id: n.id, ...r });
    } catch (e) {
      console.error(`[Cron] Échec dispatch ${n.id}:`, e);
      // eslint-disable-next-line ecolpro/require-tenant-id -- id provient de la requête ci-dessus, tenantId déjà passé à dispatchNotification
      await prisma.notification.update({
        where: { id: n.id },
        data: { statut: "ECHEC" },
      });
      results.push({ id: n.id, success: false });
    }
  }

  return NextResponse.json({ processed: due.length, results });
}

export const GET = handler;
export const POST = handler;
