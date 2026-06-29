import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  return NextResponse.json({ error: "Token invalide" }, { status: 403 });
}

/**
 * POST /api/webhooks/whatsapp
 * Reçoit les messages et statuts WhatsApp Business API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Vérification signature (production)
    // const sig = request.headers.get("x-hub-signature-256");
    // → à implémenter avec WHATSAPP_APP_SECRET pour sécuriser

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

            console.log(`[WhatsApp Webhook] Message de ${from}: ${text}`);

            // Chercher le parent par téléphone
            const parent = await prisma.parent.findFirst({
              where: {
                OR: [
                  { phone: from },
                  { phone: `+${from}` },
                ],
              },
            });

            if (parent) {
              await prisma.notification.create({
                data: {
                  tenantId: parent.tenantId,
                  titre: `WhatsApp de ${parent.prenom} ${parent.nom}`,
                  contenu: text,
                  canal: "IN_APP", // WhatsApp entrant tracé comme notification interne
                  cible: "TOUS",
                  statut: "ENVOYEE",
                  nbDestinataires: 1,
                  nbDelivres: 1,
                  nbLus: 1,
                },
              });
            }
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
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
