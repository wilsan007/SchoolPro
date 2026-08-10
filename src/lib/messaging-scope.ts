import prisma from "@/lib/prisma";
import type { Role, ConversationType, ParticipantRole } from "@prisma/client";

interface SessionUser {
  id: string;
  tenantId: string;
  role: Role;
  siteId?: string | null;
}

/**
 * Détermine quels types de conversation un rôle peut créer.
 */
export function getAllowedConversationTypes(role: Role): ConversationType[] {
  switch (role) {
    case "SUPER_ADMIN":
    case "TENANT_ADMIN":
      return [
        "DIRECT",
        "CLASS_ANNOUNCEMENT",
        "CLASS_DISCUSSION",
        "ADMIN_BROADCAST",
        "PARENT_TEACHER",
        "PARENT_ADMIN",
        "STAFF_GROUP",
        "FREE",
      ];
    case "PRINCIPAL":
      return [
        "DIRECT",
        "CLASS_ANNOUNCEMENT",
        "CLASS_DISCUSSION",
        "PARENT_TEACHER",
        "PARENT_ADMIN",
        "STAFF_GROUP",
        "FREE",
      ];
    case "SECRETARY":
      return ["DIRECT", "CLASS_ANNOUNCEMENT", "PARENT_ADMIN", "FREE"];
    case "TEACHER":
    case "CLASS_TEACHER":
      return ["DIRECT", "CLASS_DISCUSSION", "PARENT_TEACHER", "STAFF_GROUP"];
    case "COUNSELOR":
      return ["DIRECT", "PARENT_ADMIN", "STAFF_GROUP"];
    case "ACCOUNTANT":
      return ["DIRECT", "PARENT_ADMIN"];
    case "PARENT":
      return ["DIRECT", "PARENT_TEACHER", "PARENT_ADMIN"];
    case "STUDENT":
      return []; // reply only
    default:
      return ["DIRECT"];
  }
}

/**
 * Détermine le rôle d'un participant dans une conversation.
 */
export function getParticipantRole(
  conversationType: ConversationType,
  userId: string,
  createdBy: string,
  userRole: Role
): ParticipantRole {
  // Le créateur est toujours ADMIN
  if (userId === createdBy) return "ADMIN";

  // Les admins/directeurs sont ADMIN dans toute conversation de leur tenant
  if (
    userRole === "SUPER_ADMIN" ||
    userRole === "TENANT_ADMIN" ||
    userRole === "PRINCIPAL"
  ) {
    return "ADMIN";
  }

  // Dans une annonce, les autres sont READONLY
  if (conversationType === "CLASS_ANNOUNCEMENT" || conversationType === "ADMIN_BROADCAST") {
    return "READONLY";
  }

  return "MEMBER";
}

/**
 * Récupère les destinataires possibles pour un utilisateur selon son rôle.
 * - Parent: enseignants de ses enfants + administration
 * - Enseignant: ses classes + parents de ses élèves
 * - Admin: tous les utilisateurs du tenant
 */
export async function getPossibleRecipients(
  user: SessionUser,
  type: ConversationType,
  classeId?: string
): Promise<{ id: string; name: string | null; role: Role; avatarUrl: string | null }[]> {
  const { id: userId, tenantId, role } = user;

  if (role === "SUPER_ADMIN" || role === "TENANT_ADMIN" || role === "PRINCIPAL" || role === "SECRETARY") {
    // Admin: tous les utilisateurs du tenant
    if (type === "CLASS_ANNOUNCEMENT" || type === "CLASS_DISCUSSION") {
      // Pour une conversation de classe, on retourne les classes, pas les users
      return [];
    }
    return prisma.user.findMany({
      where: { tenantId, id: { not: userId }, active: true },
      select: { id: true, name: true, role: true, avatarUrl: true },
    });
  }

  if (role === "TEACHER" || role === "CLASS_TEACHER") {
    if (type === "CLASS_DISCUSSION" || type === "CLASS_ANNOUNCEMENT") {
      // Les classes de l'enseignant
      return [];
    }
    if (type === "PARENT_TEACHER") {
      // Parents des élèves de ses classes
      const enseignant = await prisma.enseignant.findFirst({
        where: { userId, tenantId },
        select: { id: true },
      });
      if (!enseignant) return [];

      const eleves = await prisma.eleve.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { classe: { profPrincipalId: enseignant.id } },
            // TODO: ajouter les classes où l'enseignant donne cours via EmploiTemps
          ],
        },
        include: {
          parents: { include: { parent: { include: { user: true } } } },
        },
      });

      const parentUsers = new Map<string, { id: string; name: string | null; role: Role; avatarUrl: string | null }>();
      for (const eleve of eleves) {
        for (const ep of eleve.parents) {
          if (ep.parent.user) {
            parentUsers.set(ep.parent.user.id, {
              id: ep.parent.user.id,
              name: ep.parent.user.name,
              role: ep.parent.user.role,
              avatarUrl: ep.parent.user.avatarUrl,
            });
          }
        }
      }
      return Array.from(parentUsers.values());
    }
    // STAFF_GROUP: autres enseignants
    if (type === "STAFF_GROUP") {
      return prisma.user.findMany({
        where: {
          tenantId,
          id: { not: userId },
          active: true,
          role: { in: ["TEACHER", "CLASS_TEACHER", "PRINCIPAL", "COUNSELOR"] },
        },
        select: { id: true, name: true, role: true, avatarUrl: true },
      });
    }
    // DIRECT: tous
    return prisma.user.findMany({
      where: { tenantId, id: { not: userId }, active: true },
      select: { id: true, name: true, role: true, avatarUrl: true },
    });
  }

  if (role === "PARENT") {
    if (type === "PARENT_TEACHER") {
      // Enseignants des enfants du parent
      const parent = await prisma.parent.findFirst({
        where: { userId, tenantId },
        select: { id: true },
      });
      if (!parent) return [];

      const eleves = await prisma.eleve.findMany({
        where: {
          tenantId,
          deletedAt: null,
          parents: { some: { parentId: parent.id } },
        },
        include: {
          classe: { include: { profPrincipal: { include: { user: true } } } },
        },
      });

      const teacherUsers = new Map<string, { id: string; name: string | null; role: Role; avatarUrl: string | null }>();
      for (const eleve of eleves) {
        if (eleve.classe?.profPrincipal?.user) {
          teacherUsers.set(eleve.classe.profPrincipal.user.id, {
            id: eleve.classe.profPrincipal.user.id,
            name: eleve.classe.profPrincipal.user.name,
            role: eleve.classe.profPrincipal.user.role,
            avatarUrl: eleve.classe.profPrincipal.user.avatarUrl,
          });
        }
      }
      return Array.from(teacherUsers.values());
    }
    if (type === "PARENT_ADMIN") {
      // Administration du tenant
      return prisma.user.findMany({
        where: {
          tenantId,
          id: { not: userId },
          active: true,
          role: { in: ["TENANT_ADMIN", "PRINCIPAL", "SECRETARY", "ACCOUNTANT", "SUPER_ADMIN"] },
        },
        select: { id: true, name: true, role: true, avatarUrl: true },
      });
    }
    // DIRECT: enseignants + admin
    return prisma.user.findMany({
      where: {
        tenantId,
        id: { not: userId },
        active: true,
        role: { in: ["TENANT_ADMIN", "PRINCIPAL", "SECRETARY", "TEACHER", "CLASS_TEACHER", "SUPER_ADMIN"] },
      },
      select: { id: true, name: true, role: true, avatarUrl: true },
    });
  }

  return [];
}

