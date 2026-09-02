import prisma from "@/lib/prisma";
import type { Role, ConversationType, ParticipantRole } from "@prisma/client";
import {
  mergeFilters,
  resolveSiteScope,
  siteFilterForModel,
  type SessionSiteClaims,
} from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

interface SessionUser extends SessionSiteClaims {
  id: string;
  tenantId: string;
  role: Role;
  siteId?: string | null;
}

/** Nombre maximum de destinataires renvoyés par la recherche. */
const RECIPIENTS_PAGE_SIZE = 30;

const STAFF_ROLES: Role[] = [
  "TEACHER",
  "CLASS_TEACHER",
  "PRINCIPAL",
  "SECRETARY",
  "COUNSELOR",
  "NURSE",
  "ACCOUNTANT",
  "TENANT_ADMIN",
];
const DIRECTION_ROLES: Role[] = ["TENANT_ADMIN", "PRINCIPAL", "SECRETARY", "ACCOUNTANT"];

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
      return ["DIRECT", "PARENT_TEACHER", "PARENT_ADMIN", "FREE"];
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
  classeId?: string,
  query?: string
): Promise<{ id: string; name: string | null; role: Role; avatarUrl: string | null }[]> {
  const portee = await recipientScopeFilter(user, type, classeId);
  if (!portee) return [];

  return prisma.user.findMany({
    where: recipientBaseFilter(user, portee, query),
    select: { id: true, name: true, role: true, avatarUrl: true },
    orderBy: { name: "asc" },
    take: RECIPIENTS_PAGE_SIZE,
  });
}

/**
 * Socle commun à toutes les recherches de destinataires.
 *
 * L'isolation par site manquait totalement ici : la requête ne portait que
 * sur `tenantId`, si bien qu'un personnel du site A pouvait écrire à
 * n'importe qui sur le site B. `siteFilterForModel` rétablit la règle
 * appliquée partout ailleurs dans l'application.
 */
function recipientBaseFilter(
  user: SessionUser,
  portee: Record<string, unknown>,
  query?: string
): Record<string, unknown> {
  return mergeFilters(
    { tenantId: user.tenantId, id: { not: user.id }, isActive: true },
    siteFilterForModel("user", user),
    // Encapsulé dans `AND` — impératif : `mergeFilters` ne concatène que la
    // clé `AND`, un `OR` de premier niveau serait écrasé par le fragment
    // suivant et la recherche par nom disparaîtrait sans erreur visible.
    query
      ? {
          AND: [
            {
              OR: [
                { name: { contains: query, mode: "insensitive" as const } },
                { email: { contains: query, mode: "insensitive" as const } },
              ],
            },
          ],
        }
      : {},
    portee
  );
}

/**
 * Qui ce rôle a-t-il le droit de joindre, pour ce type de conversation ?
 * Renvoie le fragment Prisma correspondant, ou `null` si le couple
 * rôle/type n'autorise aucun destinataire individuel.
 *
 * Extrait de `getPossibleRecipients` pour que la *création* de conversation
 * puisse rejouer exactement la même règle : la liste proposée à l'écran était
 * filtrée, mais rien ne revalidait les identifiants renvoyés par le client.
 * Deux implémentations séparées auraient fini par diverger — c'est justement
 * ce genre d'écart qui rouvre le trou.
 */
