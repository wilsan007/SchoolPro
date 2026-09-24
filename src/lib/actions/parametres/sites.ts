"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { siteFilterForModel } from "@/lib/site-scope";
import { ELEVE_NON_ARCHIVE } from "@/lib/eleve-filters";
import type { Role } from "@prisma/client";
import { checkPermission } from "@/lib/rbac";

const SiteSchema = z.object({
  nom: z.string().min(2, "Le nom du site est requis"),
  code: z.string().optional(),
  adresse: z.string().optional(),
  ville: z.string().optional(),
  telephone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  actif: z.boolean().default(true),
});

export type SiteFormData = z.infer<typeof SiteSchema>;

export async function getSitesForSettings() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  const isAdmin = session.user.role === "TENANT_ADMIN" || session.user.role === "SUPER_ADMIN";

  return prisma.site.findMany({
    where: isAdmin
      ? { tenantId: session.user.tenantId, deletedAt: null }
      : {
          tenantId: session.user.tenantId,
          deletedAt: null,
          userSites: { some: { userId: session.user.id } },
        },
    include: {
      _count: {
        select: {
          classes: true,
          eleves: ELEVE_NON_ARCHIVE,
          salles: true,
          userSites: true,
          factures: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function createSite(data: SiteFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:admin");
  if (denied) throw new Error("Permissions insuffisantes");

  const parsed = SiteSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;
  await prisma.site.create({
    data: {
      tenantId: session.user.tenantId,
      nom: v.nom,
      code: v.code || null,
      adresse: v.adresse || null,
      ville: v.ville || null,
      telephone: v.telephone || null,
      email: v.email || null,
      actif: v.actif,
    },
  });

  revalidatePath("/parametres");
  return { success: true };
}

export async function updateSite(siteId: string, data: Partial<SiteFormData>) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:admin");
  if (denied) throw new Error("Permissions insuffisantes");

  const site = await prisma.site.findFirst({
    where: { id: siteId, tenantId: session.user.tenantId },
  });
  if (!site) throw new Error("Site non trouvé");

  const parsed = SiteSchema.partial().safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;
  await prisma.site.update({
    where: { id: siteId },
    data: {
      nom: v.nom,
      code: v.code,
      adresse: v.adresse,
      ville: v.ville,
      telephone: v.telephone,
      email: v.email,
      actif: v.actif,
    },
  });

  revalidatePath("/parametres");
  return { success: true };
}

const PURGE_DELAY_DAYS = 90;

const DeleteSiteSchema = z.object({
  reason: z.enum(["FERMETURE", "FUSION", "ERREUR", "AUTRE"], {
    error: () => ({ message: "Veuillez sélectionner une raison" }),
  }),
  customReason: z.string().optional(),
  confirmName1: z.string().min(1, "Veuillez saisir le nom du site"),
  confirmName2: z.string().min(1, "Veuillez confirmer le nom du site"),
  acknowledgeIrreversible: z.boolean().refine((v) => v === true, {
    message: "Vous devez cocher la case de confirmation",
  }),
});

export type DeleteSiteFormData = z.infer<typeof DeleteSiteSchema>;

export async function deleteSite(siteId: string, data: DeleteSiteFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:admin");
  if (denied) throw new Error("Permissions insuffisantes");

  const parsed = DeleteSiteSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const site = await prisma.site.findFirst({
    where: { id: siteId, tenantId: session.user.tenantId, deletedAt: null },
  });
  if (!site) throw new Error("Site non trouvé ou déjà supprimé");

  if (parsed.data.confirmName1 !== site.nom || parsed.data.confirmName2 !== site.nom) {
    throw new Error("Le nom saisi ne correspond pas au nom du site");
  }

  const reasonLabel = parsed.data.reason === "AUTRE" && parsed.data.customReason
    ? parsed.data.customReason
    : parsed.data.reason;

  const now = new Date();
  const scheduledPurgeAt = new Date(now.getTime() + PURGE_DELAY_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.site.update({
      where: { id: siteId },
      data: {
        deletedAt: now,
        deletedBy: session.user.id,
        deletedReason: reasonLabel,
        scheduledPurgeAt,
        actif: false,
      },
    }),
    prisma.siteDeletionLog.create({
      data: {
        tenantId: session.user.tenantId,
        siteId: site.id,
        siteNom: site.nom,
        action: "SOFT_DELETE",
        reason: reasonLabel,
        performedBy: session.user.id,
        performedByName: session.user.name ?? null,
        metadata: { scheduledPurgeAt: scheduledPurgeAt.toISOString(), confirmName1: parsed.data.confirmName1, confirmName2: parsed.data.confirmName2 },
      },
    }),
  ]);

  revalidatePath("/parametres");
  return { success: true, scheduledPurgeAt: scheduledPurgeAt.toISOString() };
}

export async function restoreSite(siteId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:admin");
  if (denied) throw new Error("Permissions insuffisantes");

  const site = await prisma.site.findFirst({
    where: { id: siteId, tenantId: session.user.tenantId, deletedAt: { not: null } },
  });
  if (!site) throw new Error("Site supprimé non trouvé");

  await prisma.$transaction([
    prisma.site.update({
      where: { id: siteId },
      data: {
        deletedAt: null,
        deletedBy: null,
        deletedReason: null,
        scheduledPurgeAt: null,
      },
    }),
    prisma.siteDeletionLog.create({
      data: {
        tenantId: session.user.tenantId,
        siteId: site.id,
        siteNom: site.nom,
        action: "RESTORE",
        performedBy: session.user.id,
        performedByName: session.user.name ?? null,
      },
    }),
  ]);

  revalidatePath("/parametres");
  return { success: true };
}

export async function getDeletedSites() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];
  if (await checkPermission(session.user.role, "parametres:admin")) return [];

  return prisma.site.findMany({
    where: {
      tenantId: session.user.tenantId,
      deletedAt: { not: null },
    },
    select: {
      id: true,
      nom: true,
      code: true,
      deletedAt: true,
      deletedReason: true,
      scheduledPurgeAt: true,
      _count: {
        select: {
          classes: true,
          eleves: ELEVE_NON_ARCHIVE,
          salles: true,
        },
      },
    },
    orderBy: { deletedAt: "desc" },
  });
}

export async function assignUserSites(userId: string, sites: { siteId: string; role?: string | null }[]) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:valider");
  if (denied) throw new Error("Permissions insuffisantes");

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: session.user.tenantId, ...siteFilterForModel("user", session.user) },
  });
  if (!user) throw new Error("Utilisateur non trouvé");

  const siteIds = sites.map((s) => s.siteId);

  // Vérifier que tous les sites appartiennent au tenant
  if (siteIds.length > 0) {
    const validSites = await prisma.site.findMany({
      where: { id: { in: siteIds }, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (validSites.length !== siteIds.length) {
      throw new Error("Un ou plusieurs sites sont invalides");
    }
  }

  // Supprimer les anciennes associations
  await prisma.userSite.deleteMany({
    where: { userId },
  });

  // Si aucun site sélectionné → siteId = null (accès tous sites)
  if (siteIds.length === 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { siteId: null },
    });
  } else {
    // Si un seul site, on garde aussi siteId pour compatibilité
    if (siteIds.length === 1) {
      await prisma.user.update({
        where: { id: userId },
        data: { siteId: siteIds[0] },
      });
    } else {
      // Multi-sites: siteId principal = null (le filtrage se fera via UserSite)
      await prisma.user.update({
        where: { id: userId },
        data: { siteId: null },
      });
    }

    // Créer les nouvelles associations avec rôle optionnel par site
    for (const s of sites) {
      await prisma.userSite.create({
        data: {
          userId,
          siteId: s.siteId,
          role: (s.role && s.role !== "INHERIT") ? s.role as Role : null,
        },
      });
    }
  }

  revalidatePath("/parametres");
  return { success: true };
}

export async function getUserSites(userId: string): Promise<{ siteId: string; role: string | null }[]> {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  // UserSite ne porte pas de tenantId propre : vérifier explicitement que l'utilisateur
  // appartient bien au tenant/périmètre de l'appelant avant de lire ses rattachements —
  // sans ce contrôle, un userId d'un autre tenant renverrait ses sites sans erreur.
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: session.user.tenantId, ...siteFilterForModel("user", session.user) },
    select: { id: true },
  });
  if (!user) throw new Error("Utilisateur non trouvé");

  const userSites = await prisma.userSite.findMany({
    where: { userId, ...siteFilterForModel("userSite", session.user) },
    select: { siteId: true, role: true },
  });

  return userSites.map((us) => ({ siteId: us.siteId, role: us.role }));
}
