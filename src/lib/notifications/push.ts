/**
 * EcolPro — Canal Push (Firebase Cloud Messaging, API HTTP v1)
 * Docs: https://firebase.google.com/docs/cloud-messaging/migrate-v1
 *
 * Variable d'environnement :
 *   FCM_SERVICE_ACCOUNT = contenu JSON du compte de service Firebase
 *                         (ou sa version base64). Contient project_id,
 *                         client_email, private_key.
 *
 * Couvre Android ET iOS : FCM relaie vers APNs pour les appareils Apple.
 * Si la variable est absente, l'envoi est simulé (dev / sandbox).
 */

import { SignJWT, importPKCS8 } from "jose";

export interface PushResult {
  success: boolean;
  sent: number;
  failed: number;
  invalidTokens: string[];
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    const sa = JSON.parse(json) as ServiceAccount;
    if (!sa.project_id || !sa.client_email || !sa.private_key) return null;
    return sa;
  } catch (e) {
    console.error("[Push] FCM_SERVICE_ACCOUNT invalide:", e);
    return null;
  }
}

// Cache du jeton d'accès OAuth (valable ~1h).
let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(sa.private_key, "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Échec OAuth Google: ${JSON.stringify(data)}`);
  }
  cachedToken = {
    token: data.access_token,
    exp: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

/**
 * Envoie une notification push à une liste de tokens d'appareils.
 * Retourne la liste des tokens invalides (à désactiver côté DB).
 */
export async function sendPush(
  tokens: string[],
  payload: { title: string; body: string; data?: Record<string, string> }
): Promise<PushResult> {
  const unique = [...new Set(tokens.filter(Boolean))];
  if (unique.length === 0) return { success: true, sent: 0, failed: 0, invalidTokens: [] };

  const sa = loadServiceAccount();
  if (!sa) {
    console.warn(`[Push] FCM_SERVICE_ACCOUNT manquant — simulation (${unique.length} appareils)`);
    return { success: true, sent: unique.length, failed: 0, invalidTokens: [] };
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(sa);
  } catch (e) {
    console.error("[Push] Impossible d'obtenir le jeton FCM:", e);
    return { success: false, sent: 0, failed: unique.length, invalidTokens: [] };
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  // FCM v1 : un message par token. Envoi concurrent par lots de 100.
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const results = await Promise.allSettled(
      batch.map((token) =>
        fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: payload.title, body: payload.body },
              data: payload.data ?? {},
            },
          }),
        }).then(async (r) => ({ token, ok: r.ok, status: r.status }))
      )
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.ok) {
        sent++;
      } else {
        failed++;
        // 404 / 400 = token expiré ou invalide → à purger.
        if (r.status === "fulfilled" && (r.value.status === 404 || r.value.status === 400)) {
          invalidTokens.push(r.value.token);
        }
      }
    }
  }

  return { success: failed === 0, sent, failed, invalidTokens };
}
