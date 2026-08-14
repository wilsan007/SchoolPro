/**
 * EcolPro / LEARNOS — Helpers du curriculum
 *
 * Ces fonctions vivent ici et non dans un fichier de route : Next.js n'autorise
 * que les méthodes HTTP comme exports d'une `route.ts`, et deux routes en ont
 * besoin (création et modification d'une compétence).
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import type { CodeErreur } from "@/lib/erreurs-api";

/**
 * Vérifie que chaque prérequis existe dans le tenant ET dans le périmètre de
 * l'appelant. Sans ce contrôle, `prerequisIds` permettrait de relier le
 * curriculum d'un autre site — une entrée utilisateur ne se vérifie pas
 * elle-même.
 */
export async function validerPrerequis(
  tenantId: string,
  claims: SessionSiteClaims,
  ids: string[] | undefined
): Promise<{ ids: string[] } | { erreur: CodeErreur }> {
  const demandes = [...new Set(ids ?? [])];
  if (demandes.length === 0) return { ids: [] };

  const trouvees = await prisma.competence.findMany({
    where: {
      id: { in: demandes },
      tenantId,
      ...siteFilterForModel("competence", claims),
    },
    select: { id: true },
  });

  if (trouvees.length !== demandes.length) {
    return { erreur: "PREREQUIS_HORS_PERIMETRE" };
  }
  return { ids: trouvees.map((c) => c.id) };
}
