import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMetaSignature } from "@/lib/webhooks";
import { repondreAuParent } from "@/lib/learnos/bot-parent-webhook";
import { erreurJson } from "@/lib/erreurs-api";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "ecolpro_whatsapp_token";

/**
 * GET /api/webhooks/whatsapp
 * Vérification du webhook par Meta (WhatsApp Business API)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WhatsApp Webhook] Vérification réussie");
    return new NextResponse(challenge, { status: 200 });
  }

  return erreurJson("TOKEN_INVALIDE");
}

/**
 * POST /api/webhooks/whatsapp
 * Reçoit les messages et statuts WhatsApp Business API
 */
export async function POST(request: NextRequest) {
  try {
    // Lecture du corps brut pour vérifier la signature HMAC de Meta.
    const raw = await request.text();
    const signature = request.headers.get("x-hub-signature-256");
    if (!verifyMetaSignature(raw, signature, process.env.WHATSAPP_APP_SECRET)) {
      return erreurJson("SIGNATURE_INVALIDE");
    }

    const body = JSON.parse(raw);

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ ok: true });
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;

        // Messages entrants
        if (value.messages) {
          for (const msg of value.messages) {
            const from = msg.from; // numéro international
            const text = msg.text?.body ?? msg.type ?? "(media)";

            console.log(`[WhatsApp Webhook] Message de ${from}`);

            // Le traitement est délibérément à l'intérieur de la boucle et
            // attendu : sur Vercel, la fonction est gelée dès la réponse
            // renvoyée, donc un `void` ici perdrait la réponse au parent.
            await repondreAuParent({ telephone: from, texte: text, canal: "whatsapp" });
          }
        }

        // Statuts de livraison
        if (value.statuses) {
          for (const status of value.statuses) {
            console.log(`[WhatsApp Webhook] Statut message ${status.id}: ${status.status}`);
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[WhatsApp Webhook] Erreur:", err);
    return erreurJson("ERREUR_SERVEUR");
  }
}
