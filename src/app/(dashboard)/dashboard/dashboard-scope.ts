import {
  siteFilterForModel,
  personalScopeFilter,
  mergeFilters,
  isRelationScopedRole,
  DENY_ALL,
  type SessionSiteClaims,
} from "@/lib/site-scope";
import type { Prisma } from "@prisma/client";

/**
 * Revendications nécessaires au calcul du périmètre : celles du site
 * (`SessionSiteClaims`) plus l'identité, indispensable au périmètre personnel
 * d'un PARENT / STUDENT. `session.user` satisfait cette forme (champ `id`).
 */
export type DashboardScopeClaims = SessionSiteClaims & {
  id?: string;
  userId?: string;
};

export interface DashboardWheres {
  eleve: Prisma.EleveWhereInput;
  classe: Prisma.ClasseWhereInput;
  absence: Prisma.AbsenceWhereInput;
  note: Prisma.NoteWhereInput;
  examen: Prisma.ExamenWhereInput;
  /**
   * `true` pour les rôles à périmètre relationnel (PARENT / STUDENT) : les
   * agrégats « établissement » (nombre de classes, prochain examen du site)
   * n'ont aucun sens pour eux et les requêtes correspondantes ne sont pas
   * exécutées.
   */
  relationScoped: boolean;
}

/**
 * Construction des filtres `where` du tableau de bord — fonction PURE, testée
 * dans `dashboard-scope.test.ts` pour les 11 rôles.
 *
 * Deux périmètres se cumulent obligatoirement :
 *
 *  - périmètre de SITE (`siteFilterForModel`) : neutre (`{}`) pour PARENT /
 *    STUDENT, car `resolveSiteScope` renvoie `{ kind: "RELATION" }` ;
 *  - périmètre PERSONNEL (`personalScopeFilter`) : neutre pour tous les autres
 *    rôles, contraignant pour PARENT (ses enfants) et STUDENT (lui-même).
 *
 * `siteFilterForModel` employé SEUL laissait donc un parent ou un élève lire
 * les notes nominatives, les effectifs et les absences de tout le tenant.
 * Les deux fragments sont fusionnés par `mergeFilters` : un simple étalement
 * (`{ ...a, ...b }`) écraserait le `AND` du premier.
 *
 * Choix assumé pour `classe` et `examen` : ces modèles n'ont AUCUN chemin vers
 * un élève (pas de relation `eleve`), le périmètre personnel n'y est donc pas
 * exprimable. Plutôt qu'un filtre neutre (= tout l'établissement, la fuite
 * d'origine) ou une jointure arbitraire (« les classes de mes enfants », qui ne
 * correspond pas au libellé « Nombre de classes »), on applique `DENY_ALL` :
 * fail-closed. Le code reste ainsi correct même si l'aiguillage par rôle de
 * `/dashboard` était retiré un jour ; le parent verrait 0 classe et aucun
 * examen, jamais les chiffres de l'établissement.
 */
export function buildDashboardWheres(
  tenantId: string,
  claims: DashboardScopeClaims
): DashboardWheres {
  const relationScoped = isRelationScopedRole(claims.role);
  const base = { tenantId };

  // `note` et `absence` n'ont pas de colonne `siteId` : ils se filtrent via la
  // relation `eleve`, sur laquelle porte aussi le lien personnel.
  const note = mergeFilters(
    base,
    siteFilterForModel("note", claims),
    personalScopeFilter(claims, "eleve")
  );
  const absence = mergeFilters(
    base,
    siteFilterForModel("absence", claims),
    personalScopeFilter(claims, "eleve")
  );
  // `eleve` est la cible elle-même : relation `null`.
  const eleve = mergeFilters(
    { ...base, deletedAt: null },
    siteFilterForModel("eleve", claims),
    personalScopeFilter(claims, null)
  );
  // Pas de chemin vers l'élève → fail-closed pour les périmètres relationnels.
  const etablissementWide = relationScoped ? DENY_ALL : null;
  const classe = mergeFilters(base, siteFilterForModel("classe", claims), etablissementWide);
  const examen = mergeFilters(base, siteFilterForModel("examen", claims), etablissementWide);

  return {
    eleve: eleve as unknown as Prisma.EleveWhereInput,
    classe: classe as unknown as Prisma.ClasseWhereInput,
    absence: absence as unknown as Prisma.AbsenceWhereInput,
    note: note as unknown as Prisma.NoteWhereInput,
    examen: examen as unknown as Prisma.ExamenWhereInput,
    relationScoped,
  };
}

/**
 * Clé de cache discriminant réellement l'appelant.
 *
 * `unstable_cache` compose sa clé à partir des `keyParts` **et** de
 * `JSON.stringify(args)`. Avec `["dashboard-data"]` et `(tenantId, claims)`,
 * la discrimination reposait donc entièrement sur la sérialisation d'un objet
 * `session.user` complet — fragile (ordre des clés, champs volatils comme
 * `image`/`availableTenants`) et non intentionnelle : toute évolution de la
 * forme de `session.user` (ou un appel avec des revendications réduites) pouvait
 * faire collisionner deux rôles, et donc servir à un parent la réponse mise en
 * cache pour un enseignant. On rend la clé explicite : rôle + identité + site
 * + sites autorisés + mono/multi-site.
 */
export function dashboardCacheKey(tenantId: string, claims: DashboardScopeClaims): string {
  const userId = claims.userId ?? claims.id ?? "anonyme";
  const siteIds = [...(claims.siteIds ?? [])].sort().join("|");
  return [
    tenantId,
    claims.role ?? "sans-role",
    userId,
    claims.siteId ?? "tous",
    siteIds || "aucun",
    claims.tenantHasSites === false ? "mono" : "multi",
  ].join("::");
}
