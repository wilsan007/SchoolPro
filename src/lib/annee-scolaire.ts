/**
 * EcolPro — Source unique de vérité pour l'année scolaire courante.
 * ============================================================
 * Remplace les lectures directes de `Tenant.currentYear` qui
 * peuvent être désynchronisées de la table `annees_scolaires`.
 *
 * @deprecated Tenant.currentYear — utiliser getAnneeCourante() à la place.
 */

import prisma from "@/lib/prisma";

/**
 * Retourne l'année scolaire courante pour un tenant donné.
 * Lit la table `annees_scolaires` (isCurrent = true) en priorité.
 * Si aucune année n'est marquée comme courante, retourne null
 * plutôt que de fallback sur une valeur hardcodée.
 */
export async function getAnneeCourante(tenantId: string) {
  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId, isCurrent: true },
  });

  if (annee) return annee;

  // Fallback: dernière année par date de fin (au cas où isCurrent n'est pas set)
  const latest = await prisma.anneesScolaires.findFirst({
    where: { tenantId },
    orderBy: { dateFin: "desc" },
  });

  return latest ?? null;
}

/**
 * Retourne le libellé de l'année courante (ex: "2025-2026").
 * Pratique pour les requêtes qui filtrent par `annee` string.
 */
export async function getAnneeCouranteLibelle(tenantId: string): Promise<string | null> {
  const annee = await getAnneeCourante(tenantId);
  return annee?.libelle ?? null;
}

/**
 * Active une année scolaire pour un tenant et désactive les autres.
 * Garantit qu'une seule année est active à la fois.
 */
export async function setAnneeCourante(tenantId: string, anneeId: string) {
  // Vérifier que l'année appartient bien au tenant
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId },
  });
  if (!annee) throw new Error("Année scolaire introuvable pour ce tenant");

  // Transaction : désactiver toutes les autres, activer celle-ci
  await prisma.$transaction([
    prisma.anneesScolaires.updateMany({
      where: { tenantId, isCurrent: true },
      data: { isCurrent: false },
    }),
    prisma.anneesScolaires.update({
      where: { id: anneeId },
      data: { isCurrent: true },
    }),
  ]);
}
