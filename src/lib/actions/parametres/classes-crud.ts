"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import {
  siteFilterForModel,
  siteIdForCreate,
  requireSiteIdForCreate,
} from "@/lib/site-scope";
import { niveauRequiresProfPrincipal } from "@/lib/utils-classe";
import { ELEVE_NON_ARCHIVE } from "@/lib/eleve-filters";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { applyRlsContext } from "@/lib/prisma-rls";
import { auditFire } from "@/lib/audit";

const ClasseSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  niveau: z.string().min(1, "Le niveau est requis"),
  filiere: z.string().optional(),
  effectifMax: z.number().min(1).default(40),
  annee: z.string().default("2025-2026"),
  structureId: z.string().optional(),
  profPrincipalId: z.string().optional(),
  siteId: z.string().optional(),
});

export type ClasseFormData = z.infer<typeof ClasseSchema>;

export async function getClassesForSettings() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  const siteId = (session.user as { siteId?: string | null }).siteId ?? null;
  const siteIds = (session.user as { siteIds?: string[] }).siteIds;

  const siteFilter = siteFilterForModel("classe", session.user);
  return prisma.classe.findMany({
    where: { tenantId: session.user.tenantId, deletedAt: null, ...(anneeCourante ? { annee: anneeCourante } : {}), ...siteFilter },
    include: {
      // Sans ce filtre, l'effectif affiché inclut les fiches archivées :
      // les classes annonçaient jusqu'à 63 élèves pour 29 réels.
      _count: { select: { eleves: ELEVE_NON_ARCHIVE } },
      profPrincipal: { select: { user: { select: { name: true } } } },
      structure: { select: { id: true, nom: true, type: true } },
    },
    orderBy: [{ niveau: "asc" }, { nom: "asc" }],
  });
}

export async function getEnseignantsForClasse() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];
  const siteFilter = siteFilterForModel("enseignant", session.user);
  return prisma.enseignant.findMany({
    where: { tenantId: session.user.tenantId, ...siteFilter },
    select: { id: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
}

export async function createClasse(data: ClasseFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const siteError = requireSiteIdForCreate(session.user);
  if (siteError) throw new Error(siteError);

  const parsed = ClasseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;

  // Validation: prof principal obligatoire pour collège/lycée
  if (niveauRequiresProfPrincipal(v.niveau) && !v.profPrincipalId) {
    throw new Error("Un professeur principal est obligatoire pour les classes de collège et lycée");
  }

  // Vérifier que le prof principal existe et appartient au tenant
  if (v.profPrincipalId) {
    const ens = await prisma.enseignant.findFirst({
      where: {
        id: v.profPrincipalId,
        tenantId: session.user.tenantId,
        ...siteFilterForModel("enseignant", session.user),
      },
      select: { id: true },
    });
    if (!ens) throw new Error("Enseignant introuvable dans cet établissement");
  }

  await prisma.classe.create({
    data: {
      tenantId: session.user.tenantId,
      siteId: v.siteId || siteIdForCreate(session.user),
      nom: v.nom,
      niveau: v.niveau,
      filiere: v.filiere || null,
      effectifMax: v.effectifMax,
      annee: v.annee,
      structureId: v.structureId || null,
      profPrincipalId: v.profPrincipalId || null,
    },
  });

  revalidatePath("/parametres");
  revalidatePath("/eleves");
  revalidateTag("classes-list");
  revalidateTag("dashboard-data");
  revalidateTag("eleves-stats");
  return { success: true };
}

export async function deleteClasse(
  classeId: string,
  options?: { reassignToClasseId?: string; strategy?: "reassign" | "remove" | "archive" }
) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const strategy = options?.strategy ?? "archive";
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

  const classe = await prisma.classe.findFirst({
    where: {
      id: classeId,
      tenantId: session.user.tenantId,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...siteFilterForModel("classe", session.user),
    },
    include: { _count: { select: { eleves: ELEVE_NON_ARCHIVE } } },
  });
  if (!classe) throw new Error("Classe non trouvée");

  const hasActiveStudents = classe._count.eleves > 0;

  // Stratégie « archive » : soft delete, comme Google Classroom / PowerSchool
  if (strategy === "archive") {
    await prisma.classe.update({
      where: { id: classeId },
      data: {
        deletedAt: new Date(),
        deletedBy: session.user.id,
        deletedReason: "Archivage administrateur",
      },
    });
    revalidatePath("/parametres");
    revalidatePath("/eleves");
    revalidateTag("classes-list");
    revalidateTag("dashboard-data");
    revalidateTag("eleves-stats");
    return { success: true, action: "archived" };
  }

  // Les stratégies « reassign » et « remove » suppriment définitivement.
  // Elles ne sont autorisées que si la classe est vide OU si on gère les élèves.
  if (hasActiveStudents && strategy === "reassign") {
    if (!options?.reassignToClasseId) {
      throw new Error("Une classe cible est requise pour la réaffectation");
    }
    // Vérifier que la classe cible existe et appartient au même tenant
    const target = await prisma.classe.findFirst({
      where: {
        id: options.reassignToClasseId,
        tenantId: session.user.tenantId,
        ...(anneeCourante ? { annee: anneeCourante } : {}),
        ...siteFilterForModel("classe", session.user),
      },
      select: { id: true },
    });
    if (!target) throw new Error("Classe cible introuvable");

    // Déplacer les élèves + créer l'historique en une transaction
    await prisma.$transaction(async (tx) => {
      await applyRlsContext(tx);
      const eleves = await tx.eleve.findMany({
        where: { classeId, deletedAt: null },
        select: { id: true },
      });
      if (eleves.length > 0) {
        await tx.eleve.updateMany({
          where: { id: { in: eleves.map((e) => e.id) } },
          data: { classeId: options.reassignToClasseId! },
        });
        // Clôturer l'historique ancien et créer le nouveau
        await tx.historiqueClasse.updateMany({
          where: { classeId, dateSortie: null },
          data: { dateSortie: new Date(), motif: "Transfert (réaffectation)" },
        });
        await tx.historiqueClasse.createMany({
          data: eleves.map((e) => ({
            tenantId: session.user.tenantId!,
            eleveId: e.id,
            classeId: options.reassignToClasseId!,
            dateEntree: new Date(),
            motif: "Transfert (réaffectation)",
          })),
        });
      }
      await tx.classe.delete({ where: { id: classeId } });
    });
  }

  if (hasActiveStudents && strategy === "remove") {
    // Détacher les élèves (classeId = null) puis supprimer la classe
    await prisma.$transaction(async (tx) => {
      await applyRlsContext(tx);
      const eleves = await tx.eleve.findMany({
        where: { classeId, deletedAt: null },
        select: { id: true },
      });
      if (eleves.length > 0) {
        await tx.eleve.updateMany({
          where: { id: { in: eleves.map((e) => e.id) } },
          data: { classeId: null },
        });
        // Clôturer l'historique
        await tx.historiqueClasse.updateMany({
          where: { classeId, dateSortie: null },
          data: { dateSortie: new Date(), motif: "Retrait de classe" },
        });
      }
      await tx.classe.delete({ where: { id: classeId } });
    });
  }

  // Classe vide : suppression directe
  if (!hasActiveStudents) {
    auditFire({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "classe:delete",
      verdict: "ALLOWED",
      resource: "classe",
      resourceId: classeId,
    });
    await prisma.classe.delete({ where: { id: classeId } });
  }

  revalidatePath("/parametres");
  revalidatePath("/eleves");
  revalidateTag("classes-list");
  revalidateTag("dashboard-data");
  revalidateTag("eleves-stats");
  return { success: true, action: strategy };
}
