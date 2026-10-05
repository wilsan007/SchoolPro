"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reserverNumeroFacture } from "@/lib/factures/numerotation";
import { revalidatePath, revalidateTag } from "next/cache";
import { sendPaymentWhatsApp } from "@/lib/notifications/whatsapp";
import { siteFilterForModel, mergeFilters } from "@/lib/site-scope";
import { anneeActiveId } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { choisirTarif, montantPourTypeFrais } from "@/lib/domain/tarifs";
import { genererMensualitesPourTenant } from "@/lib/factures/mensualites";

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
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "tarifs:gerer");
  if (denied) throw new Error("Permissions insuffisantes");

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
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "tarifs:gerer");
  if (denied) throw new Error("Permissions insuffisantes");

  const existant = await prisma.tarifNiveau.findFirst({
    where: { id: tarifId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!existant) throw new Error("Tarif introuvable");

  await prisma.tarifNiveau.delete({
    where: { id: tarifId, tenantId: session.user.tenantId },
  });

  revalidatePath("/parametres");
  return { success: true };
}

// ============================================================
// GÉNÉRATION AUTOMATIQUE DE FACTURES (MENSUALITÉS)
// ============================================================


/**
 * Génération à la demande (Paramètres → Facturation).
 *
 * Le cœur de la règle vit dans `@/lib/factures/mensualites` : la tâche
 * planifiée du 1er du mois applique EXACTEMENT la même, sans seconde vérité
 * sur les montants (rapprochement année ↔ cycle, tarif du site, idempotence).
 * Cette action n'ajoute que ce qui relève d'une requête utilisateur : la
 * session, la permission, et le périmètre de l'utilisateur.
 */
export async function genererMensualites(params: {
  mois: number; // 1-12
  annee: string; // "2025-2026"
  inclureCantine?: boolean;
  inclureTransport?: boolean;
  /** Aperçu : mêmes chiffres que la génération, sans rien écrire. */
  apercu?: boolean;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "factures:generer");
  if (denied) throw new Error("Permissions insuffisantes");

  const resultat = await genererMensualitesPourTenant({
    tenantId: session.user.tenantId,
    annee: params.annee,
    mois: params.mois,
    inclureCantine: params.inclureCantine,
    inclureTransport: params.inclureTransport,
    // Périmètre : un secrétaire de site ne facture que SON site, la direction
    // voit tous les sites du tenant. Le filtre est résolu dans le cœur partagé.
    portee: session.user,
    createdById: session.user.id,
    dryRun: params.apercu === true,
  });

  if (!resultat.apercu) {
    revalidatePath("/facturation");
    revalidateTag("dashboard-data", { expire: 0 });
  }
  return { success: true, ...resultat };
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
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "factures:generer");
  if (denied) throw new Error("Permissions insuffisantes");

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

  let count = 0;
  let skipped = 0;

  for (const eleveId of eleveIds) {
    const eleve = await prisma.eleve.findFirst({
      where: mergeFilters({ id: eleveId, tenantId }, siteFilterForModel("eleve", session.user)),
      include: { classe: { select: { niveau: true } } },
    });
    if (!eleve) { skipped++; continue; }

    // Rapprochement année ↔ cycle, puis tarif du SITE de l'élève
    // (même règle que genererMensualites, cf. lib/domain/tarifs).
    const niveau = eleve.classe?.niveau ?? "Inconnu";
    const choix = choisirTarif(tarifs, eleve.siteId, niveau);
    if (!choix) { skipped++; continue; }
    const tarif = choix.tarif;

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

    // INSCRIPTION et RENOUVELLEMENT reposent sur des colonnes non nulles : le
    // `null` est donc impossible ici. On refuse malgré tout de continuer plutôt
    // que d'écrire un montant absent — un 0 silencieux serait une facture fausse.
    const montant = montantPourTypeFrais(tarif, type);
    if (montant === null) { skipped++; continue; }
    const numero = await reserverNumeroFacture(tenantId, annee.split("-")[0]);

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
        type,
        createdById: session.user.id,
      },
    });
    count++;
  }

  revalidatePath("/facturation");
  revalidateTag("dashboard-data", { expire: 0 });
  return { success: true, generated: count, skipped };
}

// ============================================================
// RELANCES (après retard de paiement)
// ============================================================

export async function envoyerRelance(factureId: string, canal: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "factures:relancer");
  if (denied) throw new Error("Permissions insuffisantes");

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
  revalidateTag("dashboard-data", { expire: 0 });
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
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "exclusions:gerer");
  if (denied) throw new Error("Permissions insuffisantes");

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
    where: { id: eleveId, tenantId: session.user.tenantId },
    data: { statut: "EXCLU" },
  });

  revalidatePath("/facturation");
  revalidatePath("/eleves");
  revalidateTag("dashboard-data", { expire: 0 });
  revalidateTag("eleves-stats", { expire: 0 });
  return { success: true };
}

export async function leverExclusion(exclusionId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "exclusions:gerer");
  if (denied) throw new Error("Permissions insuffisantes");

  const exclusion = await prisma.exclusionEleve.findFirst({
    where: { id: exclusionId, tenantId: session.user.tenantId, dateFin: null },
  });
  if (!exclusion) throw new Error("Exclusion non trouvée ou déjà levée");

  await prisma.exclusionEleve.update({
    where: { id: exclusionId, tenantId: session.user.tenantId },
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
    where: { id: exclusion.eleveId, tenantId: session.user.tenantId },
    data: { statut: "ACTIF" },
  });

  revalidatePath("/facturation");
  revalidatePath("/eleves");
  revalidateTag("dashboard-data", { expire: 0 });
  revalidateTag("eleves-stats", { expire: 0 });
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
        where: { id: f.id, tenantId: session.user.tenantId },
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
