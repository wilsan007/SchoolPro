/**
 * Cron: Purge définitive des sites supprimés après 90 jours.
 *
 * Ce script doit être exécuté quotidiennement (ex: via Vercel Cron, Netlify
 * Scheduled Functions, ou un cron Linux).
 *
 * Il:
 *   1. Trouve tous les sites dont `scheduledPurgeAt` est dépassé.
 *   2. Pour chaque site, supprime en cascade toutes les données liées.
 *   3. Crée une entrée "PURGE" dans SiteDeletionLog.
 *   4. Supprime l'enregistrement Site.
 *
 * Usage: npx tsx scripts/purge-deleted-sites.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function purgeDeletedSites() {
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
    console.log(`[purge-deleted-sites] No sites to purge at ${now.toISOString()}`);
    return;
  }

  console.log(`[purge-deleted-sites] Found ${sitesToPurge.length} site(s) to purge`);

  for (const site of sitesToPurge) {
    console.log(`[purge-deleted-sites] Purging site "${site.nom}" (${site.id}) — tenant ${site.tenantId}`);

    try {
      // Prisma's onDelete: Cascade on Site relations will handle most cleanup.
      // We just delete the site record itself.
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

      console.log(`[purge-deleted-sites] ✓ Purged site "${site.nom}" (${site.id})`);
    } catch (err) {
      console.error(`[purge-deleted-sites] ✗ Failed to purge site "${site.nom}" (${site.id}):`, err);
    }
  }

  console.log(`[purge-deleted-sites] Done. Purged ${sitesToPurge.length} site(s).`);
}

purgeDeletedSites()
  .catch((err) => {
    console.error("[purge-deleted-sites] Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
