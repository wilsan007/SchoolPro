"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { siteFilterForModel } from "@/lib/site-scope";
import { applyRlsContext } from "@/lib/prisma-rls";
import { checkPermission } from "@/lib/rbac";

/// Table de correspondance niveau → niveau suivant.
/// Inspiré de Pronote (préparation de l'année N+1) et Eduka (copy structure from previous year).
const PROMOTION_NIVEAUX: Record<string, string> = {
  // Maternelle
  "petite section": "Moyenne section",
  "moyenne section": "Grande section",
  "grande section": "CP",
  // Primaire
  "cp": "CE1",
  "ce1": "CE2",
  "ce2": "CM1",
  "cm1": "CM2",
  "cm2": "6ème",
  // Collège
  "6ème": "5ème",
  "6eme": "5ème",
  "6e": "5ème",
  "5ème": "4ème",
  "5eme": "4ème",
  "5e": "4ème",
  "4ème": "3ème",
  "4eme": "3ème",
  "4e": "3ème",
  "3ème": "2nde",
  "3eme": "2nde",
  "3e": "2nde",
  // Lycée
  "2nde": "1ère",
  "seconde": "1ère",
  "1ère": "Terminale",
  "1ere": "Terminale",
  "première": "Terminale",
  "premiere": "Terminale",
  "terminale": "Diplômé",
  "tle": "Diplômé",
};

export async function niveauSuivant(niveau: string): Promise<string | null> {
  const key = niveau.toLowerCase().trim();
  return PROMOTION_NIVEAUX[key] ?? null;
}

export interface PromotionPreview {
  classeId: string;
  classeNom: string;
  niveau: string;
  niveauSuivant: string | null;
  effectif: number;
  eleves: { id: string; nom: string; prenom: string; matricule: string; action: "promouvoir" | "redoubler" | "diplome" }[];
}

export async function previewPromotion(anneeSource: string, anneeCible: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:admin");
  if (denied) throw new Error("Permission refusée : réservé aux administrateurs");

  const classes = await prisma.classe.findMany({
    where: {
      tenantId: session.user.tenantId,
      annee: anneeSource,
      deletedAt: null,
      ...siteFilterForModel("classe", session.user),
    },
    include: {
      eleves: {
        where: { deletedAt: null, ...siteFilterForModel("eleve", session.user) },
        select: { id: true, nom: true, prenom: true, matricule: true, statut: true },
        orderBy: { nom: "asc" },
      },
    },
    orderBy: [{ niveau: "asc" }, { nom: "asc" }],
  });

  const preview: PromotionPreview[] = await Promise.all(
    classes.map(async (c) => {
      const nvSuivant = await niveauSuivant(c.niveau);
      return {
        classeId: c.id,
        classeNom: c.nom,
        niveau: c.niveau,
        niveauSuivant: nvSuivant,
        effectif: c.eleves.length,
        eleves: c.eleves.map((e) => ({
          id: e.id,
          nom: e.nom,
          prenom: e.prenom,
          matricule: e.matricule,
          action: (nvSuivant === "Diplômé" ? "diplome" : "promouvoir") as "promouvoir" | "redoubler" | "diplome",
        })),
      };
    })
  );

  return preview;
}

export async function executePromotion(
  anneeSource: string,
  anneeCible: string,
  decisions: Record<string, "promouvoir" | "redoubler" | "diplome">
) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:admin");
  if (denied) throw new Error("Permission refusée : réservé aux administrateurs");

  const classes = await prisma.classe.findMany({
    where: {
      tenantId: session.user.tenantId,
      annee: anneeSource,
      deletedAt: null,
      ...siteFilterForModel("classe", session.user),
    },
    include: {
      eleves: {
        where: { deletedAt: null, ...siteFilterForModel("eleve", session.user) },
        select: { id: true, nom: true, prenom: true, matricule: true, statut: true },
      },
    },
  });

  await prisma.$transaction(async (tx) => {
    await applyRlsContext(tx);
    for (const classe of classes) {
      const nvSuivant = await niveauSuivant(classe.niveau);

      for (const eleve of classe.eleves) {
        const decision = decisions[eleve.id] ?? "promouvoir";

        // Créer l'entrée ParcoursScolaire pour l'année source
        await tx.parcoursScolaire.upsert({
          where: { eleveId_annee: { eleveId: eleve.id, annee: anneeSource } },
          create: {
            tenantId: session.user.tenantId!,
            eleveId: eleve.id,
            annee: anneeSource,
            classe: classe.nom,
            niveau: classe.niveau,
            decision: decision === "promouvoir" ? "Passage" : decision === "redoubler" ? "Redoublement" : "Diplômé",
          },
          update: {
            classe: classe.nom,
            niveau: classe.niveau,
            decision: decision === "promouvoir" ? "Passage" : decision === "redoubler" ? "Redoublement" : "Diplômé",
          },
        });

        if (decision === "diplome") {
          await tx.eleve.update({
            where: { id: eleve.id },
            data: { statut: "DIPLOME", dateSortie: new Date(), motifSortie: "Fin d'études" },
          });
        }
        // Pour les redoublants : on les laisse dans la même classe (l'année change)
        // Pour les promus : on les détache de leur classe actuelle (ils seront affectés manuellement
        // ou via la création des nouvelles classes)
        if (decision === "promouvoir" && nvSuivant && nvSuivant !== "Diplômé") {
          // Clôturer l'historique de classe
          await tx.historiqueClasse.updateMany({
            where: { eleveId: eleve.id, dateSortie: null },
            data: { dateSortie: new Date(), motif: "Promotion" },
          });
          // Détacher l'élève de sa classe actuelle (en attente de nouvelle affectation)
          await tx.eleve.update({
            where: { id: eleve.id },
            data: { classeId: null },
          });
        }
      }

      // Archiver la classe de l'année source
      await tx.classe.update({
        where: { id: classe.id },
        data: {
          deletedAt: new Date(),
          deletedBy: session.user.id,
          deletedReason: `Promotion fin d'année ${anneeSource}`,
        },
      });
    }
  });

  revalidatePath("/parametres");
  revalidatePath("/eleves");
  revalidateTag("classes-list");
  revalidateTag("dashboard-data");
  revalidateTag("eleves-stats");
  return { success: true };
}

export async function copyStructureToNewYear(anneeSource: string, anneeCible: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:admin");
  if (denied) throw new Error("Permission refusée : réservé aux administrateurs");

  const classes = await prisma.classe.findMany({
    where: {
      tenantId: session.user.tenantId,
      annee: anneeSource,
      deletedAt: null,
      ...siteFilterForModel("classe", session.user),
    },
    select: {
      id: true, nom: true, niveau: true, filiere: true, effectifMax: true,
      structureId: true, profPrincipalId: true, siteId: true,
    },
  });

  let created = 0;
  for (const c of classes) {
    // Vérifier qu'une classe avec le même nom n'existe pas déjà pour l'année cible
    const existing = await prisma.classe.findFirst({
      where: {
        tenantId: session.user.tenantId,
        nom: c.nom,
        annee: anneeCible,
        deletedAt: null,
        ...siteFilterForModel("classe", session.user),
      },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.classe.create({
      data: {
        tenantId: session.user.tenantId!,
        siteId: c.siteId,
        nom: c.nom,
        niveau: c.niveau,
        filiere: c.filiere,
        effectifMax: c.effectifMax,
        annee: anneeCible,
        structureId: c.structureId,
        profPrincipalId: c.profPrincipalId,
      },
    });
    created++;
  }

  revalidatePath("/parametres");
  revalidateTag("classes-list");
  return { success: true, created };
}
