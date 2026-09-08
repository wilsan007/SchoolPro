import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { mettreAJourStatutEmail } from "@/lib/notifications/email-log";

/**
 * POST /api/webhooks/resend
 *
 * Reçoit les événements de Resend (email.delivered, bounced, failed,
 * complained, opened, delivery_delayed) et met à jour le statut
 * correspondant dans EmailLog.
 *
 * Sécurité : vérification de signature Svix (header `svix-signature`).
 * Si RESEND_WEBHOOK_SECRET n'est pas configuré, on laisse passer (dev).
 *
 * Configurer sur https://resend.com/webhooks :
 *   URL : https://votre-domaine.com/api/webhooks/resend
 *   Événements : tous
 */

interface ResendWebhookEvent {
  type: string; // "email.delivered", "email.bounced", etc.
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    bounce?: { message?: string };
    error?: { message?: string };
  };
}

/**
 * Vérifie la signature Svix du webhook Resend.
 * Resend utilise Svix pour signer ses webhooks : la signature est
 * calculée avec le secret partagé (whsec_...) sur le body brut.
 */
function verifySvixSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) {
    console.warn("[Webhook/Resend] RESEND_WEBHOOK_SECRET absent — signature non vérifiée (dev)");
    return true;
  }
  if (!signatureHeader) return false;

  // Svix signature format : "v1,t=<timestamp>,v1=<hmac>"
  // ou "v=<hmac>,t=<timestamp>"
  const parts = signatureHeader.split(",");
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const signaturePart = parts.find((p) => p.startsWith("v1=") || p.startsWith("v="));

  if (!timestampPart || !signaturePart) return false;

  const timestamp = timestampPart.split("=")[1];
  const signature = signaturePart.split("=")[1];

  // Le payload signé est : timestamp + "." + rawBody
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("base64");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("svix-signature");

    if (!verifySvixSignature(rawBody, signature, process.env.RESEND_WEBHOOK_SECRET)) {
      console.error("[Webhook/Resend] Signature invalide");
      return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
    }

    const event = JSON.parse(rawBody) as ResendWebhookEvent;

    // Extraire le type d'événement : "email.delivered" → "delivered"
    const evenement = event.type?.replace("email.", "") ?? "";
    const resendId = event.data?.email_id;

    if (!resendId || !evenement) {
      console.warn("[Webhook/Resend] Événement sans email_id ou type:", event.type);
      return NextResponse.json({ ok: true });
    }

    const timestamp = event.created_at ? new Date(event.created_at) : new Date();

    await mettreAJourStatutEmail(resendId, evenement, timestamp);

    console.log(`[Webhook/Resend] ${evenement} — resendId: ${resendId.slice(0, 12)}…`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Webhook/Resend] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/resend
 * Endpoint de vérification (health check).
 */
export async function GET() {
  return NextResponse.json({ status: "EcolPro Resend webhook actif" });
}
