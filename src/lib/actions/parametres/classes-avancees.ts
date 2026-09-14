"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { siteFilterForModel } from "@/lib/site-scope";
import { niveauRequiresProfPrincipal } from "@/lib/utils-classe";
import { ELEVE_NON_ARCHIVE } from "@/lib/eleve-filters";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { applyRlsContext } from "@/lib/prisma-rls";

const UpdateClasseSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  niveau: z.string().min(1, "Le niveau est requis"),
  filiere: z.string().optional(),
  effectifMax: z.number().min(1).default(40),
  annee: z.string().default("2025-2026"),
  structureId: z.string().optional(),
  profPrincipalId: z.string().optional(),
  siteId: z.string().optional(),
});

export type UpdateClasseFormData = z.infer<typeof UpdateClasseSchema>;

export async function updateClasse(classeId: string, data: UpdateClasseFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const parsed = UpdateClasseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

  // Vérifier que la classe existe et appartient au tenant
  const existing = await prisma.classe.findFirst({
    where: {
      id: classeId,
      tenantId: session.user.tenantId,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...siteFilterForModel("classe", session.user),
    },
    select: { id: true },
  });
  if (!existing) throw new Error("Classe non trouvée");

  // Validation: prof principal obligatoire pour collège/lycée
  if (niveauRequiresProfPrincipal(v.niveau) && !v.profPrincipalId) {
    throw new Error("Un professeur principal est obligatoire pour les classes de collège et lycée");
  }

  // Vérifier le prof principal si fourni
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

  await prisma.classe.update({
    where: { id: classeId, tenantId: session.user.tenantId },
    data: {
      nom: v.nom,
      niveau: v.niveau,
      filiere: v.filiere || null,
      effectifMax: v.effectifMax,
      annee: v.annee,
      structureId: v.structureId || null,
      profPrincipalId: v.profPrincipalId || null,
      siteId: v.siteId || null,
    },
  });

  revalidatePath("/parametres");
  revalidatePath("/eleves");
  revalidateTag("classes-list");
  revalidateTag("dashboard-data");
  revalidateTag("eleves-stats");
  return { success: true };
}

export async function archiveClasse(classeId: string, reason?: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

  const classe = await prisma.classe.findFirst({
    where: {
      id: classeId,
      tenantId: session.user.tenantId,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...siteFilterForModel("classe", session.user),
    },
    select: { id: true, deletedAt: true },
  });
  if (!classe) throw new Error("Classe non trouvée");
  if (classe.deletedAt) throw new Error("Cette classe est déjà archivée");

  await prisma.classe.update({
    where: { id: classeId, tenantId: session.user.tenantId },
    data: {
      deletedAt: new Date(),
      deletedBy: session.user.id,
      deletedReason: reason ?? "Archivage",
    },
  });

  revalidatePath("/parametres");
  revalidatePath("/eleves");
  revalidateTag("classes-list");
  revalidateTag("dashboard-data");
  revalidateTag("eleves-stats");
  return { success: true };
}

export async function restoreClasse(classeId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

  const classe = await prisma.classe.findFirst({
    where: {
      id: classeId,
      tenantId: session.user.tenantId,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...siteFilterForModel("classe", session.user),
    },
    select: { id: true, deletedAt: true },
  });
  if (!classe) throw new Error("Classe non trouvée");
  if (!classe.deletedAt) throw new Error("Cette classe n'est pas archivée");

  await prisma.classe.update({
    where: { id: classeId, tenantId: session.user.tenantId },
    data: {
      deletedAt: null,
      deletedBy: null,
      deletedReason: null,
    },
  });

  revalidatePath("/parametres");
  revalidatePath("/eleves");
  revalidateTag("classes-list");
  revalidateTag("dashboard-data");
  revalidateTag("eleves-stats");
  return { success: true };
}

export async function getArchivedClasses() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

  return prisma.classe.findMany({
    where: {
      tenantId: session.user.tenantId,
      deletedAt: { not: null },
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...siteFilterForModel("classe", session.user),
    },
    include: {
      _count: { select: { eleves: ELEVE_NON_ARCHIVE } },
      profPrincipal: { select: { user: { select: { name: true } } } },
      structure: { select: { id: true, nom: true, type: true } },
    },
    orderBy: { deletedAt: "desc" },
  });
}

