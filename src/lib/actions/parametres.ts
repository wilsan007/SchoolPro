"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { siteFilterForModel, siteIdForCreate, requireSiteIdForCreate } from "@/lib/site-scope";
import { niveauRequiresProfPrincipal } from "@/lib/utils-classe";
import type { Role } from "@prisma/client";

// ============================================================
// ÉTABLISSEMENT
// ============================================================

const EtablissementSchema = z.object({
  name: z.string().min(2, "Le nom est requis"),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default("SN"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().optional(),
  siret: z.string().optional(),
  currentYear: z.string().min(1, "L'année scolaire est requise"),
  notationMax: z.number().min(1).max(100),
  langue: z.string().default("fr"),
  timezone: z.string().default("Africa/Dakar"),
  currency: z.string().default("DJF"),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
});

export type EtablissementFormData = z.infer<typeof EtablissementSchema>;

export async function updateEtablissement(data: EtablissementFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Permissions insuffisantes");
  }

  const parsed = EtablissementSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;
  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: {
      name: v.name,
      address: v.address || null,
      city: v.city || null,
      country: v.country,
      phone: v.phone || null,
      email: v.email || null,
      website: v.website || null,
      siret: v.siret || null,
      currentYear: v.currentYear,
      notationMax: v.notationMax,
      langue: v.langue,
      timezone: v.timezone,
      currency: v.currency,
      primaryColor: v.primaryColor || null,
      secondaryColor: v.secondaryColor || null,
    },
  });

  revalidatePath("/parametres");
  return { success: true };
}

export async function getEtablissementData() {
  const session = await auth();
  if (!session?.user?.tenantId) return null;

  return prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
  });
}

// ============================================================
// UTILISATEURS
// ============================================================

const UserSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  email: z.string().email("Email invalide"),
  role: z.enum([
    "TENANT_ADMIN",
    "PRINCIPAL",
    "SECRETARY",
    "TEACHER",
    "CLASS_TEACHER",
    "COUNSELOR",
    "NURSE",
    "ACCOUNTANT",
    "PARENT",
  ]),
  phone: z.string().optional(),
  password: z.string().min(8, "Min. 8 caractères").optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export type UserFormData = z.infer<typeof UserSchema>;

export async function getUsersForTenant() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  const isAdmin = session.user.role === "TENANT_ADMIN" || session.user.role === "SUPER_ADMIN";
  const siteId = (session.user as { siteId?: string | null }).siteId ?? null;
  const siteIds = (session.user as { siteIds?: string[] }).siteIds;

  return prisma.user.findMany({
    where: isAdmin
      ? { tenantId: session.user.tenantId }
      : {
          tenantId: session.user.tenantId,
          OR: [
            { siteId: siteId ?? undefined },
            ...(siteIds && siteIds.length > 0 ? [{ siteId: { in: siteIds } }] : []),
            { userSites: { some: { siteId: siteId ?? "" } } },
          ],
        },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createUser(data: UserFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const parsed = UserSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: v.email } });
  if (existing) throw new Error("Un utilisateur avec cet email existe déjà");

  const password = v.password || "EcolPro2026!";
  const hashed = await bcrypt.hash(password, 10);

  const [firstName, ...restName] = v.name.split(" ");
  const lastName = restName.join(" ") || firstName;

  const newUser = await prisma.user.create({
    data: {
      tenantId: session.user.tenantId,
      siteId: siteIdForCreate(session.user),
      name: v.name,
      email: v.email,
      role: v.role,
      phone: v.phone || null,
      password: hashed,
      isActive: v.isActive,
      // Créer l'entrée UserTenant pour le multi-tenant
      userTenants: {
        create: {
          tenantId: session.user.tenantId,
          role: v.role,
          isActive: v.isActive,
          isDefault: true,
        },
      },
    },
  });

  // Auto-create Enseignant record for teacher roles
  if (v.role === "TEACHER" || v.role === "CLASS_TEACHER") {
    await prisma.enseignant.create({
      data: {
        tenantId: session.user.tenantId,
        userId: newUser.id,
        dateEntree: new Date(),
      },
    });
  }

  // Auto-create Parent record for parent role
  if (v.role === "PARENT") {
    await prisma.parent.create({
      data: {
        tenantId: session.user.tenantId,
        userId: newUser.id,
        nom: lastName,
        prenom: firstName,
        email: v.email,
        phone: v.phone || "",
      },
    });
  }

  revalidatePath("/parametres");
  return { success: true, userId: newUser.id };
}

