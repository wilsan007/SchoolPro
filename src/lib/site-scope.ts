
/**
 * EcolPro — Isolation par site (multi-sites au sein d'un tenant)
 * ==============================================================
 * Source unique de vérité pour le filtrage par site.
 *
 * Trois principes non négociables :
 *
 * 1. FAIL-CLOSED. En l'absence d'information de site exploitable, on ne
 *    renvoie AUCUNE donnée (et non pas toutes les données). Un compte mal
 *    provisionné doit voir un écran vide, jamais l'ensemble du tenant.
 *
 * 2. FILTRE INVIOLABLE. Les fragments sont encapsulés dans `AND`, jamais dans
 *    un `OR` de premier niveau. Un `where` construit par étalement
 *    (`{ tenantId, ...siteFilter, ...(q && { OR: [...] }) }`) écrasait
 *    silencieusement un `OR` de premier niveau : le filtre de site
 *    disparaissait dès qu'une recherche textuelle était active. `AND` n'est
 *    jamais utilisé par les appelants, le fragment est donc préservé.
 *
 * 3. LE siteId DE SESSION EST VÉRIFIÉ. Le siteId porté par le JWT est
 *    recoupé avec les sites réellement autorisés. Un jeton périmé ou
 *    falsifié qui désigne un site non autorisé aboutit à un refus, pas à un
 *    accès.
 */

// ------------------------------------------------------------
// Rôles et périmètres
// ------------------------------------------------------------

/**
 * Rôles ayant vocation à voir l'ensemble des sites du tenant.
 * Volontairement limité à la direction générale et à l'équipe plateforme.
 */
const TENANT_WIDE_ROLES = new Set(["TENANT_ADMIN", "SUPER_ADMIN"]);

/**
 * Rôles dont le périmètre n'est PAS défini par le site mais par un lien
 * personnel (parent → ses enfants, élève → lui-même). Un parent peut avoir
 * des enfants sur plusieurs sites : le filtrer par site serait faux.
 *
 * ATTENTION : pour ces rôles le filtre de site est neutre. L'isolation doit
 * impérativement être assurée par le filtre de relation personnelle
 * (voir `personalScopeFilter`). Toute route accessible à PARENT / STUDENT
 * qui n'applique pas ce filtre expose l'intégralité du tenant.
 */
const RELATION_SCOPED_ROLES = new Set(["PARENT", "STUDENT"]);

/**
 * Valeur impossible utilisée pour construire un prédicat toujours faux.
 */
const IMPOSSIBLE_ID = "__ecolpro_no_site_access__";

/**
 * Fragment `where` qui ne correspond à aucune ligne, quel que soit le modèle.
 * Encapsulé dans `AND` pour survivre à l'étalement chez l'appelant.
 */
const DENY_ALL: Record<string, unknown> = {
  AND: [{ id: IMPOSSIBLE_ID }],
};

export type SiteScope =
  /** Tous les sites du tenant (direction générale, aucun site sélectionné). */
  | { kind: "ALL" }
  /** Restreint à cette liste de sites (non vide). */
  | { kind: "SITES"; siteIds: string[] }
  /** Périmètre personnel (parent / élève) : le site n'est pas le discriminant. */
  | { kind: "RELATION" }
  /** Aucun accès : provisionnement incomplet ou site sélectionné non autorisé. */
  | { kind: "NONE" };

export interface SessionSiteClaims {
  role?: string | null;
  /** Site actuellement sélectionné (null = tous les sites). */
  siteId?: string | null;
  /** Sites auxquels l'utilisateur est réellement rattaché, dans le tenant actif. */
  siteIds?: string[] | null;
  /**
   * Le tenant actif possède-t-il au moins un site ?
   *
   * `false` → établissement mono-site : le découpage par site ne s'applique
   * pas, tout le monde voit le tenant. `true` ou `undefined` → l'isolation
   * s'applique et un utilisateur sans rattachement ne voit rien (fail-closed).
   */
  tenantHasSites?: boolean;
}