async function recipientScopeFilter(
  user: SessionUser,
  type: ConversationType,
  classeId?: string
): Promise<Record<string, unknown> | null> {
  const { id: userId, tenantId, role } = user;

  // Fail-closed : un compte sans périmètre de site exploitable ne se voit
  // proposer aucun destinataire, plutôt que l'annuaire complet du tenant.
  if (resolveSiteScope(user).kind === "NONE") return null;

  if (role === "SUPER_ADMIN" || role === "TENANT_ADMIN" || role === "PRINCIPAL" || role === "SECRETARY") {
    // Pour une conversation de classe, le ciblage passe par l'audience, pas
    // par une liste de personnes.
    if (type === "CLASS_ANNOUNCEMENT" || type === "CLASS_DISCUSSION") return null;

    // Le type demandé restreint l'annuaire : proposer tout le monde sous
    // l'étiquette « Parent ↔ Enseignant » était trompeur.
    const roleFilter: Record<string, unknown> =
      type === "PARENT_TEACHER"
        ? { role: { in: ["PARENT", "TEACHER", "CLASS_TEACHER"] as Role[] } }
        : type === "PARENT_ADMIN"
          ? { role: { in: ["PARENT", ...DIRECTION_ROLES] as Role[] } }
          : type === "STAFF_GROUP"
            ? { role: { in: STAFF_ROLES } }
            : {};

    // Restriction facultative à une classe : `classeId` était déclaré dans la
    // signature et n'était jamais lu, la fonctionnalité n'existait donc pas.
    const classFilter = classeId ? await classeUserFilter(tenantId, classeId) : {};

    return mergeFilters(roleFilter, classFilter);
  }

  if (role === "TEACHER" || role === "CLASS_TEACHER") {
    if (type === "CLASS_DISCUSSION" || type === "CLASS_ANNOUNCEMENT") {
      // Les classes de l'enseignant
      return null;
    }
    if (type === "PARENT_TEACHER") {
      // Parents des élèves de ses classes.
      // Fiche de l'émetteur lui-même, retrouvée par son propre `userId` :
      // aucun filtre de site à appliquer, la requête ne peut viser personne
      // d'autre.
      // eslint-disable-next-line ecolpro/require-site-filter
      const enseignant = await prisma.enseignant.findFirst({
        where: { userId, tenantId },
        select: { id: true },
      });
      if (!enseignant) return null;

      // L'ancienne version ne retenait que les classes dont l'enseignant est
      // professeur principal (un `OR` à une seule branche, avec un TODO en
      // commentaire). Un enseignant de matière ne pouvait donc joindre aucun
      // parent. Les créneaux d'emploi du temps complètent le rattachement.
      return {
        role: "PARENT",
        parents: {
          some: {
            enfants: {
              some: {
                eleve: {
                  tenantId,
                  deletedAt: null,
                  ...(classeId ? { classeId } : {}),
                  classe: {
                    OR: [
                      { profPrincipalId: enseignant.id },
                      { emploiTemps: { some: { enseignantId: enseignant.id } } },
                    ],
                  },
                },
              },
            },
          },
        },
      };
    }
    // STAFF_GROUP : collègues du même périmètre.
    if (type === "STAFF_GROUP") {
      return { role: { in: STAFF_ROLES } };
    }
    // DIRECT : tout le personnel et l'administration du périmètre.
    return {};
  }

  if (role === "PARENT") {
    if (type === "PARENT_TEACHER") {
      // Fiche de l'émetteur lui-même : voir plus haut, pas de filtre de site.
      // eslint-disable-next-line ecolpro/require-site-filter
      const parent = await prisma.parent.findFirst({
        where: { userId, tenantId },
        select: { id: true },
      });
      if (!parent) return null;

      // Là aussi, seul le professeur principal était proposé : un parent ne
      // pouvait pas écrire au professeur de mathématiques de son enfant.
      // Classes où l'émetteur a un enfant inscrit : c'est le lien de filiation
      // qui borne la requête, pas le site. Un parent dont les enfants sont sur
      // deux sites doit joindre les enseignants des deux.
      const anneeCourante = await getAnneeCouranteLibelle(tenantId);
      // eslint-disable-next-line ecolpro/require-site-filter
      const classes = await prisma.classe.findMany({
        where: {
          tenantId,
          ...(anneeCourante ? { annee: anneeCourante } : {}),
          eleves: { some: { deletedAt: null, parents: { some: { parentId: parent.id } } } },
        },
        select: { id: true, profPrincipal: { select: { userId: true } } },
      });
      if (classes.length === 0) return null;

      const classeIds = classes.map((c) => c.id);
      const profPrincipauxIds = classes
        .map((c) => c.profPrincipal?.userId)
        .filter((id): id is string => !!id);

      return {
        AND: [
          {
            OR: [
              { id: { in: profPrincipauxIds } },
              { enseignants: { some: { emploiTemps: { some: { classeId: { in: classeIds } } } } } },
            ],
          },
        ],
      };
    }
    if (type === "PARENT_ADMIN") {
      return {
        role: { in: ["TENANT_ADMIN", "PRINCIPAL", "SECRETARY", "ACCOUNTANT", "SUPER_ADMIN"] },
      };
    }
    if (type === "FREE") {
      // Un parent peut créer un groupe avec d'autres parents des classes
      // de ses enfants. La restriction est appliquée par la requête ci-dessous :
      // seuls les parents qui ont un enfant dans une classe où l'émetteur a
      // aussi un enfant sont proposés.
      // Fiche de l'émetteur lui-même : voir plus haut, pas de filtre de site.
      // eslint-disable-next-line ecolpro/require-site-filter
      const parent = await prisma.parent.findFirst({
        where: { userId, tenantId },
        select: { id: true },
      });
      if (!parent) return null;

      // Enfants de l'émetteur : bornés par la filiation, voir ci-dessus.
      // eslint-disable-next-line ecolpro/require-site-filter
      const mesEnfants = await prisma.eleve.findMany({
        where: {
          tenantId,
          deletedAt: null,
          parents: { some: { parentId: parent.id } },
        },
        select: { classeId: true },
      });
      const classeIds = [...new Set(mesEnfants.map((e) => e.classeId).filter((id): id is string => !!id))];
      if (classeIds.length === 0) return null;

      // Parents des élèves de ces classes, en excluant l'émetteur.
      return {
        role: "PARENT",
        parents: {
          some: {
            enfants: {
              some: {
                eleve: {
                  tenantId,
                  deletedAt: null,
                  classeId: { in: classeIds },
                },
              },
            },
          },
        },
      };
    }
    // DIRECT : enseignants des enfants + administration.
    return {
      role: { in: ["TENANT_ADMIN", "PRINCIPAL", "SECRETARY", "TEACHER", "CLASS_TEACHER", "SUPER_ADMIN"] },
    };
  }

  if (role === "STUDENT") {
    // Un élève ne crée pas de conversation (`messages:reply` uniquement) mais
    // l'annuaire lui sert pour la recherche : ses enseignants et la vie
    // scolaire, jamais les autres familles.
    return {
      role: { in: ["TEACHER", "CLASS_TEACHER", "PRINCIPAL", "COUNSELOR", "NURSE", "SECRETARY"] },
    };
  }

  // NURSE, ACCOUNTANT et tout rôle non traité : personnel du périmètre.
  return { role: { in: STAFF_ROLES } };
}

