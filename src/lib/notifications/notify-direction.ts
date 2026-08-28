/**
 * EcolPro — Helper de notification à la direction
 * ============================================================
 * Envoie une notification IN_APP best-effort aux membres de la
 * direction (TENANT_ADMIN + PRINCIPAL) d'un tenant.
 *
 * « Best-effort » : aucune erreur n'est remontée à l'appelant.
 * Si la notification échoue (DB indisponible, etc.), le flux
 * métier continue normalement — on loggue simplement l'erreur.
 */

import prisma from "@/lib/prisma";

interface NotifyDirectionParams {
  tenantId: string;
  siteId?: string | null;
  titre: string;
  contenu: string;
  envoyeParId?: string | null;
}

/**
 * Notifie la direction (TENANT_ADMIN + PRINCIPAL) via une
 * notification IN_APP. Ne jette jamais — échoue silencieusement.
 */
export async function notifyDirection({
  tenantId,
  siteId,
  titre,
  contenu,
  envoyeParId,
}: NotifyDirectionParams): Promise<void> {
  try {
    // Résoudre les userIds de la direction pour les compteurs
    // eslint-disable-next-line ecolpro/require-site-filter -- notification dispatch, tenant-wide direction resolution
    const direction = await prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        role: { in: ["TENANT_ADMIN", "PRINCIPAL"] },
      },
      select: { id: true },
    });

    await prisma.notification.create({
      data: {
        tenantId,
        siteId: siteId ?? null,
        titre,
        contenu,
        canal: "IN_APP",
        cible: "DIRECTION",
        statut: "ENVOYEE",
        envoyeParId: envoyeParId ?? null,
        nbDestinataires: direction.length,
        nbDelivres: direction.length,
        envoyeeAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[notifyDirection] Échec non-bloquant:", error);
  }
}
