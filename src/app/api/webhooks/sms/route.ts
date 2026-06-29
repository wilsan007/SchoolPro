import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/webhooks/sms
 * Reçoit les delivery receipts et messages entrants d'Africa's Talking
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let body: Record<string, string> = {};

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await request.text();
      body = Object.fromEntries(new URLSearchParams(text));
    } else {
      body = await request.json();
    }

    // Delivery receipt
    if (body.status && body.id) {
      console.log(`[SMS Webhook] Delivery receipt — id: ${body.id}, status: ${body.status}`);
      // On pourrait stocker le statut de livraison en base ici
      return NextResponse.json({ ok: true });
    }

    // Message entrant
    if (body.text && body.from) {
      console.log(`[SMS Webhook] Message entrant de ${body.from}: ${body.text}`);

      // Chercher le parent par numéro de téléphone
      const parent = await prisma.parent.findFirst({
        where: { phone: body.from },
        include: { tenant: true },
      });

      if (parent) {
        // Créer une notification interne pour le suivi
        await prisma.notification.create({
          data: {
            tenantId: parent.tenantId,
            titre: `SMS entrant de ${parent.prenom} ${parent.nom}`,
            contenu: body.text,
            canal: "SMS",
            cible: "TOUS",
            statut: "ENVOYEE",
            nbDestinataires: 1,
            nbDelivres: 1,
            nbLus: 1,
          },
        });
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[SMS Webhook] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/sms
 * Endpoint de vérification Africa's Talking
 */
export async function GET() {
  return NextResponse.json({ status: "EcolPro SMS webhook actif" });
}