// ------------------------------------------------------------
// Résolution du périmètre
// ------------------------------------------------------------

export function isTenantWideRole(role: string | undefined | null): boolean {
  return !!role && TENANT_WIDE_ROLES.has(role);
}

export function isRelationScopedRole(role: string | undefined | null): boolean {
  return !!role && RELATION_SCOPED_ROLES.has(role);
}

/**
 * Conservé pour compatibilité : « ce rôle échappe-t-il au filtrage par site ? »
 * @deprecated Utiliser `resolveSiteScope` qui distingue périmètre tenant et
 * périmètre relationnel.
 */
export function isSiteAdmin(role: string | undefined | null): boolean {
  return isTenantWideRole(role) || isRelationScopedRole(role);
}

/**
 * Détermine le périmètre de sites effectif. Unique endroit où cette décision
 * est prise.
 */
export function resolveSiteScope(claims: SessionSiteClaims): SiteScope {
  const { role } = claims;
  const selectedSiteId = claims.siteId ?? null;
  const authorizedSiteIds = dedupe(claims.siteIds ?? []);

  // Direction générale / plateforme : accès à tout le tenant, éventuellement
  // restreint au site sélectionné dans le sélecteur.
  if (isTenantWideRole(role)) {
    return selectedSiteId
      ? { kind: "SITES", siteIds: [selectedSiteId] }
      : { kind: "ALL" };
  }

  // Parent / élève : périmètre personnel, le site n'est pas le discriminant.
  if (isRelationScopedRole(role)) {
    return { kind: "RELATION" };
  }

  // Personnel : strictement borné aux sites de rattachement.
  if (authorizedSiteIds.length === 0) {
    // Établissement mono-site (aucun Site déclaré) : le découpage par site
    // n'a pas de sens, on ne restreint pas.
    if (claims.tenantHasSites === false) {
      return { kind: "ALL" };
    }
    // FAIL-CLOSED. Auparavant ce cas renvoyait un filtre vide, donc l'accès à
    // tous les sites du tenant — la cause principale des fuites constatées.
    return { kind: "NONE" };
  }

  if (selectedSiteId) {
    // Le site sélectionné doit faire partie des sites autorisés. Protège
    // contre un JWT périmé (rattachement révoqué) ou manipulé.
    return authorizedSiteIds.includes(selectedSiteId)
      ? { kind: "SITES", siteIds: [selectedSiteId] }
      : { kind: "NONE" };
  }

  return { kind: "SITES", siteIds: authorizedSiteIds };
}

/**
 * `true` si l'utilisateur a le droit de consulter les données de ce site.
 * À utiliser dans les routes `[id]` avant de renvoyer un enregistrement dont
 * on connaît le `siteId`.
 */
export function canAccessSite(
  claims: SessionSiteClaims,
  siteId: string | null | undefined
): boolean {
  const scope = resolveSiteScope(claims);

  switch (scope.kind) {
    case "ALL":
      return true;
    case "RELATION":
      // Le site ne discrimine pas : c'est le lien personnel qui tranche, et il
      // est vérifié séparément par l'appelant.
      return true;
    case "NONE":
      return false;
    case "SITES":
      // Une donnée sans site (`null`) est un enregistrement partagé au niveau
      // du tenant : lisible par tout membre du tenant.
      if (siteId == null) return true;
      return scope.siteIds.includes(siteId);
  }
}

// ------------------------------------------------------------
// Construction des fragments `where`
// ------------------------------------------------------------

/**
 * Fragment pour les modèles possédant une colonne `siteId`.
 *
 * @param includeUnassigned inclure les enregistrements `siteId: null`
 *   (données partagées au niveau du tenant). `true` par défaut pour rester
 *   compatible avec le modèle de données existant, où `null` signifie
 *   « tous les sites ».
 */
