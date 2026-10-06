/**
 * Cache mémoire des données de RÉFÉRENCE — celles que chaque page relit et qui
 * ne changent presque jamais (années scolaires, sites, dérogations de
 * permissions).
 *
 * POURQUOI CE MODULE EXISTE
 * Chaque écran rejouait les mêmes lectures avant de charger ses propres
 * données : année active (1 à 3 requêtes, sur 48 pages), sites, dérogations.
 * Sur une base distante, un aller-retour coûte de 200 ms à plus d'une seconde :
 * ces lectures identiques d'une page à l'autre pesaient plusieurs secondes
 * avant le premier octet utile. Elles sont désormais servies depuis la mémoire
 * du processus.
 *
 * DEUX GARDE-FOUS CONTRE UNE DONNÉE PÉRIMÉE
 *   1. Invalidation à l'écriture : `extensionInvalidationReferentiels`
 *      (src/lib/prisma.ts) vide la famille concernée dès qu'un modèle de
 *      référence est modifié via Prisma, y compris dans une transaction.
 *   2. Durée de vie courte (`TTL_REFERENTIEL_MS`) : borne l'écart quand
 *      l'écriture vient d'ailleurs — autre machine, script, SQL direct.
 *
 * NE PAS Y METTRE de données d'activité (notes, absences, factures…) : seule
 * une donnée dont un retard de quelques secondes est sans conséquence a sa
 * place ici.
 */

/** Durée de vie d'une entrée. Volontairement courte : voir l'en-tête. */
export const TTL_REFERENTIEL_MS = 30_000;

/** Familles de données mises en cache — une par source de vérité. */
export type FamilleReferentiel = "annees" | "sites" | "permissions" | "blocage-financier";

interface Entree {
  expire: number;
  valeur: Promise<unknown>;
}

// Sur `globalThis` : en développement le module est réévalué à chaud, et le
// client Prisma (lui aussi global) doit continuer d'invalider la MÊME carte.
const globalCache = globalThis as unknown as {
  __referentiels?: Map<FamilleReferentiel, Map<string, Entree>>;
};
const familles = (globalCache.__referentiels ??= new Map());

/** Au-delà, on purge les entrées expirées plutôt que de laisser la carte grossir. */
const TAILLE_MAX_FAMILLE = 5_000;

/**
 * Renvoie la valeur en cache pour `(famille, cle)`, ou exécute `charger`.
 *
 * La PROMESSE est mise en cache, pas le résultat : dix lectures simultanées de
 * la même clé ne déclenchent qu'une requête. Une promesse rejetée est retirée
 * aussitôt, pour qu'une erreur passagère ne reste pas servie pendant 30 s.
 */
export function referentiel<T>(
  famille: FamilleReferentiel,
  cle: string,
  charger: () => Promise<T>,
  ttlMs: number = TTL_REFERENTIEL_MS,
): Promise<T> {
  // Sous test, chaque cas pose ses propres données simulées : un cache
  // partagé entre deux cas servirait à l'un les données de l'autre.
  if (process.env.NODE_ENV === "test") return charger();

  let entrees = familles.get(famille);
  if (!entrees) {
    entrees = new Map();
    familles.set(famille, entrees);
  }

  const maintenant = Date.now();
  const existante = entrees.get(cle);
  if (existante && existante.expire > maintenant) return existante.valeur as Promise<T>;

  if (entrees.size >= TAILLE_MAX_FAMILLE) {
    for (const [k, e] of entrees) if (e.expire <= maintenant) entrees.delete(k);
  }

  const carte = entrees;
  const valeur = charger();
  const entree: Entree = { expire: maintenant + ttlMs, valeur };
  carte.set(cle, entree);
  valeur.catch(() => {
    if (carte.get(cle) === entree) carte.delete(cle);
  });
  return valeur;
}

/** Vide une famille entière (toutes clés, tous tenants). */
export function invaliderReferentiel(famille: FamilleReferentiel): void {
  familles.get(famille)?.clear();
}

/**
 * Modèle Prisma → familles à vider quand il est modifié.
 *
 * L'invalidation est grossière (toute la famille, tous tenants) : ces écritures
 * sont rares, et une invalidation trop large ne coûte qu'une relecture.
 */
const MODELES_REFERENTIELS: Record<string, FamilleReferentiel[]> = {
  AnneesScolaires: ["annees"],
  Site: ["sites"],
  UserSite: ["sites"],
  EnseignantSite: ["sites"],
  UserPermission: ["permissions"],
  // Le blocage dépend du statut de l'élève, de ses exclusions et du lien
  // parent → enfant : les trois le remettent en cause.
  ExclusionEleve: ["blocage-financier"],
  Eleve: ["blocage-financier"],
  EleveParent: ["blocage-financier"],
};

const ECRITURES = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

/** Familles à vider pour une opération Prisma donnée, ou `null`. */
export function famillesAInvalider(
  model: string | undefined,
  operation: string,
): FamilleReferentiel[] | null {
  if (!model || !ECRITURES.has(operation)) return null;
  return MODELES_REFERENTIELS[model] ?? null;
}