/**
 * Récupère automatiquement les participants pour une conversation de classe.
 * - Élèves de la classe (avec compte utilisateur)
 * - Parents des élèves (avec compte utilisateur)
 * - Prof principal
 * - Enseignants qui donnent cours à cette classe
 */
export async function getClassParticipants(
  tenantId: string,
  classeId: string,
  creatorUserId: string
): Promise<{ userId: string; role: ParticipantRole }[]> {
  const [eleves, classe] = await Promise.all([
    prisma.eleve.findMany({
      where: { tenantId, classeId, deletedAt: null },
      include: {
        user: { select: { id: true } },
        parents: { include: { parent: { include: { user: { select: { id: true } } } } } },
      },
    }),
    prisma.classe.findFirst({
      where: { id: classeId, tenantId },
      include: {
        profPrincipal: { include: { user: { select: { id: true } } } },
      },
    }),
  ]);

  if (!classe) return [];

  const participants = new Map<string, ParticipantRole>();

  // Le créateur est ADMIN
  participants.set(creatorUserId, "ADMIN");

  // Prof principal
  if (classe.profPrincipal?.user) {
    participants.set(classe.profPrincipal.user.id, "ADMIN");
  }

  // Élèves avec compte
  for (const eleve of eleves) {
    if (eleve.user) {
      participants.set(eleve.user.id, "MEMBER");
    }
    // Parents
    for (const ep of eleve.parents) {
      if (ep.parent.user) {
        participants.set(ep.parent.user.id, "MEMBER");
      }
    }
  }

  return Array.from(participants.entries()).map(([userId, role]) => ({ userId, role }));
}

/**
 * Récupère tous les utilisateurs d'un tenant (pour ADMIN_BROADCAST).
 */
export async function getTenantParticipants(
  tenantId: string,
  creatorUserId: string,
  siteId?: string | null
): Promise<{ userId: string; role: ParticipantRole }[]> {
  const users = await prisma.user.findMany({
    where: {
      tenantId,
      active: true,
      ...(siteId ? { siteId } : {}),
    },
    select: { id: true },
  });

  return users.map((u) => ({
    userId: u.id,
    role: u.id === creatorUserId ? "ADMIN" as ParticipantRole : "READONLY" as ParticipantRole,
  }));
}

/**
 * Vérifie si un utilisateur peut écrire dans une conversation.
 */
export function canWriteInConversation(
  participantRole: ParticipantRole,
  conversationReadOnly: boolean,
  isCreator: boolean,
  userRole: Role
): boolean {
  // Les admins globaux peuvent toujours écrire
  if (userRole === "SUPER_ADMIN" || userRole === "TENANT_ADMIN") return true;

  // Si la conversation est en mode annonce (readOnly), seul le créateur/admin peut écrire
  if (conversationReadOnly) {
    return participantRole === "ADMIN" || isCreator;
  }

  // READONLY ne peut pas écrire
  if (participantRole === "READONLY") return false;

  // ADMIN et MEMBER peuvent écrire
  return true;
}
