"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";

/**
 * Ajoute un utilisateur existant (par email) à un tenant.
 * Si l'utilisateur n'existe pas encore, on le crée avec un mot de passe temporaire.
 *
 * @example
 * await addUserToTenant({
 *   email: "prof@ecole.com",
 *   tenantId: "tenant-xxx",
 *   role: "TEACHER",
 * });
 */
export async function addUserToTenant(params: {
  email: string;
  tenantId: string;
  role: Role;
  temporaryPassword?: string;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    throw new Error("Non autorisé");
  }

  // Seuls TENANT_ADMIN et SUPER_ADMIN peuvent ajouter des utilisateurs
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Permissions insuffisantes");
  }

  // Un TENANT_ADMIN ne peut agir que sur un établissement dont il est
  // effectivement administrateur : sans ce contrôle, l'admin de l'école A
  // pourrait ajouter des utilisateurs à l'école B en forgeant `tenantId`.
  if (session.user.role !== "SUPER_ADMIN") {
    const callerAccess = await prisma.userTenant.findFirst({
      where: {
        userId: session.user.id,
        tenantId: params.tenantId,
        isActive: true,
        role: "TENANT_ADMIN",
      },
      select: { id: true },
    });
    if (!callerAccess) {
      throw new Error("Vous n'administrez pas cet établissement");
    }
  }

  // Vérifier que le tenant cible existe
  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) {
    throw new Error("Établissement introuvable");
  }

  // Chercher l'utilisateur par email
  const existingUser = await prisma.user.findUnique({
    where: { email: params.email },
    select: { id: true, name: true, password: true },
  });

  if (existingUser) {
    // Vérifier qu'il n'est pas déjà dans ce tenant
    const existingUT = await prisma.userTenant.findUnique({
      where: {
        userId_tenantId: {
          userId: existingUser.id,
          tenantId: params.tenantId,
        },
      },
    });

    if (existingUT) {
      if (existingUT.isActive) {
        throw new Error("Cet utilisateur a déjà accès à cet établissement");
      }
      // Réactiver l'accès
      await prisma.userTenant.update({
        where: { id: existingUT.id },
        data: { isActive: true, role: params.role },
      });
      return { success: true, message: `Accès réactivé pour ${existingUser.name}` };
    }

    // Ajouter l'utilisateur au tenant
    await prisma.userTenant.create({
      data: {
        userId: existingUser.id,
        tenantId: params.tenantId,
        role: params.role,
        isActive: true,
        isDefault: false,
      },
    });

    revalidatePath("/parametres");
    return { success: true, message: `${existingUser.name} ajouté à ${tenant.name}` };
  }

  // Créer un nouvel utilisateur avec mot de passe temporaire
  const tempPassword = params.temporaryPassword || "EcolPro2026!";
  const hashed = await bcrypt.hash(tempPassword, 10);

  const [firstName, ...restName] = params.email.split("@");
  const name = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  const newUser = await prisma.user.create({
    data: {
      email: params.email,
      name,
      password: hashed,
      role: params.role,
      tenantId: params.tenantId,
      isActive: true,
      userTenants: {
        create: {
          tenantId: params.tenantId,
          role: params.role,
          isActive: true,
          isDefault: true,
        },
      },
    },
  });

  revalidatePath("/parametres");
  return {
    success: true,
    message: `Nouvel utilisateur ${newUser.email} créé et ajouté à ${tenant.name}. Mot de passe temporaire: ${tempPassword}`,
  };
}

/**
 * Retire l'accès d'un utilisateur à un tenant (sans supprimer le compte).
 */
export async function removeUserFromTenant(userId: string, tenantId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    throw new Error("Non autorisé");
  }

  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Permissions insuffisantes");
  }

  // Ne pas se retirer soi-même
  if (userId === session.user.id) {
    throw new Error("Vous ne pouvez pas vous retirer vous-même");
  }

  // Même contrôle que pour l'ajout : le demandeur doit administrer le tenant ciblé.
  if (session.user.role !== "SUPER_ADMIN") {
    const callerAccess = await prisma.userTenant.findFirst({
      where: {
        userId: session.user.id,
        tenantId,
        isActive: true,
        role: "TENANT_ADMIN",
      },
      select: { id: true },
    });
    if (!callerAccess) {
      throw new Error("Vous n'administrez pas cet établissement");
    }
  }

  const userTenant = await prisma.userTenant.findUnique({
    where: {
      userId_tenantId: { userId, tenantId },
    },
  });

  if (!userTenant) {
    throw new Error("Cet utilisateur n'a pas accès à cet établissement");
  }

  // Désactiver l'accès (soft delete)
  await prisma.userTenant.update({
    where: { id: userTenant.id },
    data: { isActive: false },
  });

  revalidatePath("/parametres");
  return { success: true, message: "Accès retiré" };
}

/**
 * Récupère tous les tenants d'un utilisateur.
 */
export async function getUserTenants(userId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Non autorisé");
  }

  // Un user ne peut voir que ses propres tenants (sauf SUPER_ADMIN)
  if (userId !== session.user.id && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Permissions insuffisantes");
  }

  return prisma.userTenant.findMany({
    where: { userId, isActive: true },
    include: {
      tenant: {
        select: { id: true, name: true, slug: true, logoUrl: true },
      },
    },
    orderBy: { isDefault: "desc" },
  });
}
