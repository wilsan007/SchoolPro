"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { normaliserEmail } from "@/lib/email";
import { envoyerEmailVerification } from "@/lib/email-verification";

const RegisterSchema = z.object({
  // Établissement
  schoolName: z.string().min(2, "Le nom de l'établissement est requis"),
  schoolType: z.enum(["maternelle", "primaire", "college", "lycee", "mixte"]),
  country: z.string().default("SN"),
  city: z.string().min(1, "La ville est requise"),
  address: z.string().optional(),
  phone: z.string().min(1, "Le téléphone est requis"),
  email: z.string().email("Email invalide"),

  // Administrateur
  adminFirstName: z.string().min(1, "Le prénom est requis"),
  adminLastName: z.string().min(1, "Le nom est requis"),
  adminEmail: z.string().email("Email administrateur invalide").transform(normaliserEmail),
  adminPassword: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères"),
  adminPhone: z.string().optional(),

  // Plan
  plan: z.enum(["STARTER", "PRO", "BUSINESS", "ENTERPRISE"]).default("STARTER"),

  // Synchronisation locale (sauvegarde automatique sur PC du principal)
  syncServerNick: z.string().min(2).max(100).optional(),
  syncInterval: z.union([z.literal(30), z.literal(60)]).default(60),
  syncEnabled: z.boolean().default(true),
});

export type RegisterFormData = z.infer<typeof RegisterSchema>;

export async function registerTenant(data: RegisterFormData) {
  const parsed = RegisterSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const values = parsed.data;

  // Inscription publique : aucun tenant n'existe encore pour cet appelant (on
  // est justement en train d'en créer un) — la recherche d'unicité de l'email
  // administrateur est nécessairement inter-tenants, comme pour la connexion
  // (cf. src/lib/auth.ts).
  // Insensible à la casse : un compte enregistré avec une majuscule doit
  // être détecté comme doublon (cf. src/lib/email.ts).
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: values.adminEmail, mode: "insensitive" } },
    select: { id: true },
  });
  if (existingUser) {
    throw new Error("Un compte existe déjà avec cet email administrateur");
  }

  const slug = values.schoolName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const existingSlug = await prisma.tenant.findUnique({ where: { slug } });
  if (existingSlug) {
    throw new Error("Un établissement avec ce nom existe déjà");
  }

  const hashedPassword = await bcrypt.hash(values.adminPassword, 10);
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 30);

  const tenant = await prisma.tenant.create({
    data: {
      name: values.schoolName,
      slug,
      plan: values.plan,
      status: "TRIAL",
      trialEndsAt,
      address: values.address || null,
      city: values.city,
      country: values.country,
      phone: values.phone,
      email: values.email,
    },
  });

  const newUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: values.adminEmail,
      name: `${values.adminFirstName} ${values.adminLastName}`,
      firstName: values.adminFirstName,
      lastName: values.adminLastName,
      password: hashedPassword,
      phone: values.adminPhone || null,
      role: "TENANT_ADMIN",
      isActive: true,
      // Créer l'entrée UserTenant pour le multi-tenant
      userTenants: {
        create: {
          tenantId: tenant.id,
          role: "TENANT_ADMIN",
          isActive: true,
          isDefault: true,
        },
      },
      // Créer l'entrée UserRole pour le multi-rôle
      userRoles: {
        create: {
          tenantId: tenant.id,
          role: "TENANT_ADMIN",
          isActive: true,
        },
      },
    },
  });

  // Créer la configuration de synchronisation locale si demandée
  if (values.syncServerNick) {
    const { randomBytes } = await import("crypto");
    const apiKey = "esk_" + randomBytes(24).toString("hex");
    await prisma.syncConfig.create({
      data: {
        tenantId: tenant.id,
        serverNick: values.syncServerNick,
        syncInterval: values.syncInterval,
        syncEnabled: values.syncEnabled,
        apiKey,
      },
    });
  }

  revalidatePath("/");

  try {
    await envoyerEmailVerification(values.adminEmail, tenant.name);
  } catch (err) {
    console.error("[register] Envoi email de vérification échoué:", err);
  }

  return { success: true, slug: tenant.slug };
}