export function siteWhere(
  scope: SiteScope,
  includeUnassigned = true
): Record<string, unknown> {
  switch (scope.kind) {
    case "ALL":
    case "RELATION":
      return {};
    case "NONE":
      return DENY_ALL;
    case "SITES": {
      const predicate = includeUnassigned
        ? { OR: [{ siteId: { in: scope.siteIds } }, { siteId: null }] }
        : { siteId: { in: scope.siteIds } };
      // Encapsulé dans `AND` : inviolable par l'étalement chez l'appelant.
      return { AND: [predicate] };
    }
  }
}

/**
 * Fragment pour les modèles SANS colonne `siteId`, filtrés via une relation
 * (ex. `Absence` → `eleve`, `Note` → `eleve`, `EmploiDuTemps` → `classe`).
 */
export function siteWhereForRelation(
  scope: SiteScope,
  relation: string,
  includeUnassigned = true
): Record<string, unknown> {
  switch (scope.kind) {
    case "ALL":
    case "RELATION":
      return {};
    case "NONE":
      return DENY_ALL;
    case "SITES": {
      const inner = includeUnassigned
        ? { OR: [{ siteId: { in: scope.siteIds } }, { siteId: null }] }
        : { siteId: { in: scope.siteIds } };
      return { AND: [{ [relation]: inner }] };
    }
  }
}

/**
 * Fragment restreignant au **périmètre personnel** d'un parent ou d'un élève.
 *
 * Pour ces rôles, le site n'est pas le discriminant : c'est le lien familial.
 * Sans ce filtre, un parent disposant de `notes:read` / `bulletins:read` /
 * `absences:read` lisait les données de TOUS les élèves du tenant, tous sites
 * confondus — il suffisait d'appeler la route sans paramètre, ou avec l'`id`
 * d'un autre élève.
 *
 * @param relation nom de la relation vers `Eleve` sur le modèle interrogé.
 *   Utiliser `null` quand on interroge `Eleve` lui-même.
 */
export function personalScopeFilter(
  claims: SessionSiteClaims & { userId?: string; id?: string },
  relation: string | null = "eleve"
): Record<string, unknown> {
  if (!isRelationScopedRole(claims.role)) return {};

  // Accepte indifféremment `session.user` (champ `id`) ou des revendications
  // construites à la main (champ `userId`).
  const userId = claims.userId ?? claims.id;
  // Fail-closed : un rôle à périmètre personnel sans identité exploitable ne
  // doit rien voir.
  if (!userId) return DENY_ALL;

  const elevePredicate =
    claims.role === "STUDENT"
      ? { userId }
      : { parents: { some: { parent: { userId } } } };

  return relation
    ? { AND: [{ [relation]: elevePredicate }] }
    : { AND: [elevePredicate] };
}

// ------------------------------------------------------------
// Chemin d'accès au site, par modèle
// ------------------------------------------------------------

/**
 * Comment atteindre le site depuis chaque modèle.
 *
 * Seuls 14 modèles portent une colonne `siteId`. Pour tous les autres, filtrer
 * sur `siteId` produit une erreur Prisma « Unknown argument ». Tant que le
 * filtrage était fail-open, ces routes recevaient un fragment vide et l'erreur
 * restait invisible ; dès que les utilisateurs ont un périmètre réel, elle
 * remonte en 500. D'où cette table : le chemin est décidé une fois, ici, et
 * `site-scope.model.test.ts` vérifie chaque entrée contre le schéma Prisma.
 *
 *  - `"column"`    → le modèle porte `siteId`
 *  - `"tenant"`    → donnée de référence partagée par tous les sites (pas de filtrage)
 *  - `{ one }`     → relation vers-un portant `siteId` (ex. Note → eleve)
 *  - `{ many }`    → relation vers-plusieurs portant `siteId` (ex. Enseignant → sites)
 */
export type SitePath =
  | "column"
  | "tenant"
  | { one: string }
  | { many: string }
  /**
   * Chaîne de relations à-un menant à un modèle qui porte réellement
   * `siteId` (ex: `ficheRH -> enseignant -> user.siteId`, deux sauts).
   * `{ one: string }` suppose que la cible immédiate porte `siteId` ; ce
   * n'est pas toujours le cas (`FicheRH` et `Enseignant` n'ont pas de
   * colonne `siteId` propre), d'où cette variante multi-sauts.
   */
  | { chain: string[] };