/**
 * Les destinataires demandés sont-ils réellement joignables par cet émetteur ?
 *
 * LE TROU QU'ELLE FERME
 * ---------------------
 * La création de conversation insérait les `participantIds` reçus du client
 * tels quels, sans aucun contrôle : ni tenant, ni site, ni règle de rôle.
 * `getPossibleRecipients` ne filtrait que la liste *affichée* — une requête
 * fabriquée à la main pouvait donc ajouter n'importe quel utilisateur, y
 * compris d'un autre établissement, et lui pousser un message.
 *
 * On rejoue ici la règle exacte de l'annuaire, sans plafond de pagination et
 * bornée aux identifiants demandés : tout ce qui n'en ressort pas est refusé.
 *
 * @returns les identifiants refusés — vide si tout est autorisé.
 */
export async function rejectUnreachableRecipients(
  user: SessionUser,
  type: ConversationType,
  participantIds: string[],
  classeId?: string
): Promise<string[]> {
  const demandes = [...new Set(participantIds)].filter((id) => id !== user.id);
  if (demandes.length === 0) return [];

  const portee = await recipientScopeFilter(user, type, classeId);
  // Aucun destinataire individuel n'est permis pour ce couple rôle/type.
  if (!portee) return demandes;

  const joignables = await prisma.user.findMany({
    where: mergeFilters(recipientBaseFilter(user, portee), { id: { in: demandes } }),
    select: { id: true },
  });

  const autorises = new Set(joignables.map((u) => u.id));
  return demandes.filter((id) => !autorises.has(id));
}

/**
 * Restreint une recherche d'utilisateurs aux personnes rattachées à une
 * classe : élèves de la classe, leurs parents, et ses enseignants.
 */
async function classeUserFilter(
  tenantId: string,
  classeId: string
): Promise<Record<string, unknown>> {
  // `classeId` est vérifié par l'appelant — la route contrôle
  // `canAccessSite(actor, classe.siteId)` avant d'ouvrir la conversation.
  // eslint-disable-next-line ecolpro/require-site-filter
  const classe = await prisma.classe.findFirst({
    where: { id: classeId, tenantId },
    select: { id: true, profPrincipal: { select: { userId: true } } },
  });
  if (!classe) return { AND: [{ id: "__ecolpro_no_classe__" }] };

  return {
    AND: [
      {
        OR: [
          { eleve: { classeId } },
          { parents: { some: { enfants: { some: { eleve: { classeId } } } } } },
          { enseignants: { some: { emploiTemps: { some: { classeId } } } } },
          ...(classe.profPrincipal?.userId ? [{ id: classe.profPrincipal.userId }] : []),
        ],
      },
    ],
  };
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
  // Participants d'une classe déjà autorisée : la route valide
  // `canAccessSite(actor, classe.siteId)` avant d'appeler cette fonction. Le
  // périmètre découle donc de `classeId`, et les élèves d'une classe sont par
  // construction sur le site de cette classe.
  const [eleves, classe] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-site-filter
    prisma.eleve.findMany({
      where: { tenantId, classeId, deletedAt: null },
      include: {
        user: { select: { id: true } },
        // eslint-disable-next-line ecolpro/require-site-filter
        parents: { include: { parent: { include: { user: { select: { id: true } } } } } },
      },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter
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
  creator: SessionUser,
  creatorUserId: string
): Promise<{ userId: string; role: ParticipantRole }[]> {
  // Le périmètre venait d'un `siteId` optionnel : un compte rattaché à
  // plusieurs sites sans site courant (`siteId: null`, `siteIds: [s1, s2]`)
  // retombait sur « aucun filtre » et diffusait à tout l'établissement.
  // `siteFilterForModel` couvre ce cas, comme partout ailleurs.
  const users = await prisma.user.findMany({
    where: mergeFilters(
      { tenantId: creator.tenantId, isActive: true },
      siteFilterForModel("user", creator)
    ),
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