export async function toggleUserActive(userId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: session.user.tenantId },
  });
  if (!user) throw new Error("Utilisateur non trouvé");

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive },
  });

  revalidatePath("/parametres");
  return { success: true };
}

export async function deleteUser(userId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  if (userId === session.user.id) throw new Error("Vous ne pouvez pas supprimer votre propre compte");

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: session.user.tenantId },
  });
  if (!user) throw new Error("Utilisateur non trouvé");

  // Supprimer les enregistrements liés pour éviter les violations de clés étrangères
  await prisma.enseignant.deleteMany({ where: { userId, tenantId: session.user.tenantId } }).catch(() => {});
  await prisma.parent.deleteMany({ where: { userId, tenantId: session.user.tenantId } }).catch(() => {});
  await prisma.userSite.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.userTenant.deleteMany({ where: { userId } }).catch(() => {});

  await prisma.user.delete({ where: { id: userId } });

  revalidatePath("/parametres");
  return { success: true };
}

// ============================================================
// CLASSES
// ============================================================

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

  const siteId = (session.user as { siteId?: string | null }).siteId ?? null;
  const siteIds = (session.user as { siteIds?: string[] }).siteIds;

  const siteFilter = siteFilterForModel("classe", session.user);
  return prisma.classe.findMany({
    where: { tenantId: session.user.tenantId, ...siteFilter },
    include: {
      _count: { select: { eleves: true } },
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
      where: { id: v.profPrincipalId, tenantId: session.user.tenantId },
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

export async function deleteClasse(classeId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const classe = await prisma.classe.findFirst({
    where: { id: classeId, tenantId: session.user.tenantId },
    include: { _count: { select: { eleves: true } } },
  });
  if (!classe) throw new Error("Classe non trouvée");
  if (classe._count.eleves > 0) throw new Error("Impossible de supprimer une classe avec des élèves");

  await prisma.classe.delete({ where: { id: classeId } });

  revalidatePath("/parametres");
  revalidatePath("/eleves");
  revalidateTag("classes-list");
  revalidateTag("dashboard-data");
  revalidateTag("eleves-stats");
  return { success: true };
}

// ============================================================
// MATIÈRES
// ============================================================

const MatiereSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  code: z.string().min(1, "Le code est requis"),
  coefficient: z.number().min(0.5).default(1),
  couleur: z.string().optional(),
  niveau: z.string().optional(),
});

export type MatiereFormData = z.infer<typeof MatiereSchema>;

export async function getMatieresForSettings() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  return prisma.matiere.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { nom: "asc" },
  });
}

export async function createMatiere(data: MatiereFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const parsed = MatiereSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;
  await prisma.matiere.create({
    data: {
      tenantId: session.user.tenantId,
      nom: v.nom,
      code: v.code,
      coefficient: v.coefficient,
      couleur: v.couleur || null,
      niveau: v.niveau || null,
    },
  });

  revalidatePath("/parametres");
  return { success: true };
}

export async function deleteMatiere(matiereId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const matiere = await prisma.matiere.findFirst({
    where: { id: matiereId, tenantId: session.user.tenantId },
  });
  if (!matiere) throw new Error("Matière non trouvée");

  await prisma.matiere.delete({ where: { id: matiereId } });

  revalidatePath("/parametres");
  return { success: true };
}

// ============================================================
// PARENTS & CONTACTS
// ============================================================

const ParentSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  prenom: z.string().min(1, "Le prénom est requis"),
  phone: z.string().min(1, "Le téléphone est requis"),
  phone2: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telegramChatId: z.string().optional(),
  profession: z.string().optional(),
  adresse: z.string().optional(),
});

export type ParentFormData = z.infer<typeof ParentSchema>;

export async function getParentsForSettings() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  const siteId = (session.user as { siteId?: string | null }).siteId ?? null;
  const siteIds = (session.user as { siteIds?: string[] }).siteIds;

  return prisma.parent.findMany({
    where: { tenantId: session.user.tenantId, enfants: { some: { eleve: { ...siteFilterForModel("parent", session.user) } } } },
    include: {
      enfants: {
        include: {
          eleve: {
            select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } },
          },
        },
      },
      user: { select: { id: true, email: true, isActive: true } },
    },
    orderBy: { nom: "asc" },
  });
}

export async function getElevesForLinking() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  const siteFilter = siteFilterForModel("eleve", session.user);

  return prisma.eleve.findMany({
    where: { tenantId: session.user.tenantId, statut: "ACTIF", ...siteFilter },
    select: {
      id: true,
      nom: true,
      prenom: true,
      matricule: true,
      classe: { select: { nom: true, niveau: true } },
    },
    orderBy: [{ classe: { nom: "asc" } }, { nom: "asc" }, { prenom: "asc" }],
  });
}