export const SITE_PATHS: Record<string, SitePath> = {
  // --- colonne siteId directe ---
  alumni: "column",
  candidature: "column",
  inscriptionHistorique: { one: "candidature" },
  classe: "column",
  cours: "column",
  eleve: "column",
  evenement: "column",
  examen: "column",
  facture: "column",
  itemInventaire: "column",
  notification: "column",
  salle: "column",
  user: "column",
  enseignantSite: "column",
  userSite: "column",
  // Ces trois modèles portent désormais `siteId` (matière/structure/dispo
  // propres à un site, `null` = partagé entre tous les sites).
  matiere: "column",
  structure: "column",
  disponibiliteEnseignant: "column",
  indisponibiliteEnseignant: "column",
  // Journal de suppression d'un site : rattaché au site qu'il décrit.
  siteDeletionLog: "column",
  // Grille tarifaire : `null` = tarif commun à tous les sites du tenant.
  tarifNiveau: "column",
  // Une conversation porte `siteId` (`null` = conversation hors site, par
  // exemple un échange direct entre deux personnes).
  conversation: "column",

  // --- rattachement via l'élève ---
  absence: { one: "eleve" },
  bulletin: { one: "eleve" },
  bulletinHistorique: { chain: ["bulletin", "eleve"] },
  note: { one: "eleve" },
  incident: { one: "eleve" },
  dispenseMatiere: { one: "eleve" },
  parcoursScolaire: { one: "eleve" },
  eleveParent: { one: "eleve" },
  exclusionEleve: { one: "eleve" },
  // `ProgressionEleve.eleveId` est un simple champ optionnel, sans relation :
  // le rattachement passe par le cours.
  progressionEleve: { one: "cours" },

  // --- rattachement via la classe ---
  evaluation: { one: "classe" },
  emploiTemps: { one: "classe" },

  // --- rattachement via la facture / l'examen ---
  paiement: { one: "facture" },
  relance: { one: "facture" },
  sessionExamen: { one: "examen" },

  // --- rattachement via la conversation ---
  message: { one: "conversation" },
  conversationParticipant: { one: "conversation" },

  // --- rattachement via l'utilisateur (personnel) ---
  parent: { one: "user" },
  // FicheRH n'a pas de colonne siteId propre : Enseignant non plus (il est
  // multi-site via EnseignantSite). Le seul chemin direct vers une colonne
  // siteId est FicheRH -> Enseignant -> User.siteId.
  ficheRH: { chain: ["enseignant", "user"] },

  // --- rattachement via une relation vers-plusieurs ---
  // Un enseignant est rattaché à ses sites par EnseignantSite.
  enseignant: { many: "sites" },

  // --- rattachement indirect ---
  // Incident et Bulletin n'ont pas de siteId propre (seul Eleve en a un).
  sanction: { chain: ["incident", "eleve"] },
  bulletinMatiere: { chain: ["bulletin", "eleve"] },
  contenuCours: { one: "cours" },
  absencePersonnel: { chain: ["enseignant", "user"] },
  congePersonnel: { chain: ["enseignant", "user"] },
  bulletinPaie: { chain: ["ficheRH", "enseignant", "user"] },

  // --- LEARNOS (docs/learnos-integration-plan.md) — toutes portent siteId ---
  chapitre: "column",
  competence: "column",
  learningEvidence: "column",
  studentLearningProfile: "column",
  studentIntervention: "column",
  aiDecisionLog: "column",
  learnosEvent: "column",
  evaluationCompetence: "column",
  seuilsRecommandation: "column",
  recommandation: "column",
  planProgression: "column",
  planificationChapitre: "column",
  kpiSnapshot: "column",
  // EtapePlan n'a pas de siteId : son rattachement passe par le plan.
  etapePlan: { one: "plan" },
  question: "column",
  feuilleExercices: "column",
  // Ni l'exercice servi ni la réponse ne portent de siteId : ils appartiennent
  // à la feuille, qui appartient à l'élève. Un siteId propre pourrait diverger
  // du sien si l'élève change de site en cours d'année.
  exerciceAssigne: { one: "feuille" },
  exerciceReponse: { chain: ["exercice", "feuille"] },
  alerteParent: "column",
  echangeParent: "column",

  // --- Infirmerie & santé ---
  passageInfirmerie: "column",
  ficheSanitaire: "column",

  // --- Cahier de textes / devoirs ---
  devoir: "column",

  // --- Remplacements de cours ---
  remplacementCours: "column",

  // --- Entretiens conseiller ---
  entretienConseiller: "column",

  // --- données de référence, partagées par tous les sites du tenant ---
  // Les préférences d'une famille suivent la famille, pas l'établissement :
  // un enfant qui change de site ne remet pas à zéro le consentement de ses
  // parents. Le modèle ne porte donc pas de `siteId`.
  preferencesParent: "tenant",
  periode: "tenant",
  anneesScolaires: "tenant",
  evenementCalendaire: "tenant",
  planificationCompetence: "column",
  patternPedagogique: "column",
  predictionDifficulte: "column",
  calibrationSeuil: "column",
  journalApprentissage: "column",
  reglesAppreciation: "tenant",
  document: "tenant",
  tenant: "tenant",
  site: "tenant",
  userTenant: "tenant",
  userRole: "tenant",
  deviceToken: "tenant",
  // Le journal d'audit est transverse : il trace aussi les actions menées
  // hors périmètre de site (connexion, changement de tenant).
  auditLog: "tenant",
  // Cache technique d'appels LLM — aucune donnée nominative, aucune notion de site.
  aiCache: "tenant",
  account: "tenant",
  session: "tenant",
  verificationToken: "tenant",

  // --- Gouvernance (niveau tenant, pas de siteId) ---
  conseil: "tenant",
  membreConseil: "tenant",
  réunion: "tenant",
  résolution: "tenant",

  // --- Mentorat (niveau tenant, pas de siteId) ---
  mentorat: "tenant",
  objectifMentorat: "tenant",
  seanceMentorat: "tenant",

  // --- Journal de Progression Pédagogique (JPP) ---
  // SeancePedagogique porte un siteId propre. SeanceCompetence n'en a pas :
  // son rattachement passe par la séance.
  seancePedagogique: "column",
  seanceCompetence: { one: "seance" },
  seanceCommentaire: { one: "seance" },

  // --- Modules activables (niveau tenant, pas de siteId) ---
  module: "tenant",
  moduleActivation: "tenant",

  // --- Échéancier de paiement (rattaché à la facture qui porte siteId) ---
  echeancier: { one: "facture" },
  echeancePaiement: { chain: ["echeancier", "facture"] },

  // --- Demandes de lien parent/élève (niveau tenant, pas de siteId) ---
  demandeLienParent: "tenant",

  // --- Budget & dépenses (portent siteId, null = global tous sites) ---
  budget: "column",
  depense: "column",
  // Remise de caisse : porte siteId, null = remise globale (tous sites)
  remiseCaisse: "column",

  // --- Plans de leçon & grilles d'évaluation IA (portent siteId) ---
  planLecon: "column",
  rubriqueEvaluation: "column",

  // --- Tâches du personnel (portent siteId, null = global) ---
  tache: "column",

  // --- Historique de classe (rattaché à l'élève) ---
  historiqueClasse: { one: "eleve" },

  // --- Sync config (niveau tenant, unique par tenant) ---
  syncConfig: "tenant",

  // --- Calendrier officiel (global, pas de tenantId) ---
  calendrierOfficiel: "tenant",

  // --- Permissions utilisateur (niveau tenant, pas de siteId) ---
  userPermission: "tenant",

  // --- Affectation enseignant (rattaché à la classe qui porte siteId) ---
  affectationEnseignant: { one: "classe" },

  // --- Fournitures scolaires (portent siteId) ---
  demandeFourniture: "column",
  listeFournitureClasse: "column",
  listeFournitureItem: "tenant",

  // --- Campagne de réinscription (niveau tenant, pas de siteId) ---
  campagneReinscription: "tenant",
  invitationReinscription: { one: "eleve" },
};

