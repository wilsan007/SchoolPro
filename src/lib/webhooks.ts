/**
 * EcolPro — Vérification d'authenticité des webhooks entrants
 * ============================================================
 * Ces endpoints sont accessibles sans session (appelés par des tiers).
 * Leur sécurité repose donc sur une signature / un secret partagé.
 */

import crypto from "crypto";
import type { NextRequest } from "next/server";

/**
 * Vérifie la signature HMAC SHA-256 de Meta (WhatsApp / Messenger).
 * En-tête : `x-hub-signature-256: sha256=<hmac>`.
 *
 * Si `appSecret` n'est pas configuré → on laisse passer (mode dev),
 * mais on journalise un avertissement.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined
): boolean {
  if (!appSecret) {
    console.warn("[Webhook] WHATSAPP_APP_SECRET absent — signature non vérifiée (dev)");
    return true;
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
 * Si la variable d'env n'est pas définie → on laisse passer (dev).
 */
export function verifyWebhookSecret(req: NextRequest, envVarName: string): boolean {
  const secret = process.env[envVarName];
  if (!secret) {
    console.warn(`[Webhook] ${envVarName} absent — secret non vérifié (dev)`);
    return true;
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
