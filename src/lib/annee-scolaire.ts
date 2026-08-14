/**
 * EcolPro — Source unique de vérité pour l'année scolaire courante.
 * ============================================================
 * Remplace les lectures directes de `Tenant.currentYear` qui
 * peuvent être désynchronisées de la table `annees_scolaires`.
 *
 * @deprecated Tenant.currentYear — utiliser getAnneeCourante() à la place.
 *
 * Gestion du cycle de vie d'une année scolaire :
 *   OUVERTE → CLOTUREE → ARCHIVEE
 *
 * Règles :
 *   — Une seule année OUVERTE par tenant à la fois (isCurrent).
 *   — Clôturer une année clôture aussi toutes ses périodes ouvertes.
 *   — Archiver exige que l'année soit d'abord clôturée.
 *   — L'année courante (isCurrent) ne peut pas être archivée directement :
 *     il faut d'abord basculer isCurrent sur une autre année.
 */

import prisma from "@/lib/prisma";
import type { AnneesScolaires } from "@prisma/client";

export type StatutAnnee = "OUVERTE" | "CLOTUREE" | "ARCHIVEE";

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

// ============================================================
// CYCLE DE VIE : OUVERTE → CLOTUREE → ARCHIVEE
// ============================================================

/** Vérifie qu'une année peut être clôturée. */
export function peutCloturer(annee: Pick<AnneesScolaires, "statut">): boolean {
  return annee.statut === "OUVERTE";
}

/** Vérifie qu'une année peut être archivée. */
export function peutArchiver(
  annee: Pick<AnneesScolaires, "statut" | "isCurrent">
): boolean {
  return annee.statut === "CLOTUREE" && !annee.isCurrent;
}

/** Vérifie qu'une année clôturée peut être réouverte. */
export function peutReouvrir(annee: Pick<AnneesScolaires, "statut">): boolean {
  return annee.statut === "CLOTUREE";
}

/**
 * Clôture une année scolaire : passe son statut à CLOTUREE, clôture toutes
 * ses périodes encore ouvertes, et enregistre la date et l'auteur.
 */
export async function cloturerAnnee(
  anneeId: string,
  userId: string
): Promise<AnneesScolaires> {
  return prisma.$transaction(async (tx) => {
    const annee = await tx.anneesScolaires.findUniqueOrThrow({
      where: { id: anneeId },
    });

    if (!peutCloturer(annee)) {
      throw new Error(
        `L'année ne peut pas être clôturée (statut actuel: ${annee.statut})`
      );
    }

    // Clôturer toutes les périodes encore ouvertes
    await tx.periode.updateMany({
      where: { anneeId, statut: "OUVERTE" },
      data: { statut: "CLOTUREE", cloturedAt: new Date() },
    });

    return tx.anneesScolaires.update({
      where: { id: anneeId },
      data: {
        statut: "CLOTUREE",
        cloturedAt: new Date(),
        cloturePar: userId,
      },
    });
  });
}

/**
 * Réouvre une année clôturée : repasse à OUVERTE et rouvre les périodes
 * qui étaient clôturées en même temps que l'année.
 */
export async function reouvrirAnnee(
  anneeId: string,
  _userId: string
): Promise<AnneesScolaires> {
  return prisma.$transaction(async (tx) => {
    const annee = await tx.anneesScolaires.findUniqueOrThrow({
      where: { id: anneeId },
    });

    if (!peutReouvrir(annee)) {
      throw new Error(
        `L'année ne peut pas être réouverte (statut actuel: ${annee.statut})`
      );
    }

    // Rouvrir les périodes clôturées en même temps que l'année
    if (annee.cloturedAt) {
      await tx.periode.updateMany({
        where: {
          anneeId,
          statut: "CLOTUREE",
          cloturedAt: annee.cloturedAt,
        },
        data: { statut: "OUVERTE", cloturedAt: null },
      });
    }

    return tx.anneesScolaires.update({
      where: { id: anneeId },
      data: {
        statut: "OUVERTE",
        cloturedAt: null,
        cloturePar: null,
      },
    });
  });
}

/**
 * Archive une année clôturée : point de non-retour. L'année doit être
 * CLOTUREE et ne pas être l'année courante (isCurrent = false).
 */
export async function archiverAnnee(
  anneeId: string,
  userId: string
): Promise<AnneesScolaires> {
  return prisma.$transaction(async (tx) => {
    const annee = await tx.anneesScolaires.findUniqueOrThrow({
      where: { id: anneeId },
    });

    if (!peutArchiver(annee)) {
      const raison = annee.isCurrent
        ? "L'année courante ne peut pas être archivée. Basculez isCurrent sur une autre année d'abord."
        : `L'année doit être clôturée avant archivage (statut actuel: ${annee.statut})`;
      throw new Error(raison);
    }

    return tx.anneesScolaires.update({
      where: { id: anneeId },
      data: {
        statut: "ARCHIVEE",
        archiveeAt: new Date(),
        archiveePar: userId,
      },
    });
  });
}

/**
 * Définit une année comme année courante.
 * Désactive isCurrent sur toutes les autres années du tenant.
 */
export async function definirAnneeCourante(
  anneeId: string,
  tenantId: string
): Promise<AnneesScolaires> {
  return prisma.$transaction(async (tx) => {
    await tx.anneesScolaires.updateMany({
      where: { tenantId, isCurrent: true },
      data: { isCurrent: false },
    });

    return tx.anneesScolaires.update({
      where: { id: anneeId },
      data: { isCurrent: true, statut: "OUVERTE" },
    });
  });
}

/**
 * Liste les années d'un tenant avec un résumé : nombre de périodes,
 * nombre d'événements, statut.
 */
export async function listerAnneesAvecResume(tenantId: string) {
  const annees = await prisma.anneesScolaires.findMany({
    where: { tenantId },
    include: {
      _count: {
        select: {
          periodes: true,
          evenements: true,
          learnosPlanifications: true,
        },
      },
    },
    orderBy: { dateDebut: "desc" },
  });

  return annees;
}
