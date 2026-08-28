import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * Cron endpoint: Purge old audit logs beyond retention period.
 *
 * Protect with CRON_SECRET env var. Call daily via Vercel/Netlify cron.
 *
 * GET /api/cron/purge-audit-logs
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * Retention: AUDIT_LOG_RETENTION_DAYS env var (default: 365 days).
 * Deletes in batches of 1000 to avoid long-running transactions.
 */

const BATCH_SIZE = 1000;
const DEFAULT_RETENTION_DAYS = 365;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const retentionDays = parseInt(
    process.env.AUDIT_LOG_RETENTION_DAYS ?? String(DEFAULT_RETENTION_DAYS),
    10
  );
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  let totalDeleted = 0;
  let batchDeleted: number;

  do {
    // Tâche système authentifiée par CRON_SECRET : purge globale
    // indépendante du tenant, par conception.
    // eslint-disable-next-line ecolpro/require-tenant-id
    const idsToDelete = await prisma.auditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH_SIZE,
    });

    if (idsToDelete.length === 0) {
      batchDeleted = 0;
      break;
    }

    // Purge système : tenantId non applicable car les ids proviennent de la
    // sélection précédente (déjà filtrées par date) et aucun autre tenant n'est
    // ciblé ici.
    // eslint-disable-next-line ecolpro/require-tenant-id
    const result = await prisma.auditLog.deleteMany({
      where: { id: { in: idsToDelete.map((r) => r.id) } },
    });
    batchDeleted = result.count;
    totalDeleted += batchDeleted;
  } while (batchDeleted === BATCH_SIZE);

  console.log(
    `[cron/purge-audit-logs] ${totalDeleted} entrées purgées (antérieures au ${cutoff.toISOString()})`
  );

  return NextResponse.json({
    success: true,
    purged: totalDeleted,
    cutoff: cutoff.toISOString(),
    retentionDays,
  });
}
