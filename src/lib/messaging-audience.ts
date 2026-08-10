/**
 * EcolPro — Ciblage des destinataires de la messagerie
 * ====================================================
 *
 * POURQUOI CE FICHIER
 * -------------------
 * L'ancienne messagerie faisait choisir à l'utilisateur un **type technique**
 * de conversation (`CLASS_ANNOUNCEMENT`, `PARENT_ADMIN`, `STAFF_GROUP`…) puis
 * lui imposait le sélecteur correspondant. Deux défauts :
 *
 *   1. le type technique n'est pas une question que l'utilisateur se pose —
 *      il pense « les parents de 6e B », pas « PARENT_ADMIN » ;
 *   2. la combinatoire réelle (site × structure × niveau × classe × public)
 *      n'était atteignable par aucun de ces types.
 *
 * On sépare donc deux notions que l'ancien code confondait :
 *
 *   • **l'intention** — j'écris à quelqu'un, je diffuse une annonce, j'ouvre
 *     un espace de groupe. Trois choix, compréhensibles sans formation.
 *   • **l'audience** — une expression composable `portée × public`, qui
 *     couvre toutes les combinaisons du modèle de données.
 *
 * Le `ConversationType` de la base est *dérivé* de ces deux notions
 * (voir `deriveConversationType`). Aucune migration n'est nécessaire et la
 * gouvernance par type — permissions, lecture seule — reste intacte.
 *
 * ISOLATION PAR SITE
 * ------------------
 * Toute résolution passe par `site-scope`. C'était le trou de l'ancienne
 * implémentation : `messaging-scope.ts` n'importait pas `site-scope` et
 * filtrait sur le seul `tenantId`, si bien qu'un personnel du site A pouvait
 * écrire à tout le tenant. Ici, la liste des classes et celle des
 * utilisateurs sont bornées au périmètre de l'émetteur avant toute autre
 * opération, et le ciblage est refusé si le périmètre est vide (fail-closed).
 */

import prisma from "@/lib/prisma";
import type { ConversationType, Role } from "@prisma/client";
import {
  mergeFilters,
  resolveSiteScope,
  siteFilterForModel,
  type SessionSiteClaims,
} from "@/lib/site-scope";

// ------------------------------------------------------------
// Modèle d'audience
// ------------------------------------------------------------

/** Ce que l'utilisateur veut faire. Trois intentions, pas huit types. */
export type Intent = "MESSAGE" | "ANNONCE" | "GROUPE";

/** Jusqu'où porte le ciblage. */
export type AudienceScope =
  | { kind: "TENANT" }
  | { kind: "SITE"; id: string }
  | { kind: "STRUCTURE"; id: string }
  | { kind: "NIVEAU"; value: string }
  | { kind: "CLASSE"; id: string };

/** Quel public, à l'intérieur de cette portée. */
export type AudienceGroup =
  | "ALL"
  | "PARENTS"
  | "ELEVES"
  | "ENSEIGNANTS"
  | "PERSONNEL"
  | "DIRECTION";

export interface AudienceSelector {
  scope: AudienceScope;
  group: AudienceGroup;
}

/** Résultat d'une résolution : les identifiants + de quoi l'expliquer. */
export interface ResolvedAudience {
  userIds: string[];
  /** Répartition par public, pour l'aperçu « qui va recevoir ». */
  breakdown: { group: AudienceGroup; count: number }[];
  /** Personnes ciblées mais sans compte de connexion — ne recevront rien. */
  sansCompte: number;
  /** Libellé lisible, réutilisé comme sujet par défaut. */
  label: string;
  truncated: boolean;
}

/**
 * Plafond de sécurité. Au-delà, on refuse plutôt que de créer une
 * conversation à 20 000 participants qui ferait tomber la base.
 */
export const MAX_AUDIENCE = 2000;

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
const DIRECTION_ROLES: Role[] = ["TENANT_ADMIN", "PRINCIPAL", "SECRETARY"];
const TEACHER_ROLES: Role[] = ["TEACHER", "CLASS_TEACHER"];

// ------------------------------------------------------------
// Qui a le droit de cibler quoi
// ------------------------------------------------------------

/**
 * Portées autorisées par rôle.
 *
 * Le principe : plus la portée est large, plus le rôle doit être élevé. Un
 * enseignant cible ses classes ; il ne diffuse pas à l'établissement.
 */
