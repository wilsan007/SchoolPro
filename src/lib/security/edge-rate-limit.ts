/**
 * SchoolPro — Rate Limiting Edge (middleware runtime)
 * ====================================================
 * Rate limiter en mémoire compatible Edge runtime (pas de `Map` globale
 * persistante entre isolats, mais suffisant pour un seul serveur VPS).
 *
 * Deux niveaux de protection :
 *  1. Limite globale sur toutes les routes API (anti-scraping, anti-spam).
 *  2. Limites strictes sur les endpoints d'authentification (anti brute-force).
 *
 * Pour multi-instance, remplacer par Redis (Upstash Ratelimit).
 */

interface EdgeBucket {
  count: number;
  resetAt: number;
}

// Map globale — partagée entre invocations du même isolat Edge.
const buckets = new Map<string, EdgeBucket>();

interface EdgeRateLimitOptions {
  /** Nombre maximum de requêtes dans la fenêtre. */
  max: number;
  /** Fenêtre en millisecondes. */
  windowMs: number;
  /** Clé unique (ex: IP + route). */
  key: string;
}

export interface EdgeRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Vérifie si une requête est autorisée selon le rate limit (fixed window).
 */
export function edgeRateLimit(opts: EdgeRateLimitOptions): EdgeRateLimitResult {
  const { max, windowMs, key } = opts;
  const now = Date.now();

  let bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  if (bucket.count < max) {
    bucket.count++;
    return {
      allowed: true,
      remaining: max - bucket.count,
      resetAt: bucket.resetAt,
    };
  }

  return {
    allowed: false,
    remaining: 0,
    resetAt: bucket.resetAt,
  };
}

/**
 * Récupère l'IP du client depuis les en-têtes de la requête Edge.
 */
export function getEdgeClientIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

/**
 * Nettoie les buckets expirés (appelé à chaque invocation pour limiter la mémoire).
 */
export function cleanupEdgeBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}

// ─── Configuration des limites par catégorie ──────────────────────────────

/** Limites pour les endpoints d'authentification (anti brute-force). */
const AUTH_LIMITS: Record<string, { max: number; windowMs: number }> = {
  // Login : 10 tentatives / 15 min / IP
  "/api/auth/callback/credentials": { max: 10, windowMs: 15 * 60_000 },
  // Forgot password : 5 requêtes / 15 min / IP (anti énumération d'emails)
  "/api/auth/forgot-password": { max: 5, windowMs: 15 * 60_000 },
  // Reset password : 10 requêtes / 15 min / IP
  "/api/auth/reset-password": { max: 10, windowMs: 15 * 60_000 },
  // Send verification : 3 requêtes / 15 min / IP
  "/api/auth/send-verification": { max: 3, windowMs: 15 * 60_000 },
  // Verify email : 10 requêtes / 15 min / IP
  "/api/auth/verify-email": { max: 10, windowMs: 15 * 60_000 },
  // Mobile login : 10 tentatives / 15 min / IP
  "/api/auth/mobile": { max: 10, windowMs: 15 * 60_000 },
};

/** Limite globale pour les routes API en écriture (POST/PATCH/PUT/DELETE). */
const WRITE_LIMIT = { max: 60, windowMs: 60_000 }; // 60 req/min/IP

/** Limite globale pour les routes API en lecture (GET). */
const READ_LIMIT = { max: 120, windowMs: 60_000 }; // 120 req/min/IP

/**
 * Applique le rate limiting à une requête API.
 * Retourne `null` si autorisé, ou un objet `{ status, retryAfter }` si bloqué.
 */
export function checkApiRateLimit(
  pathname: string,
  method: string,
  ip: string,
): { status: 429; retryAfter: number } | null {
  cleanupEdgeBuckets();

  // 1. Limite spécifique à l'endpoint d'auth (la plus stricte)
  const authLimit = AUTH_LIMITS[pathname];
  if (authLimit) {
    const rl = edgeRateLimit({
      max: authLimit.max,
      windowMs: authLimit.windowMs,
      key: `auth:${pathname}:${ip}`,
    });
    if (!rl.allowed) {
      return {
        status: 429,
        retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000),
      };
    }
  }

  // 2. Limite globale par méthode
  const isWrite = ["POST", "PATCH", "PUT", "DELETE"].includes(method.toUpperCase());
  const globalLimit = isWrite ? WRITE_LIMIT : READ_LIMIT;
  const rl = edgeRateLimit({
    max: globalLimit.max,
    windowMs: globalLimit.windowMs,
    key: `api:${isWrite ? "write" : "read"}:${ip}`,
  });
  if (!rl.allowed) {
    return {
      status: 429,
      retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000),
    };
  }

  return null;
}