export async function transferClasse(classeId: string, targetSiteId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Permission refusée : réservé aux administrateurs");
  }
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

  const classe = await prisma.classe.findFirst({
    where: {
      id: classeId,
      tenantId: session.user.tenantId,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...siteFilterForModel("classe", session.user),
    },
    select: { id: true, siteId: true, nom: true },
  });
  if (!classe) throw new Error("Classe non trouvée");

  // Vérifier que le site cible existe et appartient au même tenant
  const targetSite = await prisma.site.findFirst({
    where: {
      id: targetSiteId,
      tenantId: session.user.tenantId,
      deletedAt: null,
    },
    select: { id: true, nom: true },
  });
  if (!targetSite) throw new Error("Site cible introuvable");

  if (classe.siteId === targetSiteId) {
    throw new Error("La classe est déjà sur ce site");
  }

  // Transaction : transférer la classe ET tous ses élèves vers le nouveau site
  await prisma.$transaction(async (tx) => {
    await applyRlsContext(tx);
    await tx.classe.update({
      where: { id: classeId },
      data: { siteId: targetSiteId },
    });
    await tx.eleve.updateMany({
      where: { classeId, deletedAt: null },
      data: { siteId: targetSiteId },
    });
  });

  revalidatePath("/parametres");
  revalidatePath("/eleves");
  revalidateTag("classes-list");
  revalidateTag("dashboard-data");
  revalidateTag("eleves-stats");
  return { success: true };
}

export async function mergeClasses(sourceIds: string[], targetClasseId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Permission refusée : réservé aux administrateurs");
  }

  if (sourceIds.includes(targetClasseId)) {
    throw new Error("La classe cible ne peut pas être une des classes sources");
  }

  if (sourceIds.length === 0) {
    throw new Error("Au moins une classe source est requise");
  }
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

  // Vérifier que toutes les classes existent et appartiennent au tenant
  const target = await prisma.classe.findFirst({
    where: {
      id: targetClasseId,
      tenantId: session.user.tenantId,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...siteFilterForModel("classe", session.user),
    },
    select: { id: true, effectifMax: true, _count: { select: { eleves: ELEVE_NON_ARCHIVE } } },
  });
  if (!target) throw new Error("Classe cible introuvable");

  const sources = await prisma.classe.findMany({
    where: {
      id: { in: sourceIds },
      tenantId: session.user.tenantId,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...siteFilterForModel("classe", session.user),
    },
    select: { id: true, nom: true, _count: { select: { eleves: ELEVE_NON_ARCHIVE } } },
  });
  if (sources.length !== sourceIds.length) {
    throw new Error("Une ou plusieurs classes sources sont introuvables");
  }

  // Calculer le nouvel effectif et vérifier la capacité
  const totalStudents =
    target._count.eleves + sources.reduce((sum, s) => sum + s._count.eleves, 0);
  if (totalStudents > target.effectifMax) {
    throw new Error(
      `Capacité dépassée : ${totalStudents} élèves pour un maximum de ${target.effectifMax}`
    );
  }

  await prisma.$transaction(async (tx) => {
    await applyRlsContext(tx);
    for (const sourceId of sourceIds) {
      const eleves = await tx.eleve.findMany({
        where: { classeId: sourceId, deletedAt: null },
        select: { id: true },
      });
      if (eleves.length > 0) {
        await tx.eleve.updateMany({
          where: { id: { in: eleves.map((e) => e.id) } },
          data: { classeId: targetClasseId },
        });
        // Clôturer l'historique ancien et créer le nouveau
        await tx.historiqueClasse.updateMany({
          where: { classeId: sourceId, dateSortie: null },
          data: { dateSortie: new Date(), motif: "Fusion de classes" },
        });
        await tx.historiqueClasse.createMany({
          data: eleves.map((e) => ({
            tenantId: session.user.tenantId!,
            eleveId: e.id,
            classeId: targetClasseId,
            dateEntree: new Date(),
            motif: "Fusion de classes",
          })),
        });
      }
      // Archiver les classes sources (soft delete)
      await tx.classe.update({
        where: { id: sourceId },
        data: {
          deletedAt: new Date(),
          deletedBy: session.user.id,
          deletedReason: `Fusion vers la classe cible`,
        },
      });
    }
  });

  revalidatePath("/parametres");
  revalidatePath("/eleves");
  revalidateTag("classes-list");
  revalidateTag("dashboard-data");
  revalidateTag("eleves-stats");
  return { success: true, merged: sources.length, totalStudents };
}