export function allowedScopeKinds(role: Role): AudienceScope["kind"][] {
  switch (role) {
    case "SUPER_ADMIN":
    case "TENANT_ADMIN":
      return ["TENANT", "SITE", "STRUCTURE", "NIVEAU", "CLASSE"];
    case "PRINCIPAL":
      return ["SITE", "STRUCTURE", "NIVEAU", "CLASSE"];
    case "SECRETARY":
      return ["SITE", "NIVEAU", "CLASSE"];
    case "COUNSELOR":
      return ["NIVEAU", "CLASSE"];
    case "TEACHER":
    case "CLASS_TEACHER":
      return ["CLASSE"];
    default:
      // PARENT, STUDENT, NURSE, ACCOUNTANT : destinataires individuels
      // uniquement, pas de diffusion.
      return [];
  }
}

/** Publics autorisés par rôle, à l'intérieur d'une portée permise. */
export function allowedGroups(role: Role): AudienceGroup[] {
  switch (role) {
    case "SUPER_ADMIN":
    case "TENANT_ADMIN":
    case "PRINCIPAL":
      return ["ALL", "PARENTS", "ELEVES", "ENSEIGNANTS", "PERSONNEL", "DIRECTION"];
    case "SECRETARY":
      return ["ALL", "PARENTS", "ELEVES", "ENSEIGNANTS"];
    case "COUNSELOR":
      return ["PARENTS", "ELEVES", "ENSEIGNANTS"];
    case "TEACHER":
    case "CLASS_TEACHER":
      return ["ALL", "PARENTS", "ELEVES"];
    default:
      return [];
  }
}

export function canTarget(role: Role, selector: AudienceSelector): boolean {
  return (
    allowedScopeKinds(role).includes(selector.scope.kind) &&
    allowedGroups(role).includes(selector.group)
  );
}

// ------------------------------------------------------------
// Dérivation du type technique
// ------------------------------------------------------------

/**
 * Traduit `intention + audience` vers le `ConversationType` stocké en base.
 *
 * L'utilisateur ne voit jamais ces valeurs : elles pilotent les permissions
 * (`getAllowedConversationTypes`), l'icône et le mode lecture seule.
 */
export function deriveConversationType(
  intent: Intent,
  selector: AudienceSelector | null,
  recipientCount: number
): ConversationType {
  if (!selector) {
    // Destinataires choisis un par un.
    if (intent === "ANNONCE") return "ADMIN_BROADCAST";
    if (intent === "GROUPE") return "FREE";
    return recipientCount > 1 ? "FREE" : "DIRECT";
  }

  const { scope, group } = selector;

  if (intent === "ANNONCE") {
    return scope.kind === "CLASSE" ? "CLASS_ANNOUNCEMENT" : "ADMIN_BROADCAST";
  }

  if (scope.kind === "CLASSE") return "CLASS_DISCUSSION";
  if (group === "ENSEIGNANTS" || group === "PERSONNEL" || group === "DIRECTION") {
    return "STAFF_GROUP";
  }
  if (group === "PARENTS") return "PARENT_ADMIN";
  return "FREE";
}

// ------------------------------------------------------------
// Résolution
// ------------------------------------------------------------

interface Actor extends SessionSiteClaims {
  id: string;
  tenantId: string;
  role: Role;
}

/**
 * Identifiants des classes couvertes par la portée, déjà bornées au
 * périmètre de site de l'émetteur.
 *
 * Renvoie `null` quand la portée ne s'exprime pas en classes (TENANT / SITE
 * pour un public non scolaire) — l'appelant bascule alors sur le chemin
 * « utilisateurs ».
 */
async function classeIdsForScope(actor: Actor, scope: AudienceScope): Promise<string[]> {
  const base = mergeFilters(
    { tenantId: actor.tenantId },
    siteFilterForModel("classe", actor),
    await teacherClasseFilter(actor)
  );

  const extra: Record<string, unknown> =
    scope.kind === "CLASSE"
      ? { id: scope.id }
      : scope.kind === "NIVEAU"
        ? { niveau: scope.value }
        : scope.kind === "STRUCTURE"
          ? { structureId: scope.id }
          : scope.kind === "SITE"
            ? { siteId: scope.id }
            : {};

  const classes = await prisma.classe.findMany({
    where: mergeFilters(base, extra),
    select: { id: true },
  });
  return classes.map((c) => c.id);
}

