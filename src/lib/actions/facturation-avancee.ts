"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { sendPaymentWhatsApp } from "@/lib/notifications/whatsapp";
import { siteFilterForModel, mergeFilters } from "@/lib/site-scope";
import { anneeActiveId } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";
import { z } from "zod";

// ============================================================
// TARIFS PAR NIVEAU
// ============================================================

const TarifSchema = z.object({
  niveau: z.string().min(1, "Le niveau est requis"),
  annee: z.string().min(1, "L'année est requise"),
  mensualite: z.number().min(0, "La mensualité est requise"),
  fraisInscription: z.number().min(0, "Les frais d'inscription sont requis"),
  fraisRenouvellement: z.number().min(0, "Les frais de renouvellement sont requis"),
  fraisCantine: z.number().optional(),
  fraisTransport: z.number().optional(),
  devise: z.string().default("DJF"),
  nbMois: z.number().min(1).max(12).default(10),
  siteId: z.string().optional(),
});

export type TarifFormData = z.infer<typeof TarifSchema>;

export async function getTarifsForTenant() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];
  return prisma.tarifNiveau.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ annee: "desc" }, { niveau: "asc" }],
  });
}

export async function createTarif(data: TarifFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const parsed = TarifSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;
  await prisma.tarifNiveau.create({
    data: {
      tenantId: session.user.tenantId,
      niveau: v.niveau,
      annee: v.annee,
      mensualite: v.mensualite,
      fraisInscription: v.fraisInscription,
      fraisRenouvellement: v.fraisRenouvellement,
      fraisCantine: v.fraisCantine ?? null,
      fraisTransport: v.fraisTransport ?? null,
      devise: v.devise,
      nbMois: v.nbMois,
      siteId: v.siteId || null,
    },
  });

  revalidatePath("/parametres");
  return { success: true };
}

