import prisma from "@/lib/prisma";
import type { ModeleNiveaux } from "@prisma/client";

/**
 * Récupère le modèle de nommage des niveaux d'un tenant.
 *
 * @param tenantId ID du tenant
 * @returns Le modèle (ANNEES par défaut, ou FRANCAIS)
 */
export async function getModeleNiveaux(tenantId: string): Promise<ModeleNiveaux> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { modeleNiveaux: true },
  });
  return tenant?.modeleNiveaux ?? "ANNEES";
}
