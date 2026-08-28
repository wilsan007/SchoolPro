"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { siteFilterForModel, mergeFilters } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { previewPromotion, executePromotion, niveauSuivant, activateAnneeScolaire } from "@/lib/actions/parametres";
import { genererFraisInscription, genererMensualites } from "@/lib/actions/facturation-avancee";
import { cloturerAnnee } from "@/lib/annee-scolaire";
import { sendWhatsAppMessage } from "@/lib/notifications/whatsapp";
import { notifyDirection } from "@/lib/notifications/notify-direction";

// ============================================================
// CRUD CAMPAGNE
// ============================================================

export async function getCampagnes() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  return prisma.campagneReinscription.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { dateDebut: "desc" },
    include: {
      _count: { select: { invitations: true } },
    },
  });
}

export async function getCampagneActive() {
  const session = await auth();
  if (!session?.user?.tenantId) return null;

  return prisma.campagneReinscription.findFirst({
    where: {
      tenantId: session.user.tenantId,
      statut: { in: ["BROUILLON", "EN_COURS"] },
    },
    orderBy: { dateDebut: "desc" },
    include: {
      invitations: {
        include: {
          eleve: {
            select: {
              id: true,
              nom: true,
              prenom: true,
              matricule: true,
              statut: true,
              classe: { select: { nom: true, niveau: true } },
              parents: {
                include: { parent: { select: { nom: true, prenom: true, phone: true, email: true } } },
              },
            },
          },
        },
        orderBy: { eleve: { nom: "asc" } },
      },
    },
  });
}

export async function creerCampagne(params: {
  libelle: string;
  anneeSource: string;
  anneeCible: string;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ACCOUNTANT") {
    throw new Error("Permissions insuffisantes");
  }

  // Vérifier qu'aucune campagne n'est déjà en cours
  const existante = await prisma.campagneReinscription.findFirst({
    where: {
      tenantId: session.user.tenantId,
      statut: { in: ["BROUILLON", "EN_COURS"] },
    },
  });
  if (existante) {
    throw new Error("Une campagne est déjà en cours. Terminez-la avant d'en créer une nouvelle.");
  }

  // Compter les élèves actifs pour les statistiques initiales
  const nbElevesTotal = await prisma.eleve.count({
    where: mergeFilters(
      { tenantId: session.user.tenantId, statut: "ACTIF", deletedAt: null },
      siteFilterForModel("eleve", session.user)
    ),
  });

  const campagne = await prisma.campagneReinscription.create({
    data: {
      tenantId: session.user.tenantId,
      libelle: params.libelle,
      anneeSource: params.anneeSource,
      anneeCible: params.anneeCible,
      nbElevesTotal,
      creeParId: session.user.id,
    },
  });

  // Créer les invitations pour tous les élèves actifs
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId: session.user.tenantId,
      statut: "ACTIF",
      deletedAt: null,
      ...siteFilterForModel("eleve", session.user),
    },
    include: {
      classe: { select: { niveau: true } },
      parents: { where: siteFilterForModel("eleveParent", session.user), include: { parent: { select: { phone: true, email: true } } } },
    },
  });

  // Pré-calculer la décision de promotion pour chaque élève
  const invitationsData: Array<{
    tenantId: string;
    campagneId: string;
    eleveId: string;
    parentPhone: string | null;
    parentEmail: string | null;
    decisionPromotion: string | null;
  }> = [];

  for (const eleve of eleves) {
    const nvSuivant = await niveauSuivant(eleve.classe?.niveau ?? "");
    const decision = nvSuivant === "Diplômé" ? "diplome" : "promouvoir";
    const parent = eleve.parents[0]?.parent;

    invitationsData.push({
      tenantId: session.user.tenantId,
      campagneId: campagne.id,
      eleveId: eleve.id,
      parentPhone: parent?.phone ?? null,
      parentEmail: parent?.email ?? null,
      decisionPromotion: decision,
    });
  }

  // Insertion en lot
  await prisma.invitationReinscription.createMany({
    data: invitationsData,
    skipDuplicates: true,
  });

  revalidatePath("/parametres/reinscription");
  return { success: true, campagneId: campagne.id, nbInvitations: invitationsData.length };
}

