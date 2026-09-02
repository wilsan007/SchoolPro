"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { PAYMENT_METHOD_IDS } from "@/lib/payment-methods";
import { siteFilterForModel, mergeFilters } from "@/lib/site-scope";
import { anneeActiveId, getContexteAnnees } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";
import { z } from "zod";
import type { TypeFacture } from "@prisma/client";
import {
  canCreateFacture as canCreateFactureDomain,
  batchValide,
  cleUnicite,
  TYPES_MENSUELS,
  type FactureExistante,
} from "@/lib/domain/facture-unicite";

const FactureSchema = z.object({
  eleveId: z.string().min(1, "L'élève est requis"),
  libelle: z.string().min(1, "Le libellé est requis"),
  montant: z.number().min(0.01, "Le montant doit être positif"),
  devise: z.string().default("DJF"),
  echeance: z.string().optional(),
  type: z.enum(["MENSUALITE", "INSCRIPTION", "RENOUVELLEMENT", "CANTINE", "TRANSPORT", "LIBRE"]).default("MENSUALITE"),
  mois: z.string().optional(), // "YYYY-MM" pour les types mensuels
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

export async function getFacturesForTenant(filters?: { statut?: string; eleveId?: string; anneeId?: string }) {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  const tenantId = session.user.tenantId;

  // Si un anneeId explicite est fourni, on filtre strictement sur cette année.
  if (filters?.anneeId) {
    return prisma.facture.findMany({
      where: mergeFilters(
        {
          tenantId,
          anneeId: filters.anneeId,
          ...(filters.statut && filters.statut !== "ALL" ? { statut: filters.statut as never } : {}),
          ...(filters.eleveId ? { eleveId: filters.eleveId } : {}),
        },
        siteFilterForModel("facture", session.user)
      ),
      include: {
        eleve: { select: { id: true, nom: true, prenom: true, matricule: true, classeId: true, classe: { select: { nom: true } } } },
        paiements: {
          where: siteFilterForModel("paiement", session.user),
          include: { enregistrePar: { select: { id: true, name: true } } },
        },
        relances: { select: { id: true, niveau: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Sans anneeId explicite : utiliser le contexte annuel.
  // En période estivale, on affiche :
  //   — Toutes les factures de la nouvelle année (préparation)
  //   — Les factures IMPAYÉES de l'année écoulée (retards à encaisser)
  // En période normale : seulement l'année active.
  const ctx = await getContexteAnnees(tenantId);
  const anneeActiveIdVal = ctx.anneeActive?.id ?? null;
  const anneeEcouleeId = ctx.anneeEcoulee?.id ?? null;

  // En période estivale : factures de la nouvelle année + impayées de l'écoulée
  const anneeIds: string[] = [];
  if (anneeActiveIdVal) anneeIds.push(anneeActiveIdVal);
  if (ctx.phase !== "normale" && anneeEcouleeId) {
    // Les impayées de l'année écoulée : EN_ATTENTE, EN_RETARD (pas PAYEE ni ANNULEE)
    // On les inclut via un OR ci-dessous
  }

  const whereBase = {
    tenantId,
    ...(filters?.statut && filters.statut !== "ALL" ? { statut: filters.statut as never } : {}),
    ...(filters?.eleveId ? { eleveId: filters.eleveId } : {}),
  };

  const where =
    ctx.phase !== "normale" && anneeEcouleeId
      ? {
          OR: [
            // Factures de la nouvelle année
            { ...whereBase, anneeId: anneeActiveIdVal },
            // Factures impayées de l'année écoulée
            {
              ...whereBase,
              anneeId: anneeEcouleeId,
              statut: { in: ["EN_ATTENTE", "EN_RETARD"] },
            },
          ],
        }
      : {
          ...whereBase,
          ...(anneeActiveIdVal ? { anneeId: anneeActiveIdVal } : {}),
        };

  return prisma.facture.findMany({
    where: mergeFilters(where, siteFilterForModel("facture", session.user)),
    include: {
      eleve: { select: { id: true, nom: true, prenom: true, matricule: true, classeId: true, classe: { select: { nom: true } } } },
      paiements: {
        where: siteFilterForModel("paiement", session.user),
        include: { enregistrePar: { select: { id: true, name: true } } },
      },
      relances: { select: { id: true, niveau: true } },
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
  const type = values.type as TypeFacture;
  const mois = values.mois ?? null;

  // Vérification d'unicité : récupère les factures existantes de l'élève
  // (non annulées) et applique la règle du domaine.
  const existantes = await getExistingFacturesForEleve(values.eleveId, session);
  const check = canCreateFactureDomain(type, mois, existantes);
  if (!check.autorise && check.factureExistante) {
    const f = check.factureExistante;
    if (check.raison === "deja_payee") {
      throw new Error(
        `Une facture ${type} existe déjà et est payée (n° ${f.numero}). Impossible de la régénérer.`,
      );
    }
    throw new Error(
      `Une facture ${type} existe déjà (n° ${f.numero}, statut ${f.statut}). Annulez-la d'abord si c'était une erreur.`,
    );
  }

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

  // Rattacher la facture à l'année scolaire active (Time Machine-aware)
  const factureAnneeId = await anneeActiveId(tenantId);

  const facture = await prisma.facture.create({
    data: {
      tenantId,
      siteId: factureSiteId,
      eleveId: values.eleveId,
      anneeId: factureAnneeId,
      numero,
      libelle: values.libelle,
      montant: values.montant,
      devise: values.devise || "DJF",
      statut: "EN_ATTENTE",
      echeance: values.echeance ? new Date(values.echeance) : null,
      type,
      mois: TYPES_MENSUELS.has(type) ? mois : null,
      createdById: session.user.id,
    },
  });

  revalidatePath("/facturation");
  revalidateTag("dashboard-data");
  return { success: true, id: facture.id };
}

/**
 * Récupère les factures existantes (non annulées) d'un élève pour
 * verrouiller l'UI et vérifier l'unicité. Retourne les champs
 * nécessaires au contrôle d'unicité du domaine.
 */
export async function getExistingFacturesForEleve(
  eleveId: string,
  session?: { user: { tenantId: string | null; role: string; siteId?: string | null } },
): Promise<FactureExistante[]> {
  const sess = session ?? (await auth());
  if (!sess?.user?.tenantId) return [];
  const tenantId = sess.user.tenantId;

  const factures = await prisma.facture.findMany({
    where: mergeFilters(
      { tenantId, eleveId, statut: { not: "ANNULEE" } },
      siteFilterForModel("facture", sess.user),
    ),
    select: { id: true, numero: true, type: true, statut: true, mois: true },
  });
  return factures.map((f) => ({
    id: f.id,
    numero: f.numero,
    type: f.type,
    statut: f.statut,
    mois: f.mois,
  }));
}

// ============================================================
// CRÉATION MULTI-SERVICES (batch)
// ============================================================

/** Une facture candidate dans un batch multi-services. */
export interface FactureBatchItem {
  eleveId: string;
  libelle: string;
  montant: number;
  devise?: string;
  echeance?: string;
  type: TypeFacture;
  mois?: string | null;
}

/** Résultat de la création batch : { created, blocked }. */
export interface FactureBatchResult {
  created: { id: string; numero: string; type: TypeFacture; libelle: string }[];
  blocked: { type: TypeFacture; mois: string | null; raison: string; numero?: string }[];
}

/**
 * Crée plusieurs factures pour un même élève en une seule transaction.
 *
 * - Vérifie l'exclusivité mutuelle (INSCRIPTION + RENOUVELLEMENT interdits).
 * - Vérifie chaque facture individuellement via canCreateFacture.
 * - Les factures bloquées sont listées mais n'empêchent pas la création
 *   des autres.
 * - Numérotation séquentielle atomique dans une $transaction.
 */
export async function createFacturesCombinees(items: FactureBatchItem[]): Promise<FactureBatchResult> {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const tenantId = session.user.tenantId;

  if (items.length === 0) {
    return { created: [], blocked: [] };
  }

  // Tous les items doivent concerner le même élève.
  const eleveId = items[0].eleveId;
  if (items.some((i) => i.eleveId !== eleveId)) {
    throw new Error("Toutes les factures du batch doivent concerner le même élève");
  }

  // Vérifier l'exclusivité mutuelle (INSCRIPTION + RENOUVELLEMENT).
  const types = items.map((i) => i.type);
  if (!batchValide(types)) {
    throw new Error(
      "Exclusivité mutuelle : INSCRIPTION et RENOUVELLEMENT ne peuvent pas être facturés simultanément",
    );
  }

  // Récupérer les factures existantes de l'élève pour vérifier l'unicité.
  const existantes = await getExistingFacturesForEleve(eleveId, session);

  // Dédoublonner le batch : pas deux fois le même (type, mois).
  const vus = new Set<string>();
  const uniques: FactureBatchItem[] = [];
  const blocked: FactureBatchResult["blocked"] = [];

  for (const item of items) {
    const key = cleUnicite(item.type, item.mois ?? null);
    if (vus.has(key)) {
      blocked.push({
        type: item.type,
        mois: item.mois ?? null,
        raison: "Doublon dans le batch (même type et mois)",
      });
      continue;
    }
    vus.add(key);
    uniques.push(item);
  }

  // Vérifier chaque facture individuellement.
  const toCreate: FactureBatchItem[] = [];
  for (const item of uniques) {
    const check = canCreateFactureDomain(item.type, item.mois ?? null, existantes);
    if (!check.autorise && check.factureExistante) {
      const f = check.factureExistante;
      blocked.push({
        type: item.type,
        mois: item.mois ?? null,
        raison:
          check.raison === "deja_payee"
            ? `Déjà payée (n° ${f.numero})`
            : `Existe déjà (n° ${f.numero}, statut ${f.statut}). Annulez-la d'abord.`,
        numero: f.numero,
      });
      continue;
    }
    toCreate.push(item);
  }

  if (toCreate.length === 0) {
    return { created: [], blocked };
  }

  // Récupérer le siteId de l'élève et l'année active.
  // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- lookup to get siteId for creation
  const eleve = await prisma.eleve.findUnique({
    where: { id: eleveId },
    select: { siteId: true },
  });
  const factureSiteId = eleve?.siteId ?? null;
  const factureAnneeId = await anneeActiveId(tenantId);

  // Compteur tenant-wide pour la numérotation séquentielle.
  // eslint-disable-next-line ecolpro/require-site-filter
  let count = await prisma.facture.count({ where: { tenantId } });

  const created: FactureBatchResult["created"] = [];

  await prisma.$transaction(async (tx) => {
    for (const item of toCreate) {
      count++;
      const numero = `FAC-${new Date().getFullYear()}-${String(count).padStart(5, "0")}`;
      const f = await tx.facture.create({
        data: {
          tenantId,
          siteId: factureSiteId,
          eleveId,
          anneeId: factureAnneeId,
          numero,
          libelle: item.libelle,
          montant: item.montant,
          devise: item.devise || "DJF",
          statut: "EN_ATTENTE",
          echeance: item.echeance ? new Date(item.echeance) : null,
          type: item.type,
          mois: TYPES_MENSUELS.has(item.type) ? (item.mois ?? null) : null,
          createdById: session.user.id,
        },
      });
      created.push({ id: f.id, numero: f.numero, type: f.type, libelle: f.libelle });
    }
  });

  revalidatePath("/facturation");
  revalidateTag("dashboard-data");
  return { created, blocked };
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
  } else if (facture.echeance && (await getDemoNow()) > facture.echeance && totalPaye < facture.montant) {
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
