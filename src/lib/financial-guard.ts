import prisma from "@/lib/prisma";
import type { Session } from "next-auth";
import { siteFilterForModel, mergeFilters, type SessionSiteClaims } from "@/lib/site-scope";

export interface SituationFinanciere {
  totalFacture: number;
  totalPaye: number;
  totalRestant: number;
  nbFacturesEnRetard: number;
  nbRelances: number;
  estExclu: boolean;
  exclusionId: string | null;
  exclusionMotif: string | null;
  exclusionDateDebut: Date | null;
  factures: {
    id: string;
    numero: string;
    libelle: string;
    montant: number;
    paye: number;
    restant: number;
    statut: string;
    echeance: Date | null;
    nbRelances: number;
  }[];
}

/**
 * Récupère la situation financière complète d'un élève.
 * Calcule le solde, les retards, les relances et l'exclusion en cours.
 */
export async function getSituationFinanciere(
  eleveId: string,
  tenantId: string,
  claims: SessionSiteClaims
): Promise<SituationFinanciere> {
  const factures = await prisma.facture.findMany({
    where: mergeFilters(
      { eleveId, tenantId, statut: { not: "ANNULEE" } },
      siteFilterForModel("facture", claims)
    ),
    include: {
      paiements: { where: siteFilterForModel("paiement", claims) },
      relances: { where: siteFilterForModel("relance", claims), select: { id: true, niveau: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Une exclusion est rattachée à l'élève (déjà filtré par site ci-dessus) ; l'exclusion
  // elle-même n'a pas de siteId propre, mais reste bornée au tenant.
  const exclusion = await prisma.exclusionEleve.findFirst({
    where: { eleveId, tenantId, dateFin: null },
    select: { id: true, motif: true, dateDebut: true },
  });

  let totalFacture = 0;
  let totalPaye = 0;
  let nbFacturesEnRetard = 0;
  let nbRelances = 0;

  const facturesDetail = factures.map((f) => {
    const paye = f.paiements.reduce((s, p) => s + p.montant, 0);
    const restant = f.montant - paye;
    totalFacture += f.montant;
    totalPaye += paye;
    if (f.statut === "EN_RETARD" || (f.echeance && new Date() > f.echeance && restant > 0)) {
      nbFacturesEnRetard++;
    }
    nbRelances += f.relances.length;
    return {
      id: f.id,
      numero: f.numero,
      libelle: f.libelle,
      montant: f.montant,
      paye,
      restant,
      statut: f.statut,
      echeance: f.echeance,
      nbRelances: f.relances.length,
    };
  });

  return {
    totalFacture,
    totalPaye,
    totalRestant: totalFacture - totalPaye,
    nbFacturesEnRetard,
    nbRelances,
    estExclu: !!exclusion,
    exclusionId: exclusion?.id ?? null,
    exclusionMotif: exclusion?.motif ?? null,
    exclusionDateDebut: exclusion?.dateDebut ?? null,
    factures: facturesDetail,
  };
}

/**
 * Vérifie si un élève a accès à la plateforme (non exclu).
 * Utilisé dans le middleware ou les pages élève/parent.
 */
export async function checkEleveAccess(eleveId: string, tenantId: string): Promise<{
  allowed: boolean;
  reason?: string;
  exclusion?: { id: string; motif: string; dateDebut: Date };
}> {
  const exclusion = await prisma.exclusionEleve.findFirst({
    where: { eleveId, tenantId, dateFin: null },
    select: { id: true, motif: true, dateDebut: true },
  });

  if (exclusion) {
    return {
      allowed: false,
      reason: "EXCLUDED",
      exclusion: { id: exclusion.id, motif: exclusion.motif, dateDebut: exclusion.dateDebut },
    };
  }

  return { allowed: true };
}

/**
 * Vérifie si un utilisateur (élève ou parent) doit être bloqué
 * pour non-paiement. À appeler lors du login ou sur les pages sensibles.
 *
 * Pour un parent :
 * - Si TOUS ses enfants sont exclus → blocage total (blocked: true)
 * - Si CERTAINS seulement sont exclus → blocage partiel (blocked: false, partialBlock: true, excludedEleveIds: [...])
 *   Le parent garde accès à la plateforme mais les données des enfants exclus sont masquées.
 */
export async function checkUserFinancialBlock(
  userId: string,
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{
  blocked: boolean;
  reason?: string;
  eleveIds?: string[];
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  partialBlock?: boolean;
  excludedEleveIds?: string[];
}> {
  // Cas 1: l'utilisateur est un élève
  const eleve = await prisma.eleve.findFirst({
    where: mergeFilters({ userId, tenantId }, siteFilterForModel("eleve", claims)),
    select: { id: true, statut: true },
  });

  if (eleve) {
    if (eleve.statut === "EXCLU") {
      const exclusion = await prisma.exclusionEleve.findFirst({
        where: { eleveId: eleve.id, tenantId, dateFin: null },
        select: { motif: true, dateDebut: true },
      });
      return {
        blocked: true,
        reason: "EXCLUDED",
        eleveIds: [eleve.id],
        messageKey: exclusion
          ? "financialBlock.studentExcludedWithDate"
          : "financialBlock.studentExcluded",
        messageParams: exclusion
          ? { date: new Date(exclusion.dateDebut).toLocaleDateString("fr-FR"), motif: exclusion.motif }
          : undefined,
      };
    }
    return { blocked: false };
  }

  // Cas 2: l'utilisateur est un parent
  const enfants = await prisma.eleveParent.findMany({
    where: mergeFilters({ parent: { userId, tenantId } }, siteFilterForModel("eleveParent", claims)),
    select: { eleveId: true },
  });

  if (enfants.length === 0) return { blocked: false };

  const eleveIds = enfants.map((e) => e.eleveId);
  const exclusions = await prisma.exclusionEleve.findMany({
    where: { eleveId: { in: eleveIds }, tenantId, dateFin: null },
    select: { eleveId: true, motif: true, dateDebut: true },
  });

  if (exclusions.length === 0) {
    return { blocked: false };
  }

  // Tous les enfants sont exclus → blocage total
  if (exclusions.length === eleveIds.length) {
    return {
      blocked: true,
      reason: "ALL_CHILDREN_EXCLUDED",
      eleveIds: exclusions.map((e) => e.eleveId),
      messageKey: "financialBlock.allChildrenExcluded",
    };
  }

  // Seulement certains enfants sont exclus → blocage partiel
  const excludedEleveIds = exclusions.map((e) => e.eleveId);
  return {
    blocked: false,
    partialBlock: true,
    excludedEleveIds,
    reason: "PARTIAL_EXCLUSION",
    messageKey: excludedEleveIds.length === 1
      ? "financialBlock.partialExclusionSingle"
      : "financialBlock.partialExclusionMultiple",
    messageParams: { count: excludedEleveIds.length },
  };
}