/**
 * Restriction supplémentaire pour les enseignants : ils ne ciblent que les
 * classes dont ils sont professeur principal ou dans lesquelles ils
 * interviennent effectivement (emploi du temps).
 *
 * Le filtre de site ne suffit pas ici : sur un site donné, un enseignant ne
 * doit pas pouvoir écrire aux parents d'une classe qui n'est pas la sienne.
 */
async function teacherClasseFilter(actor: Actor): Promise<Record<string, unknown>> {
  if (actor.role !== "TEACHER" && actor.role !== "CLASS_TEACHER") return {};

  const enseignant = await prisma.enseignant.findFirst({
    where: { userId: actor.id, tenantId: actor.tenantId },
    select: { id: true },
  });
  // Fail-closed : un compte enseignant sans fiche n'a aucune classe.
  if (!enseignant) return { AND: [{ id: "__ecolpro_no_classe__" }] };

  return {
    AND: [
      {
        OR: [
          { profPrincipalId: enseignant.id },
          { emploiTemps: { some: { enseignantId: enseignant.id } } },
        ],
      },
    ],
  };
}

/** Sites couverts par la portée, bornés au périmètre de l'émetteur. */
async function siteIdsForScope(actor: Actor, scope: AudienceScope): Promise<string[] | null> {
  const siteScope = resolveSiteScope(actor);

  if (scope.kind === "SITE") return [scope.id];
  if (scope.kind === "TENANT") {
    // `null` = pas de restriction de site au-delà du périmètre de l'émetteur.
    return siteScope.kind === "SITES" ? siteScope.siteIds : null;
  }

  // STRUCTURE / NIVEAU / CLASSE : on déduit les sites des classes visées.
  const classeIds = await classeIdsForScope(actor, scope);
  if (classeIds.length === 0) return [];
  const classes = await prisma.classe.findMany({
    where: { id: { in: classeIds } },
    select: { siteId: true },
  });
  const ids = [...new Set(classes.map((c) => c.siteId).filter((s): s is string => !!s))];
  return ids.length > 0 ? ids : null;
}

/** Élèves de la portée qui possèdent un compte de connexion. */
async function resolveEleves(actor: Actor, scope: AudienceScope) {
  const base = mergeFilters(
    { tenantId: actor.tenantId, statut: "ACTIF" as const, deletedAt: null },
    siteFilterForModel("eleve", actor)
  );

  const where =
    scope.kind === "TENANT"
      ? base
      : scope.kind === "SITE"
        ? mergeFilters(base, { siteId: scope.id })
        : mergeFilters(base, { classeId: { in: await classeIdsForScope(actor, scope) } });

  const eleves = await prisma.eleve.findMany({
    where,
    select: { userId: true },
    take: MAX_AUDIENCE * 2,
  });

  const userIds = eleves.map((e) => e.userId).filter((id): id is string => !!id);
  return { userIds, sansCompte: eleves.length - userIds.length };
}

/** Parents des élèves de la portée qui possèdent un compte de connexion. */
async function resolveParents(actor: Actor, scope: AudienceScope) {
  const eleveBase = mergeFilters(
    { tenantId: actor.tenantId, statut: "ACTIF" as const, deletedAt: null },
    siteFilterForModel("eleve", actor)
  );

  const eleveWhere =
    scope.kind === "TENANT"
      ? eleveBase
      : scope.kind === "SITE"
        ? mergeFilters(eleveBase, { siteId: scope.id })
        : mergeFilters(eleveBase, { classeId: { in: await classeIdsForScope(actor, scope) } });

  const liens = await prisma.eleveParent.findMany({
    where: { eleve: eleveWhere },
    select: { parent: { select: { id: true, userId: true } } },
    take: MAX_AUDIENCE * 4,
  });

  // Un parent peut avoir plusieurs enfants dans la portée : on déduplique sur
  // le parent, pas sur le lien, sans quoi il serait compté deux fois.
  const avecCompte = new Set<string>();
  const sansCompteIds = new Set<string>();
  for (const { parent } of liens) {
    if (parent.userId) avecCompte.add(parent.userId);
    else sansCompteIds.add(parent.id);
  }
  return { userIds: [...avecCompte], sansCompte: sansCompteIds.size };
}