export async function avancerEtape(campagneId: string, etape: number) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ACCOUNTANT") {
    throw new Error("Permissions insuffisantes");
  }

  await prisma.campagneReinscription.update({
    where: { id: campagneId, tenantId: session.user.tenantId },
    data: {
      etapeActuelle: etape,
      statut: etape >= 6 ? "TERMINEE" : "EN_COURS",
      dateFin: etape >= 6 ? new Date() : undefined,
    },
  });

  revalidatePath("/parametres/reinscription");
  return { success: true };
}

export async function annulerCampagne(campagneId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ACCOUNTANT") {
    throw new Error("Permissions insuffisantes");
  }

  await prisma.campagneReinscription.update({
    where: { id: campagneId, tenantId: session.user.tenantId },
    data: { statut: "ANNULEE" },
  });

  revalidatePath("/parametres/reinscription");
  return { success: true };
}

// ============================================================
// ÉTAPE 2: CLÔTURE DE L'ANCIENNE ANNÉE
// ============================================================

export async function clôturerAncienneAnnee(campagneId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ACCOUNTANT") {
    throw new Error("Permissions insuffisantes");
  }

  const campagne = await prisma.campagneReinscription.findFirst({
    where: { id: campagneId, tenantId: session.user.tenantId },
  });
  if (!campagne) throw new Error("Campagne introuvable");

  // Trouver l'année source
  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId: session.user.tenantId, libelle: campagne.anneeSource },
  });
  if (!annee) throw new Error("Année source introuvable");
  if (annee.statut === "CLOTUREE") return { success: true, alreadyClosed: true };
  if (annee.statut === "ARCHIVEE") throw new Error("L'année est déjà archivée");

  await cloturerAnnee(annee.id, session.user.id);
  revalidatePath("/parametres/reinscription");
  return { success: true };
}

// ============================================================
// ÉTAPE 3: PROMOTION DES ÉLÈVES
// ============================================================

export async function previewPromotionCampagne(campagneId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const campagne = await prisma.campagneReinscription.findFirst({
    where: { id: campagneId, tenantId: session.user.tenantId },
  });
  if (!campagne) throw new Error("Campagne introuvable");

  return previewPromotion(campagne.anneeSource, campagne.anneeCible);
}

export async function executerPromotionCampagne(
  campagneId: string,
  decisions: Record<string, "promouvoir" | "redoubler" | "diplome">
) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ACCOUNTANT") {
    throw new Error("Permissions insuffisantes");
  }

  const campagne = await prisma.campagneReinscription.findFirst({
    where: { id: campagneId, tenantId: session.user.tenantId },
  });
  if (!campagne) throw new Error("Campagne introuvable");

  await executePromotion(campagne.anneeSource, campagne.anneeCible, decisions);

  // Mettre à jour les décisions dans les invitations
  for (const [eleveId, decision] of Object.entries(decisions)) {
    await prisma.invitationReinscription.updateMany({
      where: { campagneId, eleveId, tenantId: session.user.tenantId },
      data: { decisionPromotion: decision },
    });
  }

  // Compter les diplômés
  const nbDiplomes = Object.values(decisions).filter((d) => d === "diplome").length;

  await prisma.campagneReinscription.update({
    where: { id: campagneId, tenantId: session.user.tenantId },
    data: { nbDiplomes },
  });

  // Notification à la direction (best-effort)
  const nbPromus = Object.values(decisions).filter((d) => d === "promouvoir").length;
  const nbRedoublants = Object.values(decisions).filter((d) => d === "redoubler").length;
  await notifyDirection({
    tenantId: session.user.tenantId,
    titre: "Promotion des élèves effectuée",
    contenu:
      `La promotion a été exécutée par ${session.user.name ?? "un administrateur"}.\n` +
      `Promus : ${nbPromus} | Redoublants : ${nbRedoublants} | Diplômés : ${nbDiplomes}\n` +
      `Année cible : ${campagne.anneeCible}`,
    envoyeParId: session.user.id,
  });

  revalidatePath("/parametres/reinscription");
  return { success: true, nbDiplomes };
}