/**
 * Modèles "column" où `siteId: null` signifie "partagé entre tous les sites"
 * (donnée de référence). Pour ces modèles, un filtrage par site inclut les
 * enregistrements `null`.
 *
 * Pour tous les autres modèles "column" (eleve, classe, facture, etc.),
 * `siteId: null` signifie "non assigné" et ne doit PAS apparaître quand
 * on filtre par site.
 */
const SHARED_NULL_MODELS = new Set([
  "matiere",
  "structure",
  "disponibiliteEnseignant",
  "indisponibiliteEnseignant",
  // Tarif applicable à tous les sites faute de site précisé.
  "tarifNiveau",
  // Une conversation sans site n'est pas « non assignée » : c'est un échange
  // qui ne relève d'aucun site (message direct). L'exclure du filtre ferait
  // disparaître les conversations personnelles de tout compte site-scopé.
  "conversation",
  // Référentiel pédagogique LEARNOS. Chapitres et compétences décrivent le
  // programme national : il est le même sur tous les campus, comme les
  // matières auxquelles ils se rattachent. Les traiter comme « non assignés »
  // revenait à réserver le curriculum au site qui le portait — l'annexe
  // n'affichait alors aucun chapitre. Les seuils, la planification annuelle et
  // les grilles d'évaluation suivent la même logique : ils sont arrêtés au
  // niveau de l'établissement, pas du campus.
  "chapitre",
  "competence",
  "seuilsRecommandation",
  "planificationChapitre",
  "planificationCompetence",
  "rubriqueEvaluation",
  // Journal technique des décisions IA : transverse au tenant.
  "aiDecisionLog",
]);

