import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateFullExportZip } from "@/lib/sync-export";

/**
 * GET /api/sync/export-all
 *
 * Endpoint d'export complet des données d'un tenant.
 * Authentification par API key (liée au SyncConfig du tenant).
 *
 * Utilisé par :
 *   - L'agent local (synchronisation automatique toutes les 30min/1h)
 *   - Le bouton "Télécharger sauvegarde complète" dans Paramètres
 *     (dans ce cas, l'auth se fait via session + apiKey interne)
 *
 * Query params:
 *   - apiKey: clé API du SyncConfig (obligatoire pour l'agent local)
 *   - Si pas d'apiKey, vérifie la session NextAuth (pour l'UI)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = searchParams.get("apiKey");

    let tenantId: string | null = null;

    if (apiKey) {
      // Auth par API key (agent local)
      // eslint-disable-next-line ecolpro/require-tenant-id -- authentification par apiKey : le tenantId est obtenu depuis cette lookup, il ne peut pas être vérifié avant
      const syncConfig = await prisma.syncConfig.findUnique({
        where: { apiKey },
        select: {
          tenantId: true,
          syncEnabled: true,
          includeBulletins: true,
          includeNotes: true,
          includeEmploiTemps: true,
          includeExamens: true,
          includePersonnel: true,
          includeComptabilite: true,
          includeAbsences: true,
          includeParametres: true,
        },
      });

      if (!syncConfig) {
        return NextResponse.json(
          { error: "Clé API invalide" },
          { status: 401 }
        );
      }

      if (!syncConfig.syncEnabled) {
        return NextResponse.json(
          { error: "Synchronisation désactivée pour cet établissement" },
          { status: 403 }
        );
      }

      tenantId = syncConfig.tenantId;

      // Auth par API key : accès complet au tenant (agent local de sync).
      // On construit des revendications tenant-wide pour le filtrage par site.
      const claims = { role: "TENANT_ADMIN" as const, siteId: null, siteIds: null, tenantHasSites: undefined };

      // Générer l'export avec les options de la config
      const result = await generateFullExportZip(tenantId, claims, {
        includeBulletins: syncConfig.includeBulletins,
        includeNotes: syncConfig.includeNotes,
        includeEmploiTemps: syncConfig.includeEmploiTemps,
        includeExamens: syncConfig.includeExamens,
        includePersonnel: syncConfig.includePersonnel,
        includeComptabilite: syncConfig.includeComptabilite,
        includeAbsences: syncConfig.includeAbsences,
        includeParametres: syncConfig.includeParametres,
      });

      // Mettre à jour le statut de synchronisation
      await prisma.syncConfig.update({
        where: { tenantId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: "SUCCESS",
          lastSyncError: null,
        },
      });

      return new NextResponse(new Uint8Array(result.buffer), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${result.filename}"`,
          "X-Export-File-Count": String(result.fileCount),
          "X-Export-Total-Rows": String(result.totalRows),
        },
      });
    } else {
      // Auth par session (UI bouton manuel)
      const { auth } = await import("@/lib/auth");
      const session = await auth();

      if (!session?.user?.tenantId) {
        return NextResponse.json(
          { error: "Non autorisé" },
          { status: 401 }
        );
      }

      // Vérifier les permissions (TENANT_ADMIN ou SUPER_ADMIN)
      if (
        session.user.role !== "TENANT_ADMIN" &&
        session.user.role !== "SUPER_ADMIN"
      ) {
        return NextResponse.json(
          { error: "Permissions insuffisantes" },
          { status: 403 }
        );
      }

      tenantId = session.user.tenantId;

      // Export complet avec toutes les options activées
      const result = await generateFullExportZip(tenantId, session.user);

      // Si une config sync existe, mettre à jour le statut
      await prisma.syncConfig.updateMany({
        where: { tenantId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: "SUCCESS",
          lastSyncError: null,
        },
      });

      return new NextResponse(new Uint8Array(result.buffer), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${result.filename}"`,
          "X-Export-File-Count": String(result.fileCount),
          "X-Export-Total-Rows": String(result.totalRows),
        },
      });
    }
  } catch (error) {
    console.error("[sync/export-all] Erreur:", error);

    // Mettre à jour le statut d'erreur si on a un apiKey
    try {
      const { searchParams } = new URL(request.url);
      const apiKey = searchParams.get("apiKey");
      if (apiKey) {
        // eslint-disable-next-line ecolpro/require-tenant-id
        const config = await prisma.syncConfig.findFirst({
          where: { apiKey },
          select: { id: true, tenantId: true },
        });
        if (config) {
          // eslint-disable-next-line ecolpro/require-tenant-id
          await prisma.syncConfig.update({
            where: { id: config.id },
            data: {
              lastSyncAt: new Date(),
              lastSyncStatus: "FAILED",
              lastSyncError: error instanceof Error ? error.message : "Erreur inconnue",
            },
          });
        }
      }
    } catch {
      // Ignore les erreurs de mise à jour de statut
    }

    return NextResponse.json(
      { error: "Erreur lors de la génération de l'export" },
      { status: 500 }
    );
  }
}
