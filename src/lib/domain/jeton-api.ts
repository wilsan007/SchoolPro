/**
 * SchoolPro — Jeton d'API par empreinte SHA-256
 * ============================================================
 *
 * Inspiré de GOSE 2.0 — le jeton en clair n'est JAMAIS persisté.
 * On compare son empreinte SHA-256 à la table des jetons d'API.
 *
 * Le jeton n'est JAMAIS l'identifiant de l'utilisateur : on sépare
 * les concepts. Le jeton est un secret partagé entre le client et
 * le serveur, stocké uniquement sous forme de hash.
 *
 * Sécurité :
 *   1. Le jeton en clair n'est stocké nulle part (ni en base, ni en log)
 *   2. L'empreinte SHA-256 est irréversible
 *   3. Le jeton a une date d'expiration
 *   4. Le jeton peut être révoqué explicitement
 *   5. La comparaison se fait en temps constant (timing-safe)
 *
 * Usage :
 *   // Génération
 *   const { token, empreinte } = genererJetonApi();
 *   // → token est renvoyé au client UNE SEULE FOIS
 *   // → empreinte est stockée en base
 *
 *   // Vérification
 *   const jeton = verifierJetonApi(token, jetonsEnBase);
 *   // → retourne le jeton si valide, null sinon
 */

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Représentation d'un jeton d'API stocké en base (empreinte uniquement).
 */
export interface JetonApi {
  id: string;
  /** Empreinte SHA-256 du jeton en clair — JAMAIS le jeton lui-même */
  empreinte: string;
  /** Identifiant de l'utilisateur propriétaire du jeton */
  utilisateurId: string;
  /** Tenant auquel le jeton est rattaché */
  tenantId: string;
  /** Date de création */
  creeLe: Date;
  /** Date d'expiration */
  expireLe: Date;
  /** Date de révocation (null si actif) */
  revoqueLe: Date | null;
  /** Libellé descriptif (ex: "App mobile", "Intégration RH") */
  libelle?: string;
}

/**
 * Génère un jeton d'API aléatoire et son empreinte SHA-256.
 *
 * @returns { token, empreinte } — le token est renvoyé au client UNE SEULE FOIS,
 *          l'empreinte est stockée en base.
 */
export function genererJetonApi(): {
  token: string;
  empreinte: string;
} {
  // 32 octets aléatoires = 256 bits d'entropie, encodés en hex (64 caractères)
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const empreinte = hasherJeton(token);

  return { token, empreinte };
}

/**
 * Calcule l'empreinte SHA-256 d'un jeton en clair.
 */
export function hasherJeton(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Vérifie qu'un jeton en clair correspond à une empreinte stockée.
 * Utilise une comparaison en temps constant pour empêcher les attaques par timing.
 *
 * @param tokenClair le jeton fourni par le client
 * @param empreinteStockee l'empreinte stockée en base
 * @returns true si le jeton correspond à l'empreinte
 */
export function verifierEmpreinte(
  tokenClair: string,
  empreinteStockee: string
): boolean {
  if (!tokenClair || !empreinteStockee) return false;

  const empreinteCalculee = hasherJeton(tokenClair);

  // Comparaison en temps constant pour empêcher les attaques par timing
  if (empreinteCalculee.length !== empreinteStockee.length) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(empreinteCalculee, "hex"),
      Buffer.from(empreinteStockee, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Vérifie qu'un jeton est valide (non expiré, non révoqué, empreinte correcte).
 *
 * @param tokenClair le jeton fourni par le client
 * @param jetonsEnBase liste des jetons actifs en base
 * @param maintenant date de référence (défaut: new Date())
 * @returns le jeton correspondant si valide, null sinon
 */
export function verifierJetonApi(
  tokenClair: string,
  jetonsEnBase: JetonApi[],
  maintenant: Date = new Date()
): JetonApi | null {
  if (!tokenClair) return null;

  for (const jeton of jetonsEnBase) {
    if (verifierEmpreinte(tokenClair, jeton.empreinte)) {
      if (estJetonExpire(jeton, maintenant)) continue;
      if (estJetonRevoque(jeton)) continue;
      return jeton;
    }
  }

  return null;
}

/**
 * Vérifie si un jeton est expiré.
 */
export function estJetonExpire(jeton: JetonApi, maintenant: Date = new Date()): boolean {
  return jeton.expireLe < maintenant;
}

/**
 * Vérifie si un jeton a été révoqué.
 */
export function estJetonRevoque(jeton: JetonApi): boolean {
  return jeton.revoqueLe !== null;
}

/**
 * Génère une date d'expiration par défaut (90 jours).
 */
export function expirationParDefaut(
  creeLe: Date = new Date(),
  jours: number = 90
): Date {
  const expire = new Date(creeLe);
  expire.setDate(expire.getDate() + jours);
  return expire;
}
