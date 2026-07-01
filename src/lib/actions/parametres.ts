"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";

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
  currency: z.string().default("XOF"),
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

  return prisma.user.findMany({
    where: { tenantId: session.user.tenantId },
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
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
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

  await prisma.user.create({
    data: {
      tenantId: session.user.tenantId,
      name: v.name,
      email: v.email,
      role: v.role,
      phone: v.phone || null,
      password: hashed,
      isActive: v.isActive,
    },
  });

  revalidatePath("/parametres");
  return { success: true };
}

export async function toggleUserActive(userId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
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
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Permissions insuffisantes");
  }

  if (userId === session.user.id) throw new Error("Vous ne pouvez pas supprimer votre propre compte");

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: session.user.tenantId },
  });
  if (!user) throw new Error("Utilisateur non trouvé");

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
});

export type ClasseFormData = z.infer<typeof ClasseSchema>;

export async function getClassesForSettings() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  return prisma.classe.findMany({
    where: { tenantId: session.user.tenantId },
    include: {
      _count: { select: { eleves: true } },
      profPrincipal: { select: { user: { select: { name: true } } } },
    },
    orderBy: [{ niveau: "asc" }, { nom: "asc" }],
  });
}

export async function createClasse(data: ClasseFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const parsed = ClasseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;
  await prisma.classe.create({
    data: {
      tenantId: session.user.tenantId,
      nom: v.nom,
      niveau: v.niveau,
      filiere: v.filiere || null,
      effectifMax: v.effectifMax,
      annee: v.annee,
    },
  });

  revalidatePath("/parametres");
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
