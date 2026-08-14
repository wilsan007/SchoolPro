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
  /**
   * Publics multiples — quand l'interface coche « Parents + Enseignants »
   * en une seule fois. Si présent, `group` est ignoré et la résolution
   * fusionne tous les publics.
   */
  groups?: AudienceGroup[];
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
    case "PARENT":
      // Un parent peut cibler les classes de ses enfants pour contacter
      // les autres parents. La restriction aux classes de ses enfants est
      // appliquée par `parentClasseFilter` dans `listTargetingOptions` et
      // `classeIdsForScope`.
      return ["CLASSE"];
    default:
      // STUDENT, NURSE, ACCOUNTANT : destinataires individuels
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
    case "PARENT":
      // Un parent peut contacter les autres parents des classes de ses enfants.
      return ["PARENTS"];
    default:
      return [];
  }
}

export function canTarget(role: Role, selector: AudienceSelector): boolean {
  if (!allowedScopeKinds(role).includes(selector.scope.kind)) return false;
  // Multi-groups : tous les publics doivent être autorisés
  if (selector.groups && selector.groups.length > 0) {
    const allowed = allowedGroups(role);
    return selector.groups.every((g) => allowed.includes(g));
  }
  return allowedGroups(role).includes(selector.group);
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

  const { scope, group, groups } = selector;
  // Utiliser groups si fourni, sinon [group]
  const effectiveGroups = groups && groups.length > 0 ? groups : [group];
  const hasOnlyStaff = effectiveGroups.every(
    (g) => g === "ENSEIGNANTS" || g === "PERSONNEL" || g === "DIRECTION"
  );
  const hasParents = effectiveGroups.includes("PARENTS");

  if (intent === "ANNONCE") {
    return scope.kind === "CLASSE" ? "CLASS_ANNOUNCEMENT" : "ADMIN_BROADCAST";
  }

  if (scope.kind === "CLASSE") return "CLASS_DISCUSSION";
  if (hasOnlyStaff) return "STAFF_GROUP";
  if (hasParents) return "PARENT_ADMIN";
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
    await teacherClasseFilter(actor),
    await parentClasseFilter(actor)
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

  // Fiche de l'émetteur lui-même, retrouvée par son propre `userId` :
  // aucun filtre de site à appliquer, la requête ne peut viser personne d'autre.
  // eslint-disable-next-line ecolpro/require-site-filter
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

/**
 * Restriction pour les parents : ils ne ciblent que les classes où leurs
 * enfants sont inscrits. Sans ce filtre, un parent pourrait voir toutes les
 * classes du tenant et contacter des parents d'enfants qu'il ne connaît pas.
 */
async function parentClasseFilter(actor: Actor): Promise<Record<string, unknown>> {
  if (actor.role !== "PARENT") return {};

  // Fiche de l'émetteur lui-même : voir `teacherClasseFilter` ci-dessus.
  // eslint-disable-next-line ecolpro/require-site-filter
  const parent = await prisma.parent.findFirst({
    where: { userId: actor.id, tenantId: actor.tenantId },
    select: { id: true },
  });
  // Fail-closed : un compte parent sans fiche n'a aucune classe.
  if (!parent) return { AND: [{ id: "__ecolpro_no_classe__" }] };

  // Enfants de l'émetteur : c'est le lien de filiation qui borne la requête,
  // pas le site — un parent dont les enfants sont sur deux sites doit pouvoir
  // cibler les deux classes.
  // eslint-disable-next-line ecolpro/require-site-filter
  const enfants = await prisma.eleve.findMany({
    where: {
      tenantId: actor.tenantId,
      deletedAt: null,
      parents: { some: { parentId: parent.id } },
    },
    select: { classeId: true },
  });
  const classeIds = [...new Set(enfants.map((e) => e.classeId).filter((id): id is string => !!id))];
  if (classeIds.length === 0) return { AND: [{ id: "__ecolpro_no_classe__" }] };

  // Encapsulé dans `AND` — impératif. `mergeFilters` ne concatène que la clé
  // `AND` : un `id` de premier niveau était écrasé par le `{ id: scope.id }`
  // de la portée CLASSE, et la restriction disparaissait purement et
  // simplement. Un parent pouvait alors cibler les parents de n'importe
  // quelle classe de l'établissement en passant son identifiant.
  return { AND: [{ id: { in: classeIds } }] };
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
  // `classeIds` sort de `classeIdsForScope`, qui applique déjà
  // `siteFilterForModel("classe", actor)` : la portée est acquise en amont.
  // eslint-disable-next-line ecolpro/require-site-filter
  const classes = await prisma.classe.findMany({
    where: { id: { in: classeIds }, tenantId: actor.tenantId },
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

  // L'isolation passe par la relation : `eleveWhere` porte déjà
  // `siteFilterForModel("eleve", actor)`. Un lien élève↔parent n'a pas de
  // site propre à filtrer.
  // eslint-disable-next-line ecolpro/require-site-filter
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
  // `classeIds` sort de `classeIdsForScope`, déjà borné au périmètre de site.
  const [classes, creneaux] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-site-filter
    prisma.classe.findMany({
      where: { id: { in: classeIds }, tenantId: actor.tenantId },
      select: { profPrincipal: { select: { userId: true } } },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter
    prisma.emploiTemps.findMany({
      where: {
        classeId: { in: classeIds },
        enseignantId: { not: null },
        tenantId: actor.tenantId,
      },
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

  const { scope, group, groups: multiGroups } = selector;
  // Multi-groups : si l'interface envoie plusieurs publics, on les résout tous.
  // Sinon, ALL se décompose en tous les publics, et un seul group reste tel quel.
  const groups: AudienceGroup[] =
    multiGroups && multiGroups.length > 0
      ? multiGroups.includes("ALL")
        ? ["ELEVES", "PARENTS", "ENSEIGNANTS", "PERSONNEL"]
        : multiGroups
      : group === "ALL"
        ? ["ELEVES", "PARENTS", "ENSEIGNANTS", "PERSONNEL"]
        : [group];

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
  // Libellé : si multi-groups, on les concatène ; sinon on garde le group unique
  const labelGroups =
    multiGroups && multiGroups.length > 0
      ? multiGroups.map((g) => GROUP_LABELS[g]).join(" + ")
      : GROUP_LABELS[group];
  return {
    userIds: all.slice(0, MAX_AUDIENCE),
    breakdown,
    sansCompte,
    label: `${labelGroups} — ${await scopeLabel(actor, scope)}`,
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
    await teacherClasseFilter(actor),
    await parentClasseFilter(actor)
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
