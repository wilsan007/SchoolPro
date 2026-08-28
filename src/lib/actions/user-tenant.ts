"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { normaliserEmail } from "@/lib/email";
import { generateRandomPassword } from "@/lib/security/password";

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

  // Normalisation immédiate : l'adresse sert à la fois de clé de recherche et
  // de valeur stockée. Une majuscule laissée passer ici crée un compte que
  // personne ne peut plus retrouver à la connexion.
  const email = normaliserEmail(params.email);

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

  // Chercher l'utilisateur par email — recherche intentionnellement inter-tenants :
  // la fonction sert précisément à relier un compte existant (potentiellement
  // d'un autre établissement) au tenant cible. L'appartenance au tenant CIBLE a
  // déjà été vérifiée ci-dessus (SUPER_ADMIN ou TENANT_ADMIN dudit tenant) ;
  // aucune donnée d'un autre tenant n'est renvoyée à l'appelant au-delà de ce
  // que cette action doit précisément lier.
  // Insensible à la casse : rattacher un compte existant doit fonctionner
  // quelle que soit la casse sous laquelle il a été enregistré.
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true, password: true },
  });

  if (existingUser) {
    // Vérifier s'il est déjà dans ce tenant
    const existingUT = await prisma.userTenant.findUnique({
      where: {
        userId_tenantId: {
          userId: existingUser.id,
          tenantId: params.tenantId,
        },
      },
    });

    // Vérifier s'il possède déjà ce rôle dans UserRole
    // eslint-disable-next-line ecolpro/require-tenant-id -- la clé composite userId_tenantId_role inclut tenantId ; vérification d'existence du rôle
    const existingUserRole = await prisma.userRole.findUnique({
      where: {
        userId_tenantId_role: {
          userId: existingUser.id,
          tenantId: params.tenantId,
          role: params.role,
        },
      },
    });

    if (existingUT) {
      if (existingUT.isActive) {
        // L'utilisateur est déjà actif dans ce tenant.
        if (existingUserRole && existingUserRole.isActive) {
          // Il possède déjà ce rôle — refuser au lieu de dupliquer.
          throw new Error("Cet utilisateur possède déjà ce rôle dans cet établissement");
        }
        // Ajouter le rôle à UserRole sans changer le rôle actif.
        // eslint-disable-next-line ecolpro/require-tenant-id -- l'adhésion au tenant a été vérifiée ci-dessus ; ajout d'un rôle possédé
        await prisma.userRole.create({
          data: {
            userId: existingUser.id,
            tenantId: params.tenantId,
            role: params.role,
            isActive: true,
          },
        });
        // Créer l'enregistrement métier si nécessaire (Enseignant/Parent).
        await ensureBusinessRecord(existingUser.id, params.tenantId, params.role, params.email);
        revalidatePath("/parametres");
        return {
          success: true,
          message: `Rôle ${params.role} ajouté à ${existingUser.name} dans ${tenant.name}`,
        };
      }
      // Accès désactivé : le réactiver avec ce rôle.
      await prisma.userTenant.update({
        where: { id: existingUT.id },
        data: { isActive: true, role: params.role },
      });
      // Ajouter ou réactiver le rôle dans UserRole.
      if (existingUserRole) {
        // eslint-disable-next-line ecolpro/require-tenant-id -- existingUserRole a été obtenu par findUnique avec tenantId dans la clé composite ; réactivation d'un rôle possédé
        await prisma.userRole.update({
          where: { id: existingUserRole.id },
          data: { isActive: true },
        });
      } else {
        // eslint-disable-next-line ecolpro/require-tenant-id -- création d'un rôle pour un user dont l'adhésion au tenant a été vérifiée ci-dessus
        await prisma.userRole.create({
          data: {
            userId: existingUser.id,
            tenantId: params.tenantId,
            role: params.role,
            isActive: true,
          },
        });
      }
      await ensureBusinessRecord(existingUser.id, params.tenantId, params.role, params.email);
      return { success: true, message: `Accès réactivé pour ${existingUser.name}` };
    }

    // L'utilisateur existe mais n'est pas encore dans ce tenant :
    // créer l'adhésion + le rôle.
    await prisma.userTenant.create({
      data: {
        userId: existingUser.id,
        tenantId: params.tenantId,
        role: params.role,
        isActive: true,
        isDefault: false,
      },
    });
    // eslint-disable-next-line ecolpro/require-tenant-id -- l'adhésion au tenant a été vérifiée ci-dessus ; création du rôle possédé
    await prisma.userRole.create({
      data: {
        userId: existingUser.id,
        tenantId: params.tenantId,
        role: params.role,
        isActive: true,
      },
    });
    await ensureBusinessRecord(existingUser.id, params.tenantId, params.role, params.email);

    revalidatePath("/parametres");
    return { success: true, message: `${existingUser.name} ajouté à ${tenant.name}` };
  }

  // Créer un nouvel utilisateur avec mot de passe temporaire aléatoire
  const tempPassword = params.temporaryPassword || generateRandomPassword();
  const hashed = await bcrypt.hash(tempPassword, 10);

  const [firstName, ...restName] = email.split("@");
  const name = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  const newUser = await prisma.user.create({
    data: {
      email,
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
      userRoles: {
        create: {
          tenantId: params.tenantId,
          role: params.role,
          isActive: true,
        },
      },
    },
  });

  // Créer l'enregistrement métier si nécessaire
  await ensureBusinessRecord(newUser.id, params.tenantId, params.role, params.email);

  revalidatePath("/parametres");
  return {
    success: true,
    message: `Nouvel utilisateur ${newUser.email} créé et ajouté à ${tenant.name}. Mot de passe temporaire: ${tempPassword}`,
  };
}

/**
 * Crée l'enregistrement métier (Enseignant, Parent) correspondant à un
 * rôle, s'il n'existe pas déjà. Sans cet enregistrement, le switch-role
 * ne peut pas détecter les rôles disponibles pour cet utilisateur.
 */
async function ensureBusinessRecord(
  userId: string,
  tenantId: string,
  role: Role,
  email: string
): Promise<void> {
  if (role === "TEACHER" || role === "CLASS_TEACHER") {
    // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- self-lookup, vérification d'existence
    const existing = await prisma.enseignant.findFirst({
      where: { userId, tenantId },
      select: { id: true },
    });
    if (!existing) {
      await prisma.enseignant.create({
        data: { tenantId, userId, dateEntree: new Date() },
      });
    }
  } else if (role === "PARENT") {
    // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- self-lookup, vérification d'existence
    const existing = await prisma.parent.findFirst({
      where: { userId, tenantId },
      select: { id: true },
    });
    if (!existing) {
      const [prenom, ...rest] = email.split("@");
      const nom = rest.join("@") || prenom;
      await prisma.parent.create({
        data: {
          tenantId,
          userId,
          nom,
          prenom: prenom.charAt(0).toUpperCase() + prenom.slice(1),
          email,
          phone: "",
        },
      });
    }
  }
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

  // UserTenant relie un utilisateur à PLUSIEURS tenants par construction :
  // il n'existe pas de tenantId unique à filtrer ici, l'objet même de cette
  // fonction est d'énumérer tous les tenants de l'utilisateur. L'isolation
  // est portée par le contrôle d'autorisation ci-dessus (userId === appelant,
  // ou SUPER_ADMIN), pas par un filtre tenantId.
  // eslint-disable-next-line ecolpro/require-tenant-id
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