/** Enseignants intervenant dans la portée. */
async function resolveEnseignants(actor: Actor, scope: AudienceScope) {
  if (scope.kind === "TENANT" || scope.kind === "SITE") {
    const userIds = await resolveUsersByRole(actor, scope, TEACHER_ROLES);
    return { userIds, sansCompte: 0 };
  }

  const classeIds = await classeIdsForScope(actor, scope);
  if (classeIds.length === 0) return { userIds: [], sansCompte: 0 };

  // Professeurs principaux + intervenants via l'emploi du temps : c'est la
  // seule définition fidèle de « les enseignants de cette classe ».
  const [classes, creneaux] = await Promise.all([
    prisma.classe.findMany({
      where: { id: { in: classeIds } },
      select: { profPrincipal: { select: { userId: true } } },
    }),
    prisma.emploiTemps.findMany({
      where: { classeId: { in: classeIds }, enseignantId: { not: null } },
      select: { enseignant: { select: { userId: true } } },
      distinct: ["enseignantId"],
    }),
  ]);

  const userIds = [
    ...new Set([
      ...classes.map((c) => c.profPrincipal?.userId),
      ...creneaux.map((c) => c.enseignant?.userId),
    ].filter((id): id is string => !!id)),
  ];
  return { userIds, sansCompte: 0 };
}

/** Utilisateurs d'un ensemble de rôles, bornés à la portée et au périmètre. */
async function resolveUsersByRole(
  actor: Actor,
  scope: AudienceScope,
  roles: Role[]
): Promise<string[]> {
  const siteIds = await siteIdsForScope(actor, scope);
  if (siteIds !== null && siteIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: mergeFilters(
      {
        tenantId: actor.tenantId,
        isActive: true,
        role: { in: roles },
      },
      siteFilterForModel("user", actor),
      // `AND` obligatoire : `mergeFilters` écrase toute clé autre que `AND`.
      siteIds ? { AND: [{ OR: [{ siteId: { in: siteIds } }, { siteId: null }] }] } : {}
    ),
    select: { id: true },
    take: MAX_AUDIENCE * 2,
  });
  return users.map((u) => u.id);
}

const GROUP_LABELS: Record<AudienceGroup, string> = {
  ALL: "Tout le monde",
  PARENTS: "Les parents",
  ELEVES: "Les élèves",
  ENSEIGNANTS: "Les enseignants",
  PERSONNEL: "Le personnel",
  DIRECTION: "La direction",
};

/**
 * Résout une audience en liste d'identifiants utilisateur.
 *
 * Fail-closed : un émetteur sans périmètre de site exploitable obtient une
 * audience vide, jamais l'ensemble du tenant.
 */
export async function resolveAudience(
  actor: Actor,
  selector: AudienceSelector
): Promise<ResolvedAudience> {
  if (!canTarget(actor.role, selector)) {
    return { userIds: [], breakdown: [], sansCompte: 0, label: "", truncated: false };
  }
  if (resolveSiteScope(actor).kind === "NONE") {
    return { userIds: [], breakdown: [], sansCompte: 0, label: "", truncated: false };
  }

  const { scope, group } = selector;
  const groups: AudienceGroup[] =
    group === "ALL" ? ["ELEVES", "PARENTS", "ENSEIGNANTS", "PERSONNEL"] : [group];

  const seen = new Set<string>();
  const breakdown: { group: AudienceGroup; count: number }[] = [];
  let sansCompte = 0;

  for (const g of groups) {
    let result: { userIds: string[]; sansCompte: number };
    switch (g) {
      case "ELEVES":
        result = await resolveEleves(actor, scope);
        break;
      case "PARENTS":
        result = await resolveParents(actor, scope);
        break;
      case "ENSEIGNANTS":
        result = await resolveEnseignants(actor, scope);
        break;
      case "PERSONNEL":
        result = { userIds: await resolveUsersByRole(actor, scope, STAFF_ROLES), sansCompte: 0 };
        break;
      case "DIRECTION":
        result = { userIds: await resolveUsersByRole(actor, scope, DIRECTION_ROLES), sansCompte: 0 };
        break;
      default:
        result = { userIds: [], sansCompte: 0 };
    }

    let added = 0;
    for (const id of result.userIds) {
      if (id === actor.id) continue; // l'émetteur est ajouté séparément
      if (seen.has(id)) continue;
      seen.add(id);
      added++;
    }
    sansCompte += result.sansCompte;
    if (added > 0) breakdown.push({ group: g, count: added });
  }

  const all = [...seen];
  return {
    userIds: all.slice(0, MAX_AUDIENCE),
    breakdown,
    sansCompte,
    label: `${GROUP_LABELS[group]} — ${await scopeLabel(actor, scope)}`,
    truncated: all.length > MAX_AUDIENCE,
  };
}