export async function deleteTarif(tarifId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const existant = await prisma.tarifNiveau.findFirst({
    where: { id: tarifId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!existant) throw new Error("Tarif introuvable");

  await prisma.tarifNiveau.delete({
    where: { id: tarifId },
  });

  revalidatePath("/parametres");
  return { success: true };
}

// ============================================================
// GÉNÉRATION AUTOMATIQUE DE FACTURES (MENSUALITÉS)
// ============================================================

export async function genererMensualites(params: {
  mois: number; // 1-12
  annee: string; // "2025-2026"
  inclureCantine?: boolean;
  inclureTransport?: boolean;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const tenantId = session.user.tenantId;
  const { mois, annee, inclureCantine = false, inclureTransport = false } = params;

  // Résoudre l'ID de l'année scolaire depuis le libellé
  const anneeRecord = await prisma.anneesScolaires.findFirst({
    where: { tenantId, libelle: annee },
    select: { id: true },
  });

  const moisNoms = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const moisNom = moisNoms[mois - 1] ?? `Mois ${mois}`;

  // Récupérer tous les élèves actifs avec leur classe (pour le niveau)
  const eleves = await prisma.eleve.findMany({
    where: mergeFilters({ tenantId, statut: "ACTIF" }, siteFilterForModel("eleve", session.user)),
    include: { classe: { select: { niveau: true, nom: true } } },
  });

  // Récupérer les tarifs par niveau
  const tarifs = await prisma.tarifNiveau.findMany({
    where: { tenantId, annee, actif: true },
  });

  // Indexer les tarifs par niveau
  const tarifMap = new Map<string, typeof tarifs[0]>();
  for (const t of tarifs) {
    tarifMap.set(t.niveau.toLowerCase(), t);
  }

  let count = 0;
  let skipped = 0;

  for (const eleve of eleves) {
    const niveau = eleve.classe?.niveau ?? "Inconnu";
    const tarif = tarifMap.get(niveau.toLowerCase());
    if (!tarif) {
      skipped++;
      continue;
    }

    // Vérifier si une facture existe déjà pour cet élève et ce mois
    const libelle = `Scolarité ${moisNom} ${annee}`;
    const existing = await prisma.facture.findFirst({
      where: mergeFilters(
        { tenantId, eleveId: eleve.id, libelle, ...(anneeRecord ? { anneeId: anneeRecord.id } : {}) },
        siteFilterForModel("facture", session.user)
      ),
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    // Calculer le montant total
    let montant = tarif.mensualite;
    if (inclureCantine && tarif.fraisCantine) montant += tarif.fraisCantine;
    if (inclureTransport && tarif.fraisTransport) montant += tarif.fraisTransport;

    // Échéance = fin du mois
    const echeance = new Date(parseInt(annee.split("-")[0]), mois, 0);

    // Compteur de numérotation volontairement tenant-wide (voir facture.ts createFacture) :
    // "numero" ne porte aucune contrainte d'unicité en base et préserve une séquence globale
    // continue entre sites plutôt que de la fragmenter silencieusement.
    // eslint-disable-next-line ecolpro/require-site-filter
    const factureCount = await prisma.facture.count({ where: { tenantId } });
    const numero = `FAC-${annee.split("-")[0]}-${String(factureCount + 1).padStart(5, "0")}`;

    await prisma.facture.create({
      data: {
        tenantId,
        siteId: eleve.siteId,
        eleveId: eleve.id,
        anneeId: anneeRecord?.id ?? null,
        numero,
        libelle,
        montant,
        devise: tarif.devise,
        statut: "EN_ATTENTE",
        echeance,
        createdById: session.user.id,
      },
    });
    count++;
  }

  revalidatePath("/facturation");
  revalidateTag("dashboard-data");
  return { success: true, generated: count, skipped };
}

// ============================================================
// GÉNÉRATION FRAIS D'INSCRIPTION / RENOUVELLEMENT
// ============================================================

export async function genererFraisInscription(params: {
  eleveIds: string[];
  type: "INSCRIPTION" | "RENOUVELLEMENT";
  annee: string;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const tenantId = session.user.tenantId;
  const { eleveIds, type, annee } = params;

  // Résoudre l'ID de l'année scolaire depuis le libellé
  const anneeRecord = await prisma.anneesScolaires.findFirst({
    where: { tenantId, libelle: annee },
    select: { id: true },
  });

  const tarifs = await prisma.tarifNiveau.findMany({
    where: { tenantId, annee, actif: true },
  });
  const tarifMap = new Map<string, typeof tarifs[0]>();
  for (const t of tarifs) {
    tarifMap.set(t.niveau.toLowerCase(), t);
  }

  let count = 0;
  let skipped = 0;

  for (const eleveId of eleveIds) {
    const eleve = await prisma.eleve.findFirst({
      where: mergeFilters({ id: eleveId, tenantId }, siteFilterForModel("eleve", session.user)),
      include: { classe: { select: { niveau: true } } },
    });
    if (!eleve) { skipped++; continue; }

    const niveau = eleve.classe?.niveau ?? "Inconnu";
    const tarif = tarifMap.get(niveau.toLowerCase());
    if (!tarif) { skipped++; continue; }

    const libelle = type === "INSCRIPTION"
      ? `Frais d'inscription ${annee}`
      : `Frais de renouvellement ${annee}`;

    // Vérifier si déjà facturé
    const existing = await prisma.facture.findFirst({
      where: mergeFilters(
        { tenantId, eleveId, libelle, ...(anneeRecord ? { anneeId: anneeRecord.id } : {}) },
        siteFilterForModel("facture", session.user)
      ),
      select: { id: true },
    });
    if (existing) { skipped++; continue; }

    const montant = type === "INSCRIPTION" ? tarif.fraisInscription : tarif.fraisRenouvellement;
    // Compteur tenant-wide volontaire (voir genererMensualites ci-dessus).
    // eslint-disable-next-line ecolpro/require-site-filter
    const factureCount = await prisma.facture.count({ where: { tenantId } });
    const numero = `FAC-${annee.split("-")[0]}-${String(factureCount + 1).padStart(5, "0")}`;

    await prisma.facture.create({
      data: {
        tenantId,
        siteId: eleve.siteId,
        eleveId,
        anneeId: anneeRecord?.id ?? null,
        numero,
        libelle,
        montant,
        devise: tarif.devise,
        statut: "EN_ATTENTE",
        echeance: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 jours
        createdById: session.user.id,
      },
    });
    count++;
  }

  revalidatePath("/facturation");
  revalidateTag("dashboard-data");
  return { success: true, generated: count, skipped };
}

// ============================================================
// RELANCES (après retard de paiement)
// ============================================================

export async function envoyerRelance(factureId: string, canal: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL" && session.user.role !== "ACCOUNTANT") {
    throw new Error("Permissions insuffisantes");
  }

  const facture = await prisma.facture.findFirst({
    where: mergeFilters(
      { id: factureId, tenantId: session.user.tenantId },
      siteFilterForModel("facture", session.user)
    ),
    include: {
      eleve: {
        select: {
          nom: true,
          prenom: true,
          matricule: true,
          parents: {
            where: { isGardien: true },
            take: 1,
            include: { parent: { select: { phone: true, prenom: true, nom: true } } },
          },
        },
      },
      paiements: { where: siteFilterForModel("paiement", session.user) },
      relances: {
        where: siteFilterForModel("relance", session.user),
        orderBy: { niveau: "desc" },
        take: 1,
      },
    },
  });
  if (!facture) throw new Error("Facture non trouvée");

  const totalPaye = facture.paiements.reduce((s, p) => s + p.montant, 0);
  const restant = facture.montant - totalPaye;
  if (restant <= 0) throw new Error("Cette facture est entièrement payée");

  const dernierNiveau = facture.relances[0]?.niveau ?? 0;
  const niveau = dernierNiveau + 1;

  const messages: Record<number, string> = {
    1: `Première relance : La facture ${facture.numero} de ${facture.eleve?.prenom ?? ""} ${facture.eleve?.nom ?? ""} d'un montant de ${restant} ${facture.devise} est en retard. Merci de régulariser.`,
    2: `Deuxième relance : La facture ${facture.numero} reste impayée (${restant} ${facture.devise}). Merci de régulariser rapidement.`,
    3: `Troisième relance (ULTIME) : La facture ${facture.numero} est toujours impayée. Une procédure d'exclusion pourrait être engagée.`,
  };

  const message = messages[niveau] ?? `Relance niveau ${niveau} : Facture ${facture.numero} impayée.`;

  await prisma.relance.create({
    data: {
      tenantId: session.user.tenantId,
      factureId,
      niveau,
      canal,
      message,
      envoyeeParId: session.user.id,
    },
  });

  // Envoi réel pour les canaux supportés
  if (canal === "whatsapp") {
    const tuteur = facture.eleve?.parents[0]?.parent;
    if (tuteur?.phone) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: session.user.tenantId },
        select: { name: true },
      });
      await sendPaymentWhatsApp(
        tuteur.phone,
        `${facture.eleve?.prenom ?? ""} ${facture.eleve?.nom ?? ""}`,
        restant,
        facture.devise,
        facture.numero,
        tenant?.name ?? "EcolPro"
      );
    }
  }

  revalidatePath("/facturation");
  revalidatePath(`/facturation/${factureId}`);
  revalidateTag("dashboard-data");
  return { success: true, niveau, message };
}

export async function getRelancesForFacture(factureId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) return [];
  return prisma.relance.findMany({
    where: { factureId, tenantId: session.user.tenantId },
    include: { envoyeePar: { select: { name: true } } },
    orderBy: { niveau: "asc" },
  });
}