/**
 * Fragment d'isolation par site pour un modèle donné, en empruntant
 * automatiquement le bon chemin.
 *
 * À privilégier sur `siteFilterFromSession` / `siteFilterForRelation` : le
 * modèle est nommé, donc le chemin ne peut plus être choisi à tort.
 *
 *   prisma.note.findMany({ where: { tenantId, ...siteFilterForModel("note", session.user) } })
 */
export function siteFilterForModel(
  model: keyof typeof SITE_PATHS | string,
  claims: SessionSiteClaims
): Record<string, unknown> {
  const scope = resolveSiteScope(claims);
  const path = SITE_PATHS[model];

  if (!path) {
    // Modèle inconnu de la table : fail-closed plutôt que de laisser passer.
    // `site-scope.model.test.ts` garantit qu'aucun modèle réel n'atterrit ici.
    return DENY_ALL;
  }

  if (path === "tenant") return {};

  switch (scope.kind) {
    case "ALL":
    case "RELATION":
      return {};
    case "NONE":
      return DENY_ALL;
    case "SITES":
      break;
  }

  // Pour les modèles "column", `siteId: null` ne signifie "partagé" que pour
  // un ensemble restreint de modèles de référence (matière, structure…).
  // Pour eleve, classe, facture, etc., `null` = non assigné → exclu du filtre.
  const includeNull = path === "column" && SHARED_NULL_MODELS.has(model);
  const inSites = includeNull
    ? { OR: [{ siteId: { in: scope.siteIds } }, { siteId: null }] }
    : { siteId: { in: scope.siteIds } };

  if (path === "column") return { AND: [inSites] };
  if ("one" in path) return { AND: [{ [path.one]: inSites }] };
  if ("chain" in path) {
    const nested = path.chain.reduceRight<Record<string, unknown>>(
      (acc, relation) => ({ [relation]: acc }),
      inSites
    );
    return { AND: [nested] };
  }

  // Relation vers-plusieurs : rattaché à l'un de mes sites, ou rattaché à aucun
  // site (enregistrement partagé au niveau du tenant).
  return {
    AND: [
      {
        OR: [
          { [path.many]: { some: { siteId: { in: scope.siteIds } } } },
          { [path.many]: { none: {} } },
        ],
      },
    ],
  };
}