// ------------------------------------------------------------
// Options proposées à l'interface
// ------------------------------------------------------------

export interface TargetingOptions {
  scopes: AudienceScope["kind"][];
  groups: AudienceGroup[];
  sites: { id: string; nom: string }[];
  structures: { id: string; nom: string }[];
  niveaux: string[];
  classes: { id: string; nom: string; niveau: string; siteId: string | null }[];
}

/**
 * Tout ce que l'interface a besoin de connaître pour construire le sélecteur,
 * en un seul aller-retour. L'ancienne interface appelait `/api/classes`, une
 * route qui n'a jamais existé — l'échec était avalé par un `catch` vide et la
 * liste restait désespérément vide.
 */
export async function listTargetingOptions(actor: Actor): Promise<TargetingOptions> {
  const scopes = allowedScopeKinds(actor.role);
  const groups = allowedGroups(actor.role);

  if (scopes.length === 0) {
    return { scopes, groups, sites: [], structures: [], niveaux: [], classes: [] };
  }

  const siteScope = resolveSiteScope(actor);
  const authorizedSiteIds = siteScope.kind === "SITES" ? siteScope.siteIds : null;

  const classeWhere = mergeFilters(
    { tenantId: actor.tenantId },
    siteFilterForModel("classe", actor),
    await teacherClasseFilter(actor)
  );

  const [classes, sites, structures] = await Promise.all([
    prisma.classe.findMany({
      where: classeWhere,
      select: { id: true, nom: true, niveau: true, siteId: true },
      orderBy: [{ niveau: "asc" }, { nom: "asc" }],
    }),
    // `Site` est une donnée de référence au niveau du tenant : `site-scope` ne
    // la filtre pas. On borne donc explicitement aux sites autorisés, sans
    // quoi un chef d'établissement verrait les sites qu'il n'administre pas.
    scopes.includes("SITE")
      ? prisma.site.findMany({
          where: {
            tenantId: actor.tenantId,
            actif: true,
            deletedAt: null,
            ...(authorizedSiteIds ? { id: { in: authorizedSiteIds } } : {}),
          },
          select: { id: true, nom: true },
          orderBy: { nom: "asc" },
        })
      : Promise.resolve([]),
    scopes.includes("STRUCTURE")
      ? prisma.structure.findMany({
          where: mergeFilters(
            { tenantId: actor.tenantId, actif: true },
            siteFilterForModel("structure", actor)
          ),
          select: { id: true, nom: true },
          orderBy: { type: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // Les niveaux ne sont pas une table : ils se déduisent des classes visibles.
  const niveaux = [...new Set(classes.map((c) => c.niveau))].sort();

  return { scopes, groups, sites, structures, niveaux, classes };
}

/** Libellé lisible d'une portée, pour l'aperçu et le sujet par défaut. */
export async function scopeLabel(actor: Actor, scope: AudienceScope): Promise<string> {
  switch (scope.kind) {
    case "TENANT":
      return "tout l'établissement";
    case "NIVEAU":
      return `niveau ${scope.value}`;
    // Ces trois lectures sont bornées au périmètre : un libellé renvoyé sans
    // contrôle de site divulguerait le nom d'une classe ou d'un site auquel
    // l'émetteur n'a pas accès, simplement en devinant un identifiant.
    case "SITE": {
      const siteScope = resolveSiteScope(actor);
      if (siteScope.kind === "SITES" && !siteScope.siteIds.includes(scope.id)) return "site";
      if (siteScope.kind === "NONE") return "site";
      const site = await prisma.site.findFirst({
        where: { id: scope.id, tenantId: actor.tenantId },
        select: { nom: true },
      });
      return site?.nom ?? "site";
    }
    case "STRUCTURE": {
      const structure = await prisma.structure.findFirst({
        where: mergeFilters(
          { id: scope.id, tenantId: actor.tenantId },
          siteFilterForModel("structure", actor)
        ),
        select: { nom: true },
      });
      return structure?.nom ?? "structure";
    }
    case "CLASSE": {
      const classe = await prisma.classe.findFirst({
        where: mergeFilters(
          { id: scope.id, tenantId: actor.tenantId },
          siteFilterForModel("classe", actor)
        ),
        select: { nom: true },
      });
      return classe?.nom ?? "classe";
    }
  }
}
