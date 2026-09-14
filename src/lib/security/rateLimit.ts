/**
 * EcolPro — Rate Limiting (in-memory token bucket)
 * ============================================================
 * Simple rate limiter pour les routes API sensibles (login, upload, etc.).
 * Utilise un Map en mémoire — suffisant pour un seul serveur.
 * Pour multi-instance, remplacer par Redis (Upstash).
 *
 * AUTH-H3 (audit v2) : pour les routes critiques (login), utiliser
 * `rateLimitDb` qui s'appuie sur un compteur atomique en base de données,
 * partagé entre toutes les instances. Le rate limit in-memory reste
 * disponible pour les routes moins sensibles.
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
 *
 * AUTH-H4 (audit v2) : `x-forwarded-for[0]` est falsifiable par le client.
 * On utilise désormais un en-tête de confiance configurable via
 * `TRUSTED_IP_HEADER` (ex: `cf-connecting-ip` pour Cloudflare). En
 * l'absence de cette variable, on refuse de faire confiance à
 * `x-forwarded-for` et on retourne "unknown" — le rate limit devient
 * global plutôt que par IP, ce qui est plus restrictif mais sûr.
 */
export function getClientIP(req: Request): string {
  const trustedHeader = process.env.TRUSTED_IP_HEADER;
  if (trustedHeader) {
    const ip = req.headers.get(trustedHeader);
    if (ip) return ip.trim();
  }
  // En production sans TRUSTED_IP_HEADER, on ne fait pas confiance à
  // x-forwarded-for. En dev, on l'accepte pour les tests locaux.
  if (process.env.NODE_ENV !== "production") {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    const real = req.headers.get("x-real-ip");
    if (real) return real;
  }
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

// ============================================================
// AUTH-H3 (audit v2) — Rate limit DB-backed + lockout
// ============================================================
// Le rate limit in-memory n'est pas partagé entre instances Fly.io.
// Cette version s'appuie sur un compteur atomique en base, partagé
// entre toutes les instances. Utilisée pour les routes critiques
// (login, set-password).

import prisma from "@/lib/prisma";

/**
 * Rate limit DB-backed : compte les requêtes dans une fenêtre donnée.
 * Atomique via `upsert` + `increment`.
 *
 * @returns `allowed: false` si le compteur dépasse `max` dans la fenêtre.
 */
export async function rateLimitDb(opts: RateLimitOptions): Promise<RateLimitResult> {
  const { max, windowSec, key } = opts;
  const now = Date.now();
  const windowStart = new Date(now - (now % (windowSec * 1000)));

  try {
     
    const counter = await prisma.rateLimitCounter.upsert({
      where: { key },
      create: { key, count: 1, windowStart },
      update: {
        count: { increment: 1 },
        windowStart, // remet la fenêtre à jour si elle a changé
      },
    });

    // Si la fenêtre a changé depuis le dernier enregistrement, le compteur
    // est réinitialisé par le `create`. Mais si l'update a incrémenté un
    // compteur d'une fenêtre précédente, on doit réinitialiser.
    if (counter.windowStart.getTime() !== windowStart.getTime()) {
       
      await prisma.rateLimitCounter.update({
        where: { key },
        data: { count: 1, windowStart },
      });
      return { allowed: true, remaining: max - 1, resetAt: now + windowSec * 1000 };
    }

    if (counter.count <= max) {
      return {
        allowed: true,
        remaining: max - counter.count,
        resetAt: now + windowSec * 1000,
      };
    }

    return {
      allowed: false,
      remaining: 0,
      resetAt: now + windowSec * 1000,
    };
  } catch (err) {
    // En cas d'erreur DB, on fail-open pour ne pas bloquer l'authentification,
    // mais on log l'erreur.
    console.error("[rateLimitDb] Erreur, fail-open:", err);
    return { allowed: true, remaining: max, resetAt: now + windowSec * 1000 };
  }
}

/**
 * AUTH-H3 : Lockout après `maxAttempts` échecs.
 *
 * Vérifie si une clé (ex: `login:email:user@ex.com`) a dépassé le seuil
 * d'échecs dans la fenêtre donnée. À appeler AVANT la vérification du
 * mot de passe.
 */
export async function isLockedOut(
  key: string,
  maxAttempts: number = 5,
  windowSec: number = 900,
): Promise<boolean> {
  const now = Date.now();
  const windowStart = new Date(now - (now % (windowSec * 1000)));

  try {
     
    const counter = await prisma.rateLimitCounter.findUnique({
      where: { key },
    });

    if (!counter) return false;
    if (counter.windowStart.getTime() !== windowStart.getTime()) return false;
    return counter.count >= maxAttempts;
  } catch (e) {
    console.warn("[non-fatal]", e);
    // Fail-open : ne pas bloquer si la DB est injoignable.
    return false;
  }
}

/**
 * AUTH-H3 : Réinitialise le compteur d'échecs après une réussite.
 */
export async function resetAttempts(key: string): Promise<void> {
  try {
     
    await prisma.rateLimitCounter.deleteMany({ where: { key } });
  } catch (e) {
    console.warn("[non-fatal]", e);
    // Ignore : le compteur sera nettoyé à la prochaine fenêtre.
  }
}