// ============================================================
// ÉTAPE 4: RÉINSCRIPTIONS — INVITATIONS & SUIVI
// ============================================================

export async function envoyerInvitations(campagneId: string, canal: "WHATSAPP" | "SMS" | "EMAIL" = "WHATSAPP") {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ACCOUNTANT" && session.user.role !== "SECRETARY") {
    throw new Error("Permissions insuffisantes");
  }

  const campagne = await prisma.campagneReinscription.findFirst({
    where: { id: campagneId, tenantId: session.user.tenantId },
    include: {
      invitations: {
        where: { statut: "INVITE" },
        include: {
          eleve: {
            select: { nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } },
          },
        },
      },
    },
  });
  if (!campagne) throw new Error("Campagne introuvable");

  let envoyees = 0;
  let erreurs = 0;

  for (const invitation of campagne.invitations) {
    try {
      if (canal === "WHATSAPP" && invitation.parentPhone) {
        const message = `Bonjour, votre enfant ${invitation.eleve.prenom} ${invitation.eleve.nom} (classe ${invitation.eleve.classe?.nom ?? "N/A"}) est invité(e) à se réinscrire pour l'année ${campagne.anneeCible}. Merci de confirmer via le portail parent.`;
        await sendWhatsAppMessage(invitation.parentPhone, message);
      }
      // SMS et EMAIL peuvent être ajoutés ici

      await prisma.invitationReinscription.update({
        where: { id: invitation.id, tenantId: session.user.tenantId },
        data: { canal, dateInvitation: new Date() },
      });
      envoyees++;
    } catch {
      erreurs++;
    }
  }

  revalidatePath("/parametres/reinscription");
  return { success: true, envoyees, erreurs };
}

export async function envoyerRelance(invitationId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ACCOUNTANT" && session.user.role !== "SECRETARY") {
    throw new Error("Permissions insuffisantes");
  }

  const invitation = await prisma.invitationReinscription.findFirst({
    where: { id: invitationId, tenantId: session.user.tenantId },
    include: {
      campagne: true,
      eleve: { select: { nom: true, prenom: true, classe: { select: { nom: true } } } },
    },
  });
  if (!invitation) throw new Error("Invitation introuvable");

  if (invitation.parentPhone) {
    const message = `Rappel : ${invitation.eleve.prenom} ${invitation.eleve.nom} n'est pas encore réinscrit(e) pour ${invitation.campagne.anneeCible}. Merci de confirmer rapidement.`;
    await sendWhatsAppMessage(invitation.parentPhone, message);
  }

  await prisma.invitationReinscription.update({
    where: { id: invitationId },
    data: {
      nbRelances: { increment: 1 },
      derniereRelance: new Date(),
    },
  });

  revalidatePath("/parametres/reinscription");
  return { success: true };
}

export async function confirmerReinscription(invitationId: string, confirme: boolean) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ACCOUNTANT" && session.user.role !== "SECRETARY") {
    throw new Error("Permissions insuffisantes");
  }

  const invitation = await prisma.invitationReinscription.findFirst({
    where: { id: invitationId, tenantId: session.user.tenantId },
  });
  if (!invitation) throw new Error("Invitation introuvable");

  await prisma.$transaction([
    prisma.invitationReinscription.update({
      where: { id: invitationId, tenantId: session.user.tenantId },
      data: {
        statut: confirme ? "CONFIRME" : "REFUSE",
        dateReponse: new Date(),
      },
    }),
    prisma.eleve.update({
      where: { id: invitation.eleveId, tenantId: session.user.tenantId },
      data: { statut: confirme ? "REINSCRIT" : "NON_REINSCRIT" },
    }),
  ]);

  // Mettre à jour les compteurs de la campagne
  const stats = await prisma.invitationReinscription.groupBy({
    by: ["statut"],
    where: { campagneId: invitation.campagneId, tenantId: session.user.tenantId },
    _count: true,
  });

  const nbReinscrits = stats.find((s) => s.statut === "CONFIRME")?._count ?? 0;
  const nbNonReinscrits = stats.find((s) => s.statut === "REFUSE")?._count ?? 0;

  await prisma.campagneReinscription.update({
    where: { id: invitation.campagneId, tenantId: session.user.tenantId },
    data: { nbReinscrits, nbNonReinscrits },
  });

  revalidatePath("/parametres/reinscription");
  return { success: true };
}

