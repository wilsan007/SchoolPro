"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { LienParente } from "@prisma/client";

const DemandeLienSchema = z.object({
  matricule: z.string().min(1, "Le matricule est requis"),
  dateNaissance: z.string().min(1, "La date de naissance est requise"),
});

/**
 * Un parent connecté demande à rattacher un autre enfant à son compte.
 *
 * Il saisit le matricule + la date de naissance de l'enfant. Le serveur
 * vérifie que l'élève existe dans le tenant et que la date correspond,
 * affiche les infos en lecture seule (nom, classe, site), et crée une
 * DemandeLienParent en statut EN_ATTENTE.
 *
 * L'admin validera ou refusera ensuite depuis la file d'attente.
 */
export async function demanderLienEnfant(data: {
  matricule: string;
  dateNaissance: string;
}) {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.tenantId) {
    throw new Error("Non autorisé");
  }

  const parsed = DemandeLienSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { matricule, dateNaissance } = parsed.data;

  // Trouver le Parent associé à l'utilisateur connecté
  // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- self-lookup du parent lié à l'utilisateur connecté
  const parent = await prisma.parent.findFirst({
    where: { userId: session.user.id, tenantId: session.user.tenantId },
    select: { id: true },
  });

  if (!parent) {
    throw new Error("Aucun profil parent trouvé pour votre compte");
  }

  // Trouver l'élève par matricule dans le tenant
  // eslint-disable-next-line ecolpro/require-site-filter -- recherche par matricule unique dans le tenant, isolation par tenantId
  const eleve = await prisma.eleve.findFirst({
    where: { matricule, tenantId: session.user.tenantId },
    select: {
      id: true,
      nom: true,
      prenom: true,
      dateNaissance: true,
      classe: { select: { nom: true } },
      site: { select: { nom: true } },
    },
  });

  if (!eleve) {
    throw new Error("Aucun élève trouvé avec ce matricule dans l'établissement");
  }

  // Vérifier que la date de naissance correspond
  const dateSaisie = new Date(dateNaissance);
  if (isNaN(dateSaisie.getTime())) {
    throw new Error("Date de naissance invalide");
  }

  // Comparer en UTC (jour/mois/année uniquement)
  const sameDay =
    dateSaisie.getUTCDate() === eleve.dateNaissance.getUTCDate() &&
    dateSaisie.getUTCMonth() === eleve.dateNaissance.getUTCMonth() &&
    dateSaisie.getUTCFullYear() === eleve.dateNaissance.getUTCFullYear();

  if (!sameDay) {
    throw new Error("La date de naissance ne correspond pas à cet élève");
  }

  // Vérifier qu'un lien n'existe pas déjà
  // eslint-disable-next-line ecolpro/require-site-filter -- clé composite parent↔élève, déjà isolée par tenant
  const lienExistant = await prisma.eleveParent.findUnique({
    where: { eleveId_parentId: { eleveId: eleve.id, parentId: parent.id } },
  });
  if (lienExistant) {
    throw new Error("Cet enfant est déjà rattaché à votre compte");
  }

  // Vérifier qu'une demande n'est pas déjà en attente
  // eslint-disable-next-line ecolpro/require-tenant-id -- clé composite parent↔élève, déjà isolée par tenant
  const demandeExistante = await prisma.demandeLienParent.findUnique({
    where: { parentId_eleveId: { parentId: parent.id, eleveId: eleve.id } },
  });
  if (demandeExistante && demandeExistante.statut === "EN_ATTENTE") {
    throw new Error("Une demande est déjà en attente pour cet enfant");
  }
  if (demandeExistante && demandeExistante.statut === "VALIDE") {
    throw new Error("Cet enfant est déjà rattaché à votre compte");
  }

  // Créer ou recréer la demande (si une demande REFUSE existe, on la remplace)
  if (demandeExistante) {
    // eslint-disable-next-line ecolpro/require-tenant-id -- demandeExistante provient du findUnique ci-dessus, déjà isolé par tenant
    await prisma.demandeLienParent.update({
      where: { id: demandeExistante.id },
      data: {
        statut: "EN_ATTENTE",
        matriculeSaisi: matricule,
        dateNaissanceSaisie: dateSaisie,
        traitePar: null,
        traiteLe: null,
        motifRefus: null,
      },
    });
  } else {
    await prisma.demandeLienParent.create({
      data: {
        tenantId: session.user.tenantId,
        parentId: parent.id,
        eleveId: eleve.id,
        matriculeSaisi: matricule,
        dateNaissanceSaisie: dateSaisie,
        statut: "EN_ATTENTE",
      },
    });
  }

  revalidatePath("/profil");
  return {
    success: true,
    eleve: {
      nom: `${eleve.prenom} ${eleve.nom}`,
      classe: eleve.classe?.nom ?? "—",
      site: eleve.site?.nom ?? "—",
    },
  };
}

