/**
 * SchoolPro — Cloudflare Turnstile : vérification server-side
 * ============================================================
 * Vérifie le jeton Turnstile soumis par le client auprès de l'API
 * siteverify de Cloudflare. Le secret reste côté serveur.
 *
 * En l'absence de `TURNSTILE_SECRET` (développement local), la
 * vérification est contournée : on renvoie `success: true` pour ne
 * pas bloquer le workflow. En production, le secret DOIT être défini.
 */

interface SiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

export interface TurnstileResult {
  success: boolean;
  error?: string;
}

/**
 * Vérifie un jeton Turnstile côté serveur.
 *
 * @param token  Jeton `cf-turnstile-response` envoyé par le widget client.
 * @param ip     IP du client (optionnel, pour le logging Cloudflare).
 * @returns      `{ success: true }` si le jeton est valide.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  ip?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET;

  // ─── Mode développement : pas de secret, pas de vérification ────────────
  // On logge un avertissement pour éviter qu'un déploiement de prod
  // oublie silencieusement la protection.
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[turnstile] TURNSTILE_SECRET non défini en production — " +
          "la vérification est désactivée. Configurez le secret immédiatement.",
      );
    }
    return { success: true };
  }

  if (!token) {
    return { success: false, error: "token_manquant" };
  }

  try {
    const body = new URLSearchParams({
      secret,
      response: token,
    });
    if (ip) body.set("remoteip", ip);

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    );

    const data = (await res.json()) as SiteverifyResponse;

    if (!data.success) {
      return {
        success: false,
        error: data["error-codes"]?.[0] ?? "verification_echouee",
      };
    }

    return { success: true };
  } catch (err) {
    console.error("[turnstile] Erreur siteverify:", err);
    return { success: false, error: "erreur_reseau" };
  }
}

/**
 * Indique si Turnstile est activé (sitekey configuré côté client).
 * Utile pour conditionner l'affichage du widget.
 */
export function isTurnstileEnabled(): boolean {
  return !!process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY;
}