export async function marquerSansReponse(campagneId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ACCOUNTANT") {
    throw new Error("Permissions insuffisantes");
  }

  // Marquer toutes les invitations encore INVITE comme SANS_REPONSE
  const result = await prisma.invitationReinscription.updateMany({
    where: { campagneId, tenantId: session.user.tenantId, statut: "INVITE" },
    data: { statut: "SANS_REPONSE" },
  });

  // Marquer les élèves correspondants comme NON_REINSCRIT
  const sansReponse = await prisma.invitationReinscription.findMany({
    where: { campagneId, tenantId: session.user.tenantId, statut: "SANS_REPONSE" },
    select: { eleveId: true },
  });

  for (const inv of sansReponse) {
    await prisma.eleve.updateMany({
      where: { id: inv.eleveId, tenantId: session.user.tenantId, statut: "ACTIF" },
      data: { statut: "NON_REINSCRIT" },
    });
  }

  // Mettre à jour les compteurs
  const stats = await prisma.invitationReinscription.groupBy({
    by: ["statut"],
    where: { campagneId, tenantId: session.user.tenantId },
    _count: true,
  });

  const nbNonReinscrits = (stats.find((s) => s.statut === "REFUSE")?._count ?? 0) +
    (stats.find((s) => s.statut === "SANS_REPONSE")?._count ?? 0);

  await prisma.campagneReinscription.update({
    where: { id: campagneId, tenantId: session.user.tenantId },
    data: { nbNonReinscrits },
  });

  revalidatePath("/parametres/reinscription");
  return { success: true, nbMarques: result.count };
}

// ============================================================
// ÉTAPE 5: GÉNÉRATION DES FRAIS
// ============================================================

export async function genererFraisRenouvellement(campagneId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ACCOUNTANT") {
    throw new Error("Permissions insuffisantes");
  }

  const campagne = await prisma.campagneReinscription.findFirst({
    where: { id: campagneId, tenantId: session.user.tenantId },
  });
  if (!campagne) throw new Error("Campagne introuvable");

  // Récupérer les élèves réinscrits
  const reinscrits = await prisma.eleve.findMany({
    where: mergeFilters(
      { tenantId: session.user.tenantId, statut: "REINSCRIT", deletedAt: null },
      siteFilterForModel("eleve", session.user)
    ),
    select: { id: true },
  });

  if (reinscrits.length === 0) {
    return { success: true, generated: 0, skipped: 0, message: "Aucun élève réinscrit" };
  }

  const result = await genererFraisInscription({
    eleveIds: reinscrits.map((e) => e.id),
    type: "RENOUVELLEMENT",
    annee: campagne.anneeCible,
  });

  // Notification à la direction (best-effort)
  await notifyDirection({
    tenantId: session.user.tenantId,
    titre: `Frais de renouvellement générés — ${campagne.anneeCible}`,
    contenu:
      `Les frais de renouvellement ont été générés par ${session.user.name ?? "le comptable"}.\n` +
      `Factures créées : ${result.generated} | Ignorées (déjà existantes) : ${result.skipped}\n` +
      `Année cible : ${campagne.anneeCible}`,
    envoyeParId: session.user.id,
  });

  revalidatePath("/parametres/reinscription");
  return result;
}

export async function genererMensualitesCampagne(campagneId: string, mois: number) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ACCOUNTANT") {
    throw new Error("Permissions insuffisantes");
  }

  const campagne = await prisma.campagneReinscription.findFirst({
    where: { id: campagneId, tenantId: session.user.tenantId },
  });
  if (!campagne) throw new Error("Campagne introuvable");

  const result = await genererMensualites({
    mois,
    annee: campagne.anneeCible,
  });

  revalidatePath("/parametres/reinscription");
  return result;
}