/**
 * Récupère les demandes de lien en attente pour l'administration.
 */
export async function getDemandesLienEnAttente() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    throw new Error("Non autorisé");
  }

  if (
    session.user.role !== "TENANT_ADMIN" &&
    session.user.role !== "SUPER_ADMIN" &&
    session.user.role !== "PRINCIPAL" &&
    session.user.role !== "SECRETARY"
  ) {
    throw new Error("Permissions insuffisantes");
  }

  return prisma.demandeLienParent.findMany({
    where: {
      tenantId: session.user.tenantId,
      statut: "EN_ATTENTE",
    },
    include: {
      parent: {
        select: { id: true, nom: true, prenom: true, phone: true, email: true },
      },
      eleve: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          matricule: true,
          dateNaissance: true,
          classe: { select: { nom: true } },
          site: { select: { nom: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Valide une demande de lien : crée le EleveParent et marque la demande VALIDE.
 */
export async function validerDemandeLien(demandeId: string, lien: LienParente = "TUTEUR") {
  const session = await auth();
  if (!session?.user?.tenantId) {
    throw new Error("Non autorisé");
  }

  if (
    session.user.role !== "TENANT_ADMIN" &&
    session.user.role !== "SUPER_ADMIN" &&
    session.user.role !== "PRINCIPAL"
  ) {
    throw new Error("Permissions insuffisantes");
  }

  const demande = await prisma.demandeLienParent.findFirst({
    where: { id: demandeId, tenantId: session.user.tenantId, statut: "EN_ATTENTE" },
  });

  if (!demande) {
    throw new Error("Demande introuvable ou déjà traitée");
  }

  // Créer le lien EleveParent s'il n'existe pas
  // eslint-disable-next-line ecolpro/require-site-filter -- clé composite, demande déjà filtrée par tenantId
  const lienExistant = await prisma.eleveParent.findUnique({
    where: { eleveId_parentId: { eleveId: demande.eleveId, parentId: demande.parentId } },
  });

  if (!lienExistant) {
    await prisma.eleveParent.create({
      data: {
        eleveId: demande.eleveId,
        parentId: demande.parentId,
        lien,
        isGardien: true,
      },
    });
  }

  await prisma.demandeLienParent.update({
    where: { id: demandeId },
    data: {
      statut: "VALIDE",
      traitePar: session.user.id,
      traiteLe: new Date(),
    },
  });

  revalidatePath("/parametres/demandes-lien");
  return { success: true };
}

/**
 * Refuse une demande de lien.
 */
export async function refuserDemandeLien(demandeId: string, motifRefus: string) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    throw new Error("Non autorisé");
  }

  if (
    session.user.role !== "TENANT_ADMIN" &&
    session.user.role !== "SUPER_ADMIN" &&
    session.user.role !== "PRINCIPAL"
  ) {
    throw new Error("Permissions insuffisantes");
  }

  const demande = await prisma.demandeLienParent.findFirst({
    where: { id: demandeId, tenantId: session.user.tenantId, statut: "EN_ATTENTE" },
  });

  if (!demande) {
    throw new Error("Demande introuvable ou déjà traitée");
  }

  await prisma.demandeLienParent.update({
    where: { id: demandeId },
    data: {
      statut: "REFUSE",
      traitePar: session.user.id,
      traiteLe: new Date(),
      motifRefus,
    },
  });

  revalidatePath("/parametres/demandes-lien");
  return { success: true };
}

/**
 * Récupère les demandes de lien du parent connecté (pour afficher
 * le statut dans son profil).
 */
export async function getMesDemandesLien() {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.tenantId) {
    return [];
  }

  // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- self-lookup du parent lié à l'utilisateur connecté
  const parent = await prisma.parent.findFirst({
    where: { userId: session.user.id, tenantId: session.user.tenantId },
    select: { id: true },
  });

  if (!parent) return [];

  // eslint-disable-next-line ecolpro/require-tenant-id -- parent.id provient du findFirst ci-dessus, déjà isolé par tenant
  return prisma.demandeLienParent.findMany({
    where: { parentId: parent.id },
    include: {
      eleve: {
        select: {
          nom: true,
          prenom: true,
          matricule: true,
          classe: { select: { nom: true } },
          site: { select: { nom: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