/**
 * Fusionne plusieurs fragments `where` sans perte.
 *
 * Indispensable dès qu'on combine deux fragments : tous encapsulent leurs
 * prédicats dans `AND`, un simple étalement (`{ ...a, ...b }`) écraserait donc
 * le premier. `mergeFilters` concatène les `AND` au lieu de les remplacer.
 */
export function mergeFilters(
  ...fragments: (Record<string, unknown> | undefined | null)[]
): Record<string, unknown> {
  const conditions: unknown[] = [];
  const out: Record<string, unknown> = {};

  for (const fragment of fragments) {
    if (!fragment) continue;
    for (const [key, value] of Object.entries(fragment)) {
      if (key === "AND") {
        conditions.push(...(Array.isArray(value) ? value : [value]));
      } else {
        out[key] = value;
      }
    }
  }

  if (conditions.length > 0) out.AND = conditions;
  return out;
}

/**
 * Options additionnelles pour `eleveScopeFilter`.
 */
export interface EleveScopeFilterOptions {
  /**
   * Restreint aux seuls `EleveParent` où `isGardien` est `true`.
   *
   * Un tuteur non gardien (belle-mère, oncle logé sous le même toit, etc.)
   * n'a pas accès aux factures ni aux bulletins : seuls les gardiens légaux
   * y ont droit. Ce drapeau injecte le prédicat `isGardien: true` dans le
   * filtre de périmètre personnel.
   */
  gardienOnly?: boolean;
}

/**
 * Filtre d'isolation complet pour un modèle rattaché à `Eleve` par une relation
 * (`Note`, `Absence`, `Bulletin`, …) : isolation par site **et** périmètre
 * personnel parent/élève.
 *
 * C'est l'entrée à privilégier dans toute route accessible à PARENT / STUDENT.
 *
 * @param options.gardienOnly ne remonter que les élèves dont le parent
 *   connecté est le tuteur légal (`isGardien: true`). Utilisé pour les
 *   factures et les bulletins, inaccessibles aux tuteurs non gardiens.
 */
export function eleveScopeFilter(
  claims: SessionSiteClaims & { userId?: string; id?: string },
  relation: string | null = "eleve",
  options?: EleveScopeFilterOptions
): Record<string, unknown> {
  const scope = resolveSiteScope(claims);
  const site = relation
    ? siteWhereForRelation(scope, relation)
    : siteWhere(scope);

  // Filtre de périmètre personnel, éventuellement restreint aux gardiens.
  const personal = personalScopeFilter(claims, relation);

  if (options?.gardienOnly && isRelationScopedRole(claims.role)) {
    const userId = claims.userId ?? claims.id;
    if (userId) {
      // Injecter `isGardien: true` dans le prédicat `parents.some(...)`.
      // `personalScopeFilter` construit `{ parents: { some: { parent: { userId } } } }`
      // encapsulé dans un `AND`. On ajoute un second prédicat sur la même
      // relation `parents` pour exiger `isGardien`.
      const gardienPredicate =
        claims.role === "STUDENT"
          ? {} // Un élève est toujours « gardien » de lui-même.
          : { parents: { some: { isGardien: true, parent: { userId } } } };

      const gardienFragment = relation
        ? { AND: [{ [relation]: gardienPredicate }] }
        : { AND: [gardienPredicate] };

      return mergeFilters(site, personal, gardienFragment);
    }
  }

  return mergeFilters(site, personal);
}

/**
 * Le `siteId` à inscrire sur un enregistrement créé par cet utilisateur.
 * Renvoie `null` quand aucun site unique ne peut être déduit (direction
 * générale en vue « tous les sites »).
 *
 * Ne JAMAIS étaler un fragment `where` dans un `data` de création : les
 * fragments ci-dessus décrivent des prédicats (`AND` / `OR`), pas des colonnes.
 */
