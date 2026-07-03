/**
 * EcolPro — Rate Limiting (in-memory token bucket)
 * ============================================================
 * Simple rate limiter pour les routes API sensibles (login, upload, etc.).
 * Utilise un Map en mémoire — suffisant pour un seul serveur.
 * Pour multi-instance, remplacer par Redis (Upstash).
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

interface RateLimitOptions {
  /** Nombre maximum de requêtes dans la fenêtre. */
  max: number;
  /** Fenêtre en secondes. */
  windowSec: number;
  /** Clé unique (ex: IP + route). */
  key: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Vérifie si une requête est autorisée selon le rate limit.
 * Algorithme : token bucket simplifié.
 */
export function rateLimit(opts: RateLimitOptions): RateLimitResult {
  const { max, windowSec, key } = opts;
  const now = Date.now();
  const windowMs = windowSec * 1000;

  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: max, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Replenish tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const refill = (elapsed / windowMs) * max;
  bucket.tokens = Math.min(max, bucket.tokens + refill);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      resetAt: now + windowMs,
    };
  }

  return {
    allowed: false,
    remaining: 0,
    resetAt: now + windowMs,
  };
}

/**
 * Récupère l'IP du client à partir de la requête.
 */
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

/**
 * Nettoie les buckets expirés (à appeler périodiquement).
 */
export function cleanupBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > 300_000) {
      buckets.delete(key);
    }
  }
}