export async function splitClasse(
  sourceClasseId: string,
  newClasses: { nom: string; eleveIds: string[] }[]
) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Permission refusée : réservé aux administrateurs");
  }

  if (newClasses.length === 0) {
    throw new Error("Au moins une nouvelle classe est requise");
  }

  const source = await prisma.classe.findFirst({
    where: {
      id: sourceClasseId,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("classe", session.user),
    },
    select: { id: true, nom: true, niveau: true, filiere: true, effectifMax: true, annee: true, structureId: true, profPrincipalId: true, siteId: true },
  });
  if (!source) throw new Error("Classe source introuvable");

  await prisma.$transaction(async (tx) => {
    await applyRlsContext(tx);
    for (const nc of newClasses) {
      // Créer la nouvelle classe avec les mêmes propriétés que la source
      const created = await tx.classe.create({
        data: {
          tenantId: session.user.tenantId!,
          siteId: source.siteId,
          nom: nc.nom,
          niveau: source.niveau,
          filiere: source.filiere,
          effectifMax: source.effectifMax,
          annee: source.annee,
          structureId: source.structureId,
          profPrincipalId: source.profPrincipalId,
        },
      });
      // Déplacer les élèves vers la nouvelle classe
      if (nc.eleveIds.length > 0) {
        await tx.eleve.updateMany({
          where: { id: { in: nc.eleveIds } },
          data: { classeId: created.id },
        });
        // Historique
        await tx.historiqueClasse.updateMany({
          where: { eleveId: { in: nc.eleveIds }, dateSortie: null },
          data: { dateSortie: new Date(), motif: "Scission de classe" },
        });
        await tx.historiqueClasse.createMany({
          data: nc.eleveIds.map((eleveId) => ({
            tenantId: session.user.tenantId!,
            eleveId,
            classeId: created.id,
            dateEntree: new Date(),
            motif: "Scission de classe",
          })),
        });
      }
    }
  });

  revalidatePath("/parametres");
  revalidatePath("/eleves");
  revalidateTag("classes-list");
  revalidateTag("dashboard-data");
  revalidateTag("eleves-stats");
  return { success: true, createdCount: newClasses.length };
}

export async function duplicateClasse(classeId: string, newAnnee: string, copyStudents: boolean = false) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

  const source = await prisma.classe.findFirst({
    where: {
      id: classeId,
      tenantId: session.user.tenantId,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...siteFilterForModel("classe", session.user),
    },
    select: {
      id: true, nom: true, niveau: true, filiere: true, effectifMax: true,
      structureId: true, profPrincipalId: true, siteId: true,
    },
  });
  if (!source) throw new Error("Classe source introuvable");

  // Vérifier qu'une classe avec le même nom n'existe pas déjà pour cette année
  const existing = await prisma.classe.findFirst({
    where: {
      tenantId: session.user.tenantId,
      nom: source.nom,
      annee: newAnnee,
      deletedAt: null,
      ...siteFilterForModel("classe", session.user),
    },
    select: { id: true },
  });
  if (existing) throw new Error(`Une classe "${source.nom}" existe déjà pour l'année ${newAnnee}`);

  const newClasse = await prisma.classe.create({
    data: {
      tenantId: session.user.tenantId!,
      siteId: source.siteId,
      nom: source.nom,
      niveau: source.niveau,
      filiere: source.filiere,
      effectifMax: source.effectifMax,
      annee: newAnnee,
      structureId: source.structureId,
      profPrincipalId: source.profPrincipalId,
    },
  });

  // Option : copier aussi les élèves (pour redoublants ou passage)
  if (copyStudents) {
    const eleves = await prisma.eleve.findMany({
      where: {
        classeId,
        tenantId: session.user.tenantId,
        deletedAt: null,
        ...siteFilterForModel("eleve", session.user),
      },
      select: { id: true },
    });
    if (eleves.length > 0) {
      await prisma.eleve.updateMany({
        where: { id: { in: eleves.map((e) => e.id) }, tenantId: session.user.tenantId },
        data: { classeId: newClasse.id },
      });
      await prisma.historiqueClasse.createMany({
        data: eleves.map((e) => ({
          tenantId: session.user.tenantId!,
          eleveId: e.id,
          classeId: newClasse.id,
          dateEntree: new Date(),
          motif: "Duplication de classe",
        })),
      });
    }
  }

  revalidatePath("/parametres");
  revalidatePath("/eleves");
  revalidateTag("classes-list");
  revalidateTag("dashboard-data");
  revalidateTag("eleves-stats");
  return { success: true, newClasseId: newClasse.id };
}

export async function getClassesForExport() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

  const classes = await prisma.classe.findMany({
    where: {
      tenantId: session.user.tenantId,
      deletedAt: null,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...siteFilterForModel("classe", session.user),
    },
    include: {
      _count: { select: { eleves: ELEVE_NON_ARCHIVE } },
      profPrincipal: { select: { user: { select: { name: true } } } },
      structure: { select: { nom: true } },
      site: { select: { nom: true } },
    },
    orderBy: [{ niveau: "asc" }, { nom: "asc" }],
  });

  return classes.map((c) => ({
    nom: c.nom,
    niveau: c.niveau,
    filiere: c.filiere ?? "",
    effectifActuel: c._count.eleves,
    effectifMax: c.effectifMax,
    profPrincipal: c.profPrincipal?.user.name ?? "",
    structure: c.structure?.nom ?? "",
    site: c.site?.nom ?? "",
    annee: c.annee,
  }));
}
