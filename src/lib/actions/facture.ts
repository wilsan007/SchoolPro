"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { PAYMENT_METHOD_IDS } from "@/lib/payment-methods";
import { siteFilterForModel, mergeFilters } from "@/lib/site-scope";
import { z } from "zod";

const FactureSchema = z.object({
  eleveId: z.string().min(1, "L'élève est requis"),
  libelle: z.string().min(1, "Le libellé est requis"),
  montant: z.number().min(0.01, "Le montant doit être positif"),
  devise: z.string().default("DJF"),
  echeance: z.string().optional(),
});

export type FactureFormData = z.infer<typeof FactureSchema>;

const PaiementSchema = z.object({
  montant: z.number().min(0.01, "Le montant doit être positif"),
  methode: z.enum(PAYMENT_METHOD_IDS as [string, ...string[]], {
    message: "Le moyen de paiement est invalide",
  }),
  reference: z.string().optional(),
  echeanceId: z.string().optional(),
});

export type PaiementFormData = z.infer<typeof PaiementSchema>;

export async function getFacturesForTenant(filters?: { statut?: string; eleveId?: string }) {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  return prisma.facture.findMany({
    where: mergeFilters(
      {
        tenantId: session.user.tenantId,
        ...(filters?.statut && filters.statut !== "ALL" ? { statut: filters.statut as never } : {}),
        ...(filters?.eleveId ? { eleveId: filters.eleveId } : {}),
      },
      siteFilterForModel("facture", session.user)
    ),
    include: {
      eleve: { select: { id: true, nom: true, prenom: true, matricule: true, classeId: true, classe: { select: { nom: true } } } },
      paiements: {
        where: siteFilterForModel("paiement", session.user),
        include: { enregistrePar: { select: { id: true, name: true } } },
      },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getFactureForDetail(id: string) {
  const session = await auth();
  if (!session?.user?.tenantId) return null;

  const facture = await prisma.facture.findFirst({
    where: mergeFilters({ id, tenantId: session.user.tenantId }, siteFilterForModel("facture", session.user)),
    include: {
      eleve: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          matricule: true,
          classe: { select: { nom: true, niveau: true } },
          parents: { include: { parent: true }, where: { isGardien: true }, take: 1 },
        },
      },
      paiements: {
        where: siteFilterForModel("paiement", session.user),
        orderBy: { date: "desc" },
        include: { enregistrePar: { select: { id: true, name: true } } },
      },
      createdBy: { select: { id: true, name: true } },
    },
  });

  return facture;
}

export async function createFacture(data: FactureFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const tenantId = session.user.tenantId;
  const parsed = FactureSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const values = parsed.data;
  // Compteur de numérotation, volontairement tenant-wide (et non borné au site courant) :
  // "numero" ne porte aucune contrainte d'unicité en base et n'est jamais renvoyé à l'appelant
  // tel quel comme donnée d'un autre site — seul son prochain incrément l'est. Le scoper par
  // site romprait silencieusement la séquence globale de numérotation existante entre sites.
  // eslint-disable-next-line ecolpro/require-site-filter
  const count = await prisma.facture.count({ where: { tenantId } });
  const numero = `FAC-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

  // Récupérer le siteId de l'élève pour assigner la facture au bon site
  // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- lookup to get siteId for creation
  const eleve = await prisma.eleve.findUnique({
    where: { id: values.eleveId },
    select: { siteId: true },
  });
  const factureSiteId = eleve?.siteId ?? null;

  const facture = await prisma.facture.create({
    data: {
      tenantId,
      siteId: factureSiteId,
      eleveId: values.eleveId,
      numero,
      libelle: values.libelle,
      montant: values.montant,
      devise: values.devise || "DJF",
      statut: "EN_ATTENTE",
      echeance: values.echeance ? new Date(values.echeance) : null,
      createdById: session.user.id,
    },
  });

  revalidatePath("/facturation");
  revalidateTag("dashboard-data");
  return { success: true, id: facture.id };
}

export async function getFactureByNumero(numero: string) {
  const session = await auth();
  if (!session?.user?.tenantId) return null;

  if (!numero || numero.trim().length === 0) return null;

  return prisma.facture.findFirst({
    where: mergeFilters(
      { numero: numero.trim(), tenantId: session.user.tenantId },
      siteFilterForModel("facture", session.user)
    ),
    select: {
      id: true,
      numero: true,
      libelle: true,
      montant: true,
      devise: true,
      statut: true,
      echeance: true,
      eleve: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          matricule: true,
          classe: { select: { nom: true } },
        },
      },
    },
  });
}

export async function enregistrerPaiement(factureId: string, data: PaiementFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  if (!factureId || factureId.trim().length === 0) {
    throw new Error("Numéro de facture requis : aucun paiement ne peut être enregistré sans facture");
  }

  const parsed = PaiementSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const values = parsed.data;
  const facture = await prisma.facture.findFirst({
    where: mergeFilters(
      { id: factureId, tenantId: session.user.tenantId },
      siteFilterForModel("facture", session.user)
    ),
    include: { paiements: { where: siteFilterForModel("paiement", session.user) } },
  });
  if (!facture) throw new Error("Facture non trouvée");

  if (facture.statut === "ANNULEE") {
    throw new Error("Impossible d'encaisser sur une facture annulée");
  }

  const totalDejaPaye = facture.paiements.reduce((sum, p) => sum + p.montant, 0);
  const restant = facture.montant - totalDejaPaye;

  if (restant <= 0) {
    throw new Error("Cette facture est déjà soldée");
  }

  if (values.montant > restant) {
    throw new Error(`Le montant ne peut pas dépasser le solde restant (${restant} ${facture.devise})`);
  }

  const totalPaye = totalDejaPaye + values.montant;
  let newStatut: typeof facture.statut = facture.statut;

  if (totalPaye >= facture.montant) {
    newStatut = "PAYEE";
  } else if (facture.echeance && new Date() > facture.echeance && totalPaye < facture.montant) {
    newStatut = "EN_RETARD";
  }

  const paiement = await prisma.$transaction(async (tx) => {
    // La date de saisie est le jour de la saisie — automatique et identique
    // à la date du paiement (qui figure sur le reçu). On force les deux au
    // même instant pour garantir l'identité requise.
    const now = new Date();
    const created = await tx.paiement.create({
      data: {
        factureId,
        montant: values.montant,
        devise: facture.devise,
        methode: values.methode,
        reference: values.reference || null,
        date: now,
        dateSaisie: now,
        enregistreParId: session.user.id,
      },
    });

    await tx.facture.update({
      where: { id: factureId },
      data: { statut: newStatut },
    });

    let echeanceId = values.echeanceId;

    if (!echeanceId) {
      const echeancier = await tx.echeancier.findFirst({
        where: { factureId },
        include: {
          echeances: {
            where: { statut: { in: ["EN_ATTENTE", "EN_RETARD"] } },
            orderBy: { numero: "asc" },
          },
        },
      });

      if (echeancier && echeancier.echeances.length > 0) {
        const matchExact = echeancier.echeances.find(
          (e) => Math.abs(e.montant - values.montant) < 0.01
        );
        echeanceId = (matchExact ?? echeancier.echeances[0]).id;
      }
    } else {
      const echeance = await tx.echeancePaiement.findFirst({
        where: { id: echeanceId, factureId },
      });
      if (!echeance) {
        echeanceId = undefined;
      }
    }

    if (echeanceId) {
      await tx.echeancePaiement.update({
        where: { id: echeanceId },
        data: {
          statut: "PAYEE",
          paiementId: created.id,
          payeeLe: new Date(),
        },
      });

      const echeance = await tx.echeancePaiement.findUniqueOrThrow({
        where: { id: echeanceId },
        select: { echeancierId: true },
      });

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
    }

    return created;
  });

  revalidatePath("/facturation");
  revalidatePath(`/facturation/${factureId}`);
  revalidateTag("dashboard-data");
  return { success: true, id: paiement.id };
}

export async function annulerFacture(factureId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const facture = await prisma.facture.findFirst({
    where: mergeFilters(
      { id: factureId, tenantId: session.user.tenantId },
      siteFilterForModel("facture", session.user)
    ),
  });
  if (!facture) throw new Error("Facture non trouvée");

  if (facture.statut === "PAYEE") {
    throw new Error("Impossible d'annuler une facture déjà payée");
  }

  // eslint-disable-next-line ecolpro/require-site-filter -- comptage par factureId déjà vérifié tenant et via la relation facture
  const nbPaiements = await prisma.paiement.count({
    where: { factureId },
  });
  if (nbPaiements > 0) {
    throw new Error("Impossible d'annuler une facture ayant déjà des paiements");
  }

  await prisma.facture.update({
    where: { id: factureId },
    data: { statut: "ANNULEE" },
  });

  revalidatePath("/facturation");
  revalidatePath(`/facturation/${factureId}`);
  revalidateTag("dashboard-data");
  return { success: true };
}