// ============================================================
// ÉTAPE 6: ACTIVATION DE LA NOUVELLE ANNÉE
// ============================================================

export async function activerNouvelleAnnee(campagneId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ACCOUNTANT") {
    throw new Error("Permissions insuffisantes");
  }

  const campagne = await prisma.campagneReinscription.findFirst({
    where: { id: campagneId, tenantId: session.user.tenantId },
  });
  if (!campagne) throw new Error("Campagne introuvable");

  const anneeCible = await prisma.anneesScolaires.findFirst({
    where: { tenantId: session.user.tenantId, libelle: campagne.anneeCible },
  });
  if (!anneeCible) throw new Error("Année cible introuvable. Créez-la d'abord dans Paramètres → Années scolaires.");

  await activateAnneeScolaire(anneeCible.id);

  // Marquer la campagne comme terminée
  await prisma.campagneReinscription.update({
    where: { id: campagneId },
    data: { statut: "TERMINEE", dateFin: new Date(), etapeActuelle: 6 },
  });

  // Notification à la direction (best-effort) — résumé global
  const stats = await prisma.invitationReinscription.groupBy({
    by: ["statut"],
    where: { campagneId, tenantId: session.user.tenantId },
    _count: true,
  });
  const statutMap: Record<string, number> = {};
  for (const s of stats) statutMap[s.statut] = s._count;

  await notifyDirection({
    tenantId: session.user.tenantId,
    titre: "Procédure de réinscription terminée",
    contenu:
      `La procédure de réinscription a été finalisée par ${session.user.name ?? "un administrateur"}.\n` +
      `Réinscrits : ${statutMap["CONFIRME"] ?? 0} | Non réinscrits : ${(statutMap["REFUSE"] ?? 0) + (statutMap["SANS_REPONSE"] ?? 0)} | Diplômés : ${campagne.nbDiplomes}\n` +
      `Nouvelle année active : ${campagne.anneeCible}`,
    envoyeParId: session.user.id,
  });

  revalidatePath("/parametres/reinscription");
  revalidateTag("dashboard-data");
  return { success: true };
}

// ============================================================
// STATISTIQUES & DASHBOARD
// ============================================================

export async function getStatsCampagne(campagneId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) return null;

  const campagne = await prisma.campagneReinscription.findFirst({
    where: { id: campagneId, tenantId: session.user.tenantId },
    include: {
      _count: {
        select: {
          invitations: true,
        },
      },
    },
  });
  if (!campagne) return null;

  const stats = await prisma.invitationReinscription.groupBy({
    by: ["statut"],
    where: { campagneId, tenantId: session.user.tenantId },
    _count: true,
  });

  const statutMap: Record<string, number> = {};
  for (const s of stats) {
    statutMap[s.statut] = s._count;
  }

  // Calculer les revenus prévus (frais de renouvellement)
  const reinscrits = await prisma.eleve.findMany({
    where: mergeFilters(
      { tenantId: session.user.tenantId, statut: "REINSCRIT", deletedAt: null },
      siteFilterForModel("eleve", session.user)
    ),
    include: { classe: { select: { niveau: true } } },
  });

  const tarifs = await prisma.tarifNiveau.findMany({
    where: { tenantId: session.user.tenantId, annee: campagne.anneeCible, actif: true },
  });
  const tarifMap = new Map<string, typeof tarifs[0]>();
  for (const t of tarifs) {
    tarifMap.set(t.niveau.toLowerCase(), t);
  }

  let revenusPrevus = 0;
  for (const eleve of reinscrits) {
    const niveau = eleve.classe?.niveau ?? "Inconnu";
    const tarif = tarifMap.get(niveau.toLowerCase());
    if (tarif) {
      revenusPrevus += tarif.fraisRenouvellement;
    }
  }

  return {
    campagne,
    statuts: {
      invite: statutMap["INVITE"] ?? 0,
      confirme: statutMap["CONFIRME"] ?? 0,
      refuse: statutMap["REFUSE"] ?? 0,
      sansReponse: statutMap["SANS_REPONSE"] ?? 0,
    },
    revenusPrevus,
    tauxReinscription: campagne.nbElevesTotal > 0
      ? Math.round((statutMap["CONFIRME"] ?? 0) / campagne.nbElevesTotal * 100)
      : 0,
  };
}