export function siteIdForCreate(claims: SessionSiteClaims): string | null {
  const scope = resolveSiteScope(claims);
  if (scope.kind === "SITES" && scope.siteIds.length === 1) {
    return scope.siteIds[0];
  }
  return null;
}

/**
 * Vérifie qu'un site est obligatoire pour une création.
 *
 * Si le tenant a des sites (`tenantHasSites === true`) et que l'utilisateur
 * n'a pas de site sélectionné (`siteId` null/undefined et `siteIds` vide ou
 * multiple), retourne un message d'erreur. Sinon retourne `null` (OK).
 *
 * À utiliser en début de chaque fonction de création (élève, enseignant,
 * personnel, salle, etc.) pour bloquer et demander à l'utilisateur de
 * sélectionner un site avant de poursuivre.
 */
export function requireSiteIdForCreate(claims: SessionSiteClaims): string | null {
  if (!claims.tenantHasSites) return null;
  const scope = resolveSiteScope(claims);
  if (scope.kind === "ALL") {
    return "Veuillez sélectionner un site avant de créer un élément. Utilisez le sélecteur de site en haut de la page.";
  }
  if (scope.kind === "SITES" && scope.siteIds.length !== 1) {
    return "Veuillez sélectionner un site unique avant de créer un élément. Utilisez le sélecteur de site en haut de la page.";
  }
  return null;
}

// ------------------------------------------------------------
// API synchrone (session déjà disponible) — signatures historiques
// ------------------------------------------------------------

/**
 * Normalise l'entrée : soit un objet de revendications (forme recommandée,
 * `session.user` convient directement), soit l'ancienne liste d'arguments.
 */
function toClaims(
  first: SessionSiteClaims | string | undefined | null,
  siteId?: string | null,
  siteIds?: string[] | null,
  tenantHasSites?: boolean
): SessionSiteClaims {
  if (first && typeof first === "object") {
    return first;
  }
  return { role: first ?? null, siteId: siteId ?? null, siteIds: siteIds ?? [], tenantHasSites };
}

/**
 * Fragment de filtrage par site pour un modèle possédant une colonne `siteId`.
 *
 * Forme recommandée : `siteFilterFromSession(session.user)` — `session.user`
 * porte déjà `role`, `siteId`, `siteIds` et `tenantHasSites`.
 */
export function siteFilterFromSession(claims: SessionSiteClaims): Record<string, unknown>;
export function siteFilterFromSession(
  role: string | undefined | null,
  siteId: string | null | undefined,
  siteIds?: string[] | null,
  tenantHasSites?: boolean
): Record<string, unknown>;
export function siteFilterFromSession(
  first: SessionSiteClaims | string | undefined | null,
  siteId?: string | null,
  siteIds?: string[] | null,
  tenantHasSites?: boolean
): Record<string, unknown> {
  return siteWhere(resolveSiteScope(toClaims(first, siteId, siteIds, tenantHasSites)));
}

/**
 * Fragment de filtrage par site via une relation, pour les modèles sans
 * colonne `siteId`.
 *
 * Forme recommandée : `siteFilterForRelation(session.user, "eleve")`.
 */
export function siteFilterForRelation(
  claims: SessionSiteClaims,
  relation?: string
): Record<string, unknown>;
export function siteFilterForRelation(
  role: string | undefined | null,
  siteId: string | null | undefined,
  siteIds?: string[] | null,
  relation?: string,
  tenantHasSites?: boolean
): Record<string, unknown>;
export function siteFilterForRelation(
  first: SessionSiteClaims | string | undefined | null,
  second?: string | null,
  siteIds?: string[] | null,
  relation: string = "eleve",
  tenantHasSites?: boolean
): Record<string, unknown> {
  if (first && typeof first === "object") {
    return siteWhereForRelation(resolveSiteScope(first), (second as string) || "eleve");
  }
  return siteWhereForRelation(
    resolveSiteScope(toClaims(first, second as string | null, siteIds, tenantHasSites)),
    relation
  );
}

// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => typeof v === "string" && v.length > 0)));
}

export { DENY_ALL, IMPOSSIBLE_ID };