// ============================================================
// EXCLUSION D'ÉLÈVE (pour non-paiement)
// ============================================================

export async function exclureEleve(params: {
  eleveId: string;
  motif: string;
  details?: string;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const { eleveId, motif, details } = params;

  // Vérifier qu'il n'y a pas déjà une exclusion en cours
  const existing = await prisma.exclusionEleve.findFirst({
    where: { eleveId, tenantId: session.user.tenantId, dateFin: null },
  });
  if (existing) throw new Error("Cet élève est déjà exclu");

  await prisma.exclusionEleve.create({
    data: {
      tenantId: session.user.tenantId,
      eleveId,
      motif,
      details: details ?? null,
      dateDebut: new Date(),
      decideeParId: session.user.id,
    },
  });

  // Marquer l'élève comme exclu (appartenance déjà vérifiée par le existing.eleveId
  // ci-dessus, lui-même filtré par tenantId — mais eleveId provient des params
  // d'entrée : revérifier explicitement avant d'écrire).
  const eleveAExclure = await prisma.eleve.findFirst({
    where: mergeFilters({ id: eleveId, tenantId: session.user.tenantId }, siteFilterForModel("eleve", session.user)),
    select: { id: true },
  });
  if (!eleveAExclure) throw new Error("Élève introuvable");

  await prisma.eleve.update({
    where: { id: eleveId },
    data: { statut: "EXCLU" },
  });

  revalidatePath("/facturation");
  revalidatePath("/eleves");
  revalidateTag("dashboard-data");
  revalidateTag("eleves-stats");
  return { success: true };
}

export async function leverExclusion(exclusionId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const exclusion = await prisma.exclusionEleve.findFirst({
    where: { id: exclusionId, tenantId: session.user.tenantId, dateFin: null },
  });
  if (!exclusion) throw new Error("Exclusion non trouvée ou déjà levée");

  await prisma.exclusionEleve.update({
    where: { id: exclusionId },
    data: {
      dateFin: new Date(),
      leveeParId: session.user.id,
      leveeLe: new Date(),
    },
  });

  // Réactiver l'élève (revérifier l'appartenance : exclusion.eleveId est une donnée
  // relue, mais l'écriture qui suit doit être garantie dans le même périmètre).
  const eleveAReactiver = await prisma.eleve.findFirst({
    where: mergeFilters(
      { id: exclusion.eleveId, tenantId: session.user.tenantId },
      siteFilterForModel("eleve", session.user)
    ),
    select: { id: true },
  });
  if (!eleveAReactiver) throw new Error("Élève introuvable");

  await prisma.eleve.update({
    where: { id: exclusion.eleveId },
    data: { statut: "ACTIF" },
  });

  revalidatePath("/facturation");
  revalidatePath("/eleves");
  revalidateTag("dashboard-data");
  revalidateTag("eleves-stats");
  return { success: true };
}

export async function getExclusionsForTenant() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];
  return prisma.exclusionEleve.findMany({
    where: { tenantId: session.user.tenantId, dateFin: null },
    include: {
      eleve: { select: { nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } } },
      decideePar: { select: { name: true } },
    },
    orderBy: { dateDebut: "desc" },
  });
}

