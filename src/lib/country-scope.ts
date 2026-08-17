/**
 * Isolation par pays pour les modèles partagés entre tenants d'un même pays.
 *
 * Certains modèles pédagogiques (Question, Chapitre, Competence, Cours) et
 * le calendrier officiel (CalendrierOfficiel) peuvent être partagés entre
 * tous les tenants d'un même pays :
 *
 *   - `tenantId = NULL, country = "DJ"` → visible par tous les tenants de Djibouti.
 *   - `tenantId = "xxx"` → privé au tenant xxx (country est optionnel).
 *
 * Le filtre généré est :
 *
 *   WHERE (tenantId = :myTenantId) OR (tenantId IS NULL AND country = :myCountry)
 *
 * Analogique à `siteFilterForModel` mais pour la dimension pays.
 */

import type { SessionSiteClaims } from "./site-scope";

/**
 * Claims étendus avec le pays du tenant actif.
 * `country` est le code ISO du tenant (ex: "DJ", "SN").
 */
export interface CountryClaims extends SessionSiteClaims {
  /** ID du tenant actif. */
  tenantId?: string | null;
  /** Code ISO pays du tenant actif (ex: "DJ", "SN"). */
  country?: string | null;
}

/**
 * Modèles supportant le partage par pays.
 * `tenantId` est nullable sur ces modèles, `country` est renseigné quand
 * `tenantId` est null.
 */
const COUNTRY_SHARED_MODELS = new Set([
  "question",
  "chapitre",
  "competence",
  "cours",
]);

/**
 * Fragment d'isolation par pays pour un modèle partagé entre tenants.
 *
 * Pour les modèles tenant-scoped classiques (Note, Eleve, Facture…), ce filtre
 * ne s'applique pas — il faut continuer à utiliser `tenantId` directement.
 *
 * Pour les modèles dans `COUNTRY_SHARED_MODELS`, le filtre renvoie :
 *
 *   { OR: [{ tenantId: :myTenantId }, { tenantId: null, country: :myCountry }] }
 *
 * Si le tenant ou le pays ne peut être déterminé, on fail-closed (rien ne
 * remonte) pour éviter une fuite cross-tenant.
 *
 * @example
 *   prisma.question.findMany({
 *     where: {
 *       ...countryFilterForModel("question", session.user),
 *       ...siteFilterForModel("question", session.user),
 *     }
 *   })
 */
export function countryFilterForModel(
  model: string,
  claims: CountryClaims
): Record<string, unknown> {
  // Modèle non concerné par le partage par pays : pas de filtre.
  if (!COUNTRY_SHARED_MODELS.has(model)) {
    return {};
  }

  const tenantId = claims.tenantId ?? null;
  const country = claims.country ?? null;

  // Fail-closed : sans tenant ni pays, on ne remonte rien.
  if (!tenantId && !country) {
    return { AND: [{ id: "__COUNTRY_DENY_ALL__" }] };
  }

  // Si on a un tenant mais pas de pays, on ne voit que ses enregistrements privés.
  if (tenantId && !country) {
    return { tenantId };
  }

  // Si on a un pays mais pas de tenant (super-admin en vue globale ?),
  // on voit tous les enregistrements partagés de ce pays.
  if (!tenantId && country) {
    return { country };
  }

  // Cas normal : on voit ses enregistrements privés + les partagés du pays.
  return {
    OR: [
      { tenantId },
      { tenantId: null, country },
    ],
  };
}

/**
 * Filtre pour le calendrier officiel (CalendrierOfficiel).
 *
 * Contrairement aux modèles pédagogiques, CalendrierOfficiel n'a pas de
 * `tenantId` — il est purement country-scoped. Le filtre est donc simple :
 *
 *   WHERE country = :myCountry
 *
 * @example
 *   prisma.calendrierOfficiel.findMany({
 *     where: calendrierOfficielFilter(session.user)
 *   })
 */
export function calendrierOfficielFilter(
  claims: CountryClaims
): Record<string, unknown> {
  const country = claims.country ?? null;

  if (!country) {
    return { AND: [{ id: "__COUNTRY_DENY_ALL__" }] };
  }

  return { country };
}
