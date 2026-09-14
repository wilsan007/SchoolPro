"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { siteFilterForModel, siteIdForCreate } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { normaliserEmail } from "@/lib/email";
import { generateRandomPassword } from "@/lib/security/password";
import { auditFire } from "@/lib/audit";

const UserSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  email: z.string().email("Email invalide").transform(normaliserEmail),
  role: z.enum([
    "TENANT_ADMIN",
    "PRINCIPAL",
    "SECRETARY",
    "TEACHER",
    "CLASS_TEACHER",
    "COUNSELOR",
    "NURSE",
    "ACCOUNTANT",
    "CAISSIER",
    "PARENT",
  ]),
  phone: z.string().optional(),
  password: z.string().min(8, "Min. 8 caractères").optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  // Champs spécifiques aux enseignants — obligatoires si role = TEACHER/CLASS_TEACHER
  matiereId: z.string().optional().nullable(),
  classeIds: z.array(z.string()).default([]),
  // Si role = CLASS_TEACHER, la classe dont il est prof principal
  classePrincipaleId: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.role === "TEACHER" || data.role === "CLASS_TEACHER") {
    if (!data.matiereId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La matière est obligatoire pour un enseignant",
        path: ["matiereId"],
      });
    }
    if (!data.classeIds || data.classeIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Au moins une classe est obligatoire pour un enseignant",
        path: ["classeIds"],
      });
    }
    if (data.role === "CLASS_TEACHER" && !data.classePrincipaleId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La classe principale est obligatoire pour un prof principal",
        path: ["classePrincipaleId"],
      });
    }
  }
});

export type UserFormData = z.infer<typeof UserSchema>;

export async function getUsersForTenant() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  // Le périmètre était reconstruit à la main ici, et il était fail-open :
  // sans site sélectionné, `{ siteId: siteId ?? undefined }` devenait une
  // clause vide, l'`OR` était donc satisfait par tout le monde et l'annuaire
  // complet de l'établissement remontait à un compte pourtant borné à un
  // site. Le helper partagé, lui, ne renvoie rien faute de périmètre.
  return prisma.user.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilterForModel("user", session.user),
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
  // `User.email` est unique au niveau de la plateforme entière, pas du tenant :
  // le contrôle d'unicité doit donc être inter-tenants et inter-sites, sinon on
  // laisserait créer un doublon qui échouerait ensuite en base. Seule
  // l'existence est utilisée, aucune donnée de l'autre tenant n'est exposée.
  // Unicité insensible à la casse : les comptes déjà enregistrés avec une
  // majuscule doivent être détectés comme doublons.
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
  const existing = await prisma.user.findFirst({
    where: { email: { equals: v.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) throw new Error("Un utilisateur avec cet email existe déjà");

  const password = v.password || generateRandomPassword();
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
      // Créer l'entrée UserRole pour le multi-rôle
      userRoles: {
        create: {
          tenantId: session.user.tenantId,
          role: v.role,
          isActive: v.isActive,
        },
      },
    },
  });

  // Auto-create Enseignant record for teacher roles + affectations
  if (v.role === "TEACHER" || v.role === "CLASS_TEACHER") {
    const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
    // Déduire le site depuis la première classe sélectionnée.
    // L'enseignant n'a accès qu'au site de ses classes.
    let siteIdDeduit: string | null = null;
    if (v.classeIds.length > 0) {
      const premiereClasse = await prisma.classe.findFirst({
        where: { id: v.classeIds[0], tenantId: session.user.tenantId, ...(anneeCourante ? { annee: anneeCourante } : {}), ...siteFilterForModel("classe", session.user) },
        select: { siteId: true },
      });
      siteIdDeduit = premiereClasse?.siteId ?? null;
    }

    // Mettre à jour le site du User si déduit.
    // On vient de créer ce User (newUser.id) dans ce tenant, donc l'update
    // est sûr — pas de risque de modification cross-tenant.
    if (siteIdDeduit && !newUser.siteId) {
      // eslint-disable-next-line ecolpro/require-tenant-id -- newUser vient d'être créé dans ce tenant
      await prisma.user.update({
        where: { id: newUser.id },
        data: { siteId: siteIdDeduit },
      });
    }

    const enseignant = await prisma.enseignant.create({
      data: {
        tenantId: session.user.tenantId,
        userId: newUser.id,
        dateEntree: new Date(),
        // Lier l'enseignant au site déduit
        sites: siteIdDeduit
          ? { create: { siteId: siteIdDeduit } }
          : undefined,
      },
    });

    // Créer les affectations enseignant → classe → matière
    if (v.matiereId && v.classeIds.length > 0) {
      await prisma.affectationEnseignant.createMany({
        data: v.classeIds.map((classeId) => ({
          tenantId: session.user.tenantId!,
          enseignantId: enseignant.id,
          classeId,
          matiereId: v.matiereId!,
        })),
        skipDuplicates: true,
      });
    }

    // Si prof principal, assigner la classe principale
    if (v.role === "CLASS_TEACHER" && v.classePrincipaleId) {
      await prisma.classe.update({
        where: { id: v.classePrincipaleId, tenantId: session.user.tenantId },
        data: { profPrincipalId: enseignant.id },
      });
    }
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
    where: {
      id: userId,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("user", session.user),
    },
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
    where: {
      id: userId,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("user", session.user),
    },
  });
  if (!user) throw new Error("Utilisateur non trouvé");

  // MET-H7 (audit v2) : la suppression définitive détruit des données financières
  // (RemiseCaisse.caissier → Cascade) et des comptes d'autres établissements
  // (userTenant.deleteMany sans filtre tenantId). On désactive le compte et
  // on ne supprime que l'adhésion au tenant courant.
  // La suppression définitive est une opération séparée, réservée à SUPER_ADMIN
  // avec une procédure de purge documentée.

  // 1. Désactiver le compte (soft delete) — préserve les données financières.
  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });

  // 2. Supprimer uniquement l'adhésion au tenant courant, pas les autres.
  // eslint-disable-next-line ecolpro/require-tenant-id -- tenantId explicite ci-dessous
  await prisma.userTenant.deleteMany({
    where: { userId, tenantId: session.user.tenantId },
  }).catch((e) => console.warn("[non-fatal]", e));

  // 3. Supprimer les affectations de site du tenant courant uniquement.
  await prisma.userSite.deleteMany({
    where: { userId, site: { tenantId: session.user.tenantId } },
  }).catch((e) => console.warn("[non-fatal]", e));

  auditFire({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "user:delete",
    verdict: "ALLOWED",
    resource: "user",
    resourceId: userId,
    metadata: { deletedEmail: user.email, softDelete: true },
  });

  revalidatePath("/parametres");
  return { success: true };
}