// ============================================================
// DÉTECTION DES FACTURES EN RETARD
// ============================================================

export async function detecterFacturesEnRetard() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];
  const now = await getDemoNow();
  const anneeId = await anneeActiveId(session.user.tenantId);

  const factures = await prisma.facture.findMany({
    where: mergeFilters(
      {
        tenantId: session.user.tenantId,
        ...(anneeId ? { anneeId } : {}),
        statut: { in: ["EN_ATTENTE", "EN_RETARD"] },
        echeance: { lt: now },
      },
      siteFilterForModel("facture", session.user)
    ),
    include: {
      eleve: { select: { nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } } },
      paiements: { where: siteFilterForModel("paiement", session.user) },
      relances: {
        where: siteFilterForModel("relance", session.user),
        orderBy: { niveau: "desc" },
        take: 1,
      },
    },
    orderBy: { echeance: "asc" },
  });

  // Mettre à jour le statut EN_RETARD
  for (const f of factures) {
    const totalPaye = f.paiements.reduce((s, p) => s + p.montant, 0);
    if (totalPaye < f.montant && f.statut !== "EN_RETARD") {
      await prisma.facture.update({
        where: { id: f.id },
        data: { statut: "EN_RETARD" },
      });
    }
  }

  return factures.map((f) => {
    const totalPaye = f.paiements.reduce((s, p) => s + p.montant, 0);
    return {
      id: f.id,
      numero: f.numero,
      eleveNom: `${f.eleve?.prenom ?? ""} ${f.eleve?.nom ?? ""}`,
      matricule: f.eleve?.matricule ?? "",
      classe: f.eleve?.classe?.nom ?? "N/A",
      montant: f.montant,
      restant: f.montant - totalPaye,
      echeance: f.echeance,
      dernierNiveauRelance: f.relances[0]?.niveau ?? 0,
    };
  });
}