export async function createParent(data: ParentFormData & { eleveIds?: string[] }) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const parsed = ParentSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;
  const parent = await prisma.parent.create({
    data: {
      tenantId: session.user.tenantId,
      nom: v.nom,
      prenom: v.prenom,
      phone: v.phone,
      phone2: v.phone2 || null,
      email: v.email || null,
      telegramChatId: v.telegramChatId || null,
      profession: v.profession || null,
      adresse: v.adresse || null,
    },
  });

  // Link to students if provided
  if (data.eleveIds && data.eleveIds.length > 0) {
    for (const eleveId of data.eleveIds) {
      const existing = await prisma.eleveParent.findUnique({
        where: { eleveId_parentId: { eleveId, parentId: parent.id } },
      });
      if (!existing) {
        await prisma.eleveParent.create({
          data: { eleveId, parentId: parent.id, lien: "TUTEUR", isGardien: true },
        });
      }
    }
  }

  revalidatePath("/parametres");
  return { success: true };
}

export async function linkParentToEleves(parentId: string, eleveIds: string[], lien: string = "TUTEUR") {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const parent = await prisma.parent.findFirst({
    where: { id: parentId, tenantId: session.user.tenantId },
  });
  if (!parent) throw new Error("Parent non trouvé");

  for (const eleveId of eleveIds) {
    const existing = await prisma.eleveParent.findUnique({
      where: { eleveId_parentId: { eleveId, parentId } },
    });
    if (!existing) {
      await prisma.eleveParent.create({
        data: { eleveId, parentId, lien: lien as any, isGardien: true },
      });
    }
  }

  revalidatePath("/parametres");
  return { success: true };
}

export async function unlinkParentFromEleve(parentId: string, eleveId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  await prisma.eleveParent.delete({
    where: { eleveId_parentId: { eleveId, parentId } },
  });

  revalidatePath("/parametres");
  return { success: true };
}

export async function updateParentPhone(parentId: string, phone: string, telegramChatId?: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const parent = await prisma.parent.findFirst({
    where: { id: parentId, tenantId: session.user.tenantId },
  });
  if (!parent) throw new Error("Parent non trouvé");

  await prisma.parent.update({
    where: { id: parentId },
    data: {
      phone,
      telegramChatId: telegramChatId || null,
    },
  });

  revalidatePath("/parametres");
  return { success: true };
}

export async function deleteParent(parentId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const parent = await prisma.parent.findFirst({
    where: { id: parentId, tenantId: session.user.tenantId },
  });
  if (!parent) throw new Error("Parent non trouvé");

  await prisma.parent.delete({ where: { id: parentId } });

  revalidatePath("/parametres");
  return { success: true };
}

export async function updateUserPhone(userId: string, phone: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: session.user.tenantId },
  });
  if (!user) throw new Error("Utilisateur non trouvé");

  await prisma.user.update({
    where: { id: userId },
    data: { phone: phone || null },
  });

  // Also update parent phone if user is linked to a parent
  if (phone) {
    await prisma.parent.updateMany({
      where: { userId: userId },
      data: { phone },
    });
  }

  revalidatePath("/parametres");
  return { success: true };
}

// ============================================================
// RÈGLES D'APPRÉCIATION / CLÔTURE DES PÉRIODES / SIGNATURE
// ============================================================

export async function getReglesAppreciation() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  return prisma.reglesAppreciation.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ contexte: "asc" }, { seuilMin: "asc" }],
  });
}

export async function getPeriodesForCloture() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId: session.user.tenantId, isCurrent: true },
  });
  if (!annee) return [];

  return prisma.periode.findMany({
    where: { anneeId: annee.id },
    orderBy: { numero: "asc" },
  });
}

// ============================================================
// SITES / CAMPUSES
// ============================================================

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
          eleves: true,
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
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Permissions insuffisantes");
  }

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
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Permissions insuffisantes");
  }

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
    errorMap: () => ({ message: "Veuillez sélectionner une raison" }),
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
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Permissions insuffisantes");
  }

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
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Permissions insuffisantes");
  }

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
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") return [];

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
          eleves: true,
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
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: session.user.tenantId },
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

  const userSites = await prisma.userSite.findMany({
    where: { userId },
    select: { siteId: true, role: true },
  });

  return userSites.map((us) => ({ siteId: us.siteId, role: us.role }));
}
