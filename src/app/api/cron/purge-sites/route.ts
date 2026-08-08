import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * Cron endpoint: PURGE definitively deleted sites after their grace period.
 *
 * Protect with CRON_SECRET env var. Call daily via Vercel/Netlify cron.
 *
 * GET /api/cron/purge-sites
 * Header: Authorization: Bearer <CRON_SECRET>
 */

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const sitesToPurge = await prisma.site.findMany({
    where: {
      deletedAt: { not: null },
      scheduledPurgeAt: { lte: now },
    },
    select: {
      id: true,
      nom: true,
      tenantId: true,
      deletedBy: true,
      deletedReason: true,
    },
  });

  if (sitesToPurge.length === 0) {
    return NextResponse.json({ purged: 0, message: "No sites to purge" });
  }

  let purged = 0;
  const errors: string[] = [];

  for (const site of sitesToPurge) {
    try {
      await prisma.$transaction([
        prisma.siteDeletionLog.create({
          data: {
            tenantId: site.tenantId,
            siteId: site.id,
            siteNom: site.nom,
            action: "PURGE",
            reason: site.deletedReason,
            performedBy: site.deletedBy ?? "system",
            performedByName: "System (automated purge)",
            metadata: { purgedAt: now.toISOString() },
          },
        }),
        prisma.site.delete({ where: { id: site.id } }),
      ]);
      purged++;
    } catch (err) {
      errors.push(`Site "${site.nom}" (${site.id}): ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return NextResponse.json({
    purged,
    total: sitesToPurge.length,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: now.toISOString(),
  });
}
