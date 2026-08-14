/**
 * Gestion des échéanciers de paiement.
 *
 * Permet de découper une facture en plusieurs échéances avec dates
 * d'échéance et montants prédéfinis. Chaque échéance peut être rapprochée
 * d'un paiement pour suivre l'avancement du plan.
 */

import prisma from "@/lib/prisma";
import type { EcheancePaiement, Echeancier } from "@prisma/client";

export type StatutEcheance = "EN_ATTENTE" | "PAYEE" | "EN_RETARD" | "ANNULEE";

/**
 * Crée un échéancier pour une facture en répartissant le montant
 * en N échéances à intervalle régulier.
 *
 * @param factureId ID de la facture
 * @param nbEcheances Nombre d'échéances (ex: 3, 6, 10)
 * @param datePremiereEcheance Date de la première échéance
 * @param intervalleJours Intervalle en jours entre deux échéances
 * @param montants Montants optionnels par échéance. Si non fourni,
 *                 le montant est réparti uniformément.
 */
export async function creerEcheancier(
  factureId: string,
  nbEcheances: number,
  datePremiereEcheance: Date,
  intervalleJours: number = 30,
  montants?: number[]
): Promise<Echeancier> {
  const facture = await prisma.facture.findUniqueOrThrow({
    where: { id: factureId },
  });

  if (nbEcheances < 1) {
    throw new Error("Le nombre d'échéances doit être d'au moins 1");
  }

  // Calculer les montants
  const montantTotal = facture.montant;
  const montantParEcheance = montantTotal / nbEcheances;

  // Valider que la somme des montants correspond au montant de la facture
  let montantsFinaux: number[];
  if (montants) {
    if (montants.length !== nbEcheances) {
      throw new Error(
        `Le nombre de montants (${montants.length}) ne correspond pas au nombre d'échéances (${nbEcheances})`
      );
    }
    const somme = montants.reduce((a, b) => a + b, 0);
    if (Math.abs(somme - montantTotal) > 0.01) {
      throw new Error(
        `La somme des montants (${somme}) ne correspond pas au montant de la facture (${montantTotal})`
      );
    }
    montantsFinaux = montants;
  } else {
    // Répartition uniforme avec ajustement sur la dernière pour éviter
    // les erreurs d'arrondi
    montantsFinaux = Array(nbEcheances).fill(montantParEcheance);
    const sommeCalculee = montantParEcheance * nbEcheances;
    const ajustement = montantTotal - sommeCalculee;
    montantsFinaux[nbEcheances - 1] = montantParEcheance + ajustement;
  }

  return prisma.$transaction(async (tx) => {
    // Créer l'échéancier
    const echeancier = await tx.echeancier.create({
      data: {
        factureId,
        nbEcheances,
        intervalleJours,
        datePremiereEcheance,
        statut: "ACTIF",
      },
    });

    // Créer les échéances
    const echeances: Omit<EcheancePaiement, "id" | "createdAt" | "updatedAt">[] =
      [];
    for (let i = 0; i < nbEcheances; i++) {
      const dateEcheance = new Date(datePremiereEcheance);
      dateEcheance.setDate(dateEcheance.getDate() + i * intervalleJours);

      echeances.push({
        echeancierId: echeancier.id,
        factureId,
        numero: i + 1,
        montant: montantsFinaux[i],
        devise: facture.devise,
        dateEcheance,
        statut: "EN_ATTENTE",
        paiementId: null,
        payeeLe: null,
      });
    }

    await tx.echeancePaiement.createMany({ data: echeances });

    return echeancier;
  });
}

/**
 * Marque une échéance comme payée et la relie à un paiement.
 * Si toutes les échéances de l'échéancier sont payées, marque l'échéancier
 * comme COMPLETED.
 */
export async function marquerEcheancePayee(
  echeanceId: string,
  paiementId: string
): Promise<EcheancePaiement> {
  return prisma.$transaction(async (tx) => {
    const echeance = await tx.echeancePaiement.update({
      where: { id: echeanceId },
      data: {
        statut: "PAYEE",
        paiementId,
        payeeLe: new Date(),
      },
    });

    // Vérifier si toutes les échéances sont payées
    const restantes = await tx.echeancePaiement.count({
      where: {
        echeancierId: echeance.echeancierId,
        statut: { in: ["EN_ATTENTE", "EN_RETARD"] },
      },
    });

    if (restantes === 0) {
      await tx.echeancier.update({
        where: { id: echeance.echeancierId },
        data: { statut: "COMPLETE" },
      });
    }

    return echeance;
  });
}

/**
 * Marque les échéances en retard : toutes les échéances EN_ATTENTE
 * dont la date d'échéance est dépassée passent à EN_RETARD.
 * À appeler via un cron ou au chargement de la page facturation.
 */
export async function actualiserRetardsEcheanciers(tenantId: string): Promise<number> {
  const result = await prisma.echeancePaiement.updateMany({
    where: {
      statut: "EN_ATTENTE",
      dateEcheance: { lt: new Date() },
      facture: { tenantId },
    },
    data: { statut: "EN_RETARD" },
  });

  return result.count;
}

/**
 * Récupère l'échéancier d'une facture avec toutes ses échéances.
 */
export async function getEcheancierPourFacture(factureId: string) {
  const echeancier = await prisma.echeancier.findFirst({
    where: { factureId },
    include: {
      echeances: {
        orderBy: { numero: "asc" },
        include: { paiement: true },
      },
    },
  });

  return echeancier;
}

/**
 * Récupère toutes les échéances en retard pour un tenant.
 */
export async function getEcheancesEnRetard(tenantId: string) {
  return prisma.echeancePaiement.findMany({
    where: {
      statut: "EN_RETARD",
      facture: { tenantId },
    },
    include: {
      facture: {
        select: {
          id: true,
          numero: true,
          libelle: true,
          eleve: {
            select: { id: true, nom: true, prenom: true },
          },
        },
      },
    },
    orderBy: { dateEcheance: "asc" },
  });
}

/**
 * Annule un échéancier et toutes ses échéances non payées.
 * Les échéances déjà payées restent intactes.
 */
export async function annulerEcheancier(echeancierId: string): Promise<Echeancier> {
  return prisma.$transaction(async (tx) => {
    await tx.echeancePaiement.updateMany({
      where: {
        echeancierId,
        statut: { in: ["EN_ATTENTE", "EN_RETARD"] },
      },
      data: { statut: "ANNULEE" },
    });

    return tx.echeancier.update({
      where: { id: echeancierId },
      data: { statut: "ANNULE" },
    });
  });
}
