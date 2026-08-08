/**
 * EcolPro — Wrapper Prisma avec injection automatique du filtre de site
 * ====================================================================
 *
 * `prismaSiteScoped()` retourne un Proxy autour du client Prisma qui injecte
 * automatiquement le filtre de site (`siteFilterForModel`) sur les méthodes de
 * lecture (`findMany`, `findFirst`, `findUnique`, `count`, `groupBy`,
 * `aggregate`).
 *
 * Le filtre est fusionné avec le `where` fourni par l'appelant via
 * `mergeFilters` — il ne peut pas être écrasé par un simple étalement.
 *
 * IMPORTANT — Limitations connues :
 *
 * 1. RELATIONS DANS LES `include` : Le Proxy ne filtre que le modèle racine.
 *    Les relations incluses via `include` / `select` ne sont PAS filtrées.
 *    La règle ESLint `require-site-filter` couvre cette lacune en signalant
 *    les `include` sans filtre de site.
 *
 * 2. `findUnique` : Prisma résout `findUnique` par clé primaire. Injecter un
 *    filtre de site transformerait l'appel en `findFirst` sémantiquement, mais
 *    Prisma rejette `findUnique` avec un `where` qui n'est pas une clé unique.
 *    On convertit donc `findUnique` → `findFirst` automatiquement.
 *
 * 3. MODÈLES "tenant" : Les modèles marqués `"tenant"` dans SITE_PATHS
 *    reçoivent un filtre vide `{}` — aucune surcoût, aucun comportement
 *    changé.
 *
 * Usage :
 *
 *   import { prismaSiteScoped } from "@/lib/prisma-site-scoped";
 *
 *   const scoped = await prismaSiteScoped();
 *   const eleves = await scoped.eleve.findMany({ where: { nom: "Doe" } });
 *   // → Prisma reçoit: { where: { AND: [{ tenantId: "..." }, { AND: [{ OR: [{ siteId: { in: [...] } }, { siteId: null }] }] }], nom: "Doe" } }
 */

import prisma from "@/lib/prisma";
import { getSessionSiteClaims } from "@/lib/site-filter";
import { siteFilterForModel, mergeFilters, type SessionSiteClaims } from "@/lib/site-scope";

type PrismaModel = Record<string, (...args: any[]) => Promise<any>>;

const READ_METHODS = new Set([
  "findMany",
  "findFirst",
  "findUnique",
  "count",
  "groupBy",
  "aggregate",
]);

/**
 * Wrapper Prisma avec injection automatique du filtre de site.
 *
 * Lit la session courante via `auth()` et construit un Proxy qui intercepte
 * toutes les méthodes de lecture pour injecter `siteFilterForModel`.
 *
 * @returns Un Proxy du client Prisma avec filtrage automatique.
 */
export async function prismaSiteScoped() {
  const claims = await getSessionSiteClaims();
  return createScopedProxy(prisma, claims);
}

/**
 * Variante synchrone : utile quand on a déjà les claims (ex: middleware,
 * tests). Évite un appel `auth()` redondant.
 */
export function prismaSiteScopedWithClaims(claims: SessionSiteClaims & { tenantId?: string | null }) {
  return createScopedProxy(prisma, claims);
}

function createScopedProxy(target: typeof prisma, claims: SessionSiteClaims & { tenantId?: string | null }) {
  return new Proxy(target, {
    get(target, model: string) {
      const original = (target as unknown as Record<string, PrismaModel>)[model];
      if (!original || typeof original !== "object") {
        return original;
      }

      return new Proxy(original, {
        get(modelTarget: PrismaModel, method: string) {
          const originalMethod = modelTarget[method];
          if (typeof originalMethod !== "function") {
            return originalMethod;
          }

          // Méthodes de lecture : injecter le filtre
          if (READ_METHODS.has(method)) {
            return (...args: any[]) => {
              const args0 = args[0] ? { ...args[0] } : {};
              const userWhere = args0.where ?? {};
              const siteFilter = siteFilterForModel(model, claims);
              const tenantFilter = claims.tenantId
                ? { tenantId: claims.tenantId }
                : {};

              // findUnique ne supporte pas de where non-unique → convertir en findFirst
              if (method === "findUnique") {
                args0.where = mergeFilters(tenantFilter, siteFilter, userWhere);
                return modelTarget["findFirst"]?.call(modelTarget, args0);
              }

              args0.where = mergeFilters(tenantFilter, siteFilter, userWhere);
              return originalMethod.call(modelTarget, args0);
            };
          }

          // Méthodes d'écriture : ne pas injecter (create, update, delete, etc.)
          // L'appelant doit explicitement valider l'appartenance au site.
          return originalMethod;
        },
      });
    },
  });
}
