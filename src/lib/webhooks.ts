/**
 * EcolPro — Vérification d'authenticité des webhooks entrants
 * ============================================================
 * Ces endpoints sont accessibles sans session (appelés par des tiers).
 * Leur sécurité repose donc sur une signature / un secret partagé.
 *
 * AUT-4 (audit v2) : en production, un secret absent rejette la requête.
 * L'ouverture en dev nécessite `WEBHOOK_DEV_INSECURE=true` explicitement.
 */

import crypto from "crypto";
import type { NextRequest } from "next/server";

/**
 * Indique si l'ouverture en mode dev est explicitement autorisée.
 * `WEBHOOK_DEV_INSECURE=true` permet de recevoir les webhooks sans secret
 * en développement. En production, cette variable est ignorée.
 */
function isDevInsecureAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.WEBHOOK_DEV_INSECURE === "true";
}

/**
 * Vérifie la signature HMAC SHA-256 de Meta (WhatsApp / Messenger).
 * En-tête : `x-hub-signature-256: sha256=<hmac>`.
 *
 * Si `appSecret` n'est pas configuré :
 *  - en production → rejette (false) ;
 *  - en dev avec `WEBHOOK_DEV_INSECURE=true` → laisse passer (true) ;
 *  - en dev sans `WEBHOOK_DEV_INSECURE` → rejette (false).
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined
): boolean {
  if (!appSecret) {
    if (isDevInsecureAllowed()) {
      console.warn("[Webhook] WHATSAPP_APP_SECRET absent — signature non vérifiée (dev, WEBHOOK_DEV_INSECURE=true)");
      return true;
    }
    console.error("[Webhook] WHATSAPP_APP_SECRET absent — requête rejetée");
    return false;
  }
  if (!signatureHeader) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Vérifie un secret partagé pour les webhooks sans signature native
 * (ex. Africa's Talking). Le secret peut arriver en query `?secret=`
 * ou en en-tête `x-webhook-secret`.
 *
 * Si la variable d'env n'est pas définie :
 *  - en production → rejette (false) ;
 *  - en dev avec `WEBHOOK_DEV_INSECURE=true` → laisse passer (true) ;
 *  - en dev sans `WEBHOOK_DEV_INSECURE` → rejette (false).
 */
export function verifyWebhookSecret(req: NextRequest, envVarName: string): boolean {
  const secret = process.env[envVarName];
  if (!secret) {
    if (isDevInsecureAllowed()) {
      console.warn(`[Webhook] ${envVarName} absent — secret non vérifié (dev, WEBHOOK_DEV_INSECURE=true)`);
      return true;
    }
    console.error(`[Webhook] ${envVarName} absent — requête rejetée`);
    return false;
  }
  const provided =
    new URL(req.url).searchParams.get("secret") ??
    req.headers.get("x-webhook-secret");
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