// ============================================================
// VÉRIFICATIONS PRÉALABLES
// ============================================================

export async function verifierEtape(campagneId: string, etape: number) {
  const session = await auth();
  if (!session?.user?.tenantId) return { ok: false, message: "Non autorisé" };

  const campagne = await prisma.campagneReinscription.findFirst({
    where: { id: campagneId, tenantId: session.user.tenantId },
  });
  if (!campagne) return { ok: false, message: "Campagne introuvable" };

  switch (etape) {
    case 1: {
      // Vérifier que l'année cible existe
      const anneeCible = await prisma.anneesScolaires.findFirst({
        where: { tenantId: session.user.tenantId, libelle: campagne.anneeCible },
      });
      if (!anneeCible) {
        return { ok: false, message: `L'année ${campagne.anneeCible} n'existe pas. Créez-la dans Paramètres → Années scolaires.` };
      }
      // Vérifier que les tarifs sont configurés
      const tarifs = await prisma.tarifNiveau.findMany({
        where: { tenantId: session.user.tenantId, annee: campagne.anneeCible, actif: true },
      });
      if (tarifs.length === 0) {
        return { ok: false, message: `Aucun tarif configuré pour ${campagne.anneeCible}. Configurez-les dans Paramètres → Tarifs.` };
      }
      return { ok: true };
    }
    case 2: {
      const anneeSource = await prisma.anneesScolaires.findFirst({
        where: { tenantId: session.user.tenantId, libelle: campagne.anneeSource },
      });
      if (!anneeSource) return { ok: false, message: "Année source introuvable" };
      if (anneeSource.statut === "ARCHIVEE") return { ok: false, message: "L'année source est déjà archivée" };
      return { ok: true };
    }
    case 3: {
      // Vérifier que l'année source est clôturée
      const anneeSource = await prisma.anneesScolaires.findFirst({
        where: { tenantId: session.user.tenantId, libelle: campagne.anneeSource },
      });
      if (!anneeSource) return { ok: false, message: "Année source introuvable" };
      if (anneeSource.statut === "OUVERTE") {
        return { ok: false, message: "Clôturez d'abord l'année source (étape 2)" };
      }
      return { ok: true };
    }
    case 4: {
      // Vérifier que la promotion a été exécutée
      const promotions = await prisma.parcoursScolaire.count({
        where: {
          tenantId: session.user.tenantId,
          annee: campagne.anneeSource,
          ...siteFilterForModel("parcoursScolaire", session.user),
        },
      });
      if (promotions === 0) {
        return { ok: false, message: "Exécutez d'abord la promotion (étape 3)" };
      }
      return { ok: true };
    }
    case 5: {
      // Vérifier qu'il y a des élèves réinscrits
      const nbReinscrits = await prisma.eleve.count({
        where: mergeFilters(
          { tenantId: session.user.tenantId, statut: "REINSCRIT", deletedAt: null },
          siteFilterForModel("eleve", session.user)
        ),
      });
      if (nbReinscrits === 0) {
        return { ok: false, message: "Aucun élève réinscrit. Confirmez des réinscriptions (étape 4)" };
      }
      return { ok: true };
    }
    case 6: {
      // Vérifier que l'année cible existe et n'est pas déjà active
      const anneeCible = await prisma.anneesScolaires.findFirst({
        where: { tenantId: session.user.tenantId, libelle: campagne.anneeCible },
      });
      if (!anneeCible) return { ok: false, message: "Année cible introuvable" };
      if (anneeCible.isCurrent) return { ok: true, message: "L'année cible est déjà active" };
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}
