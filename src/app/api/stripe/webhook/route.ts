import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || stripeKey.includes("xxxx")) {
    return NextResponse.json({ error: "Stripe non configuré" }, { status: 503 });
  }

  const stripe = new Stripe(stripeKey);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const body = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;

  try {
    event = webhookSecret
      ? stripe.webhooks.constructEvent(body, signature, webhookSecret)
      : JSON.parse(body);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { factureId, tenantId } = session.metadata ?? {};

        if (!factureId || !tenantId) break;

        const facture = await prisma.facture.findFirst({
          where: { id: factureId, tenantId },
          include: { paiements: true },
        });
        if (!facture) break;

        const amount = (session.amount_total ?? 0) / 100;

        // Create payment record
        await prisma.paiement.create({
          data: {
            factureId,
            montant: amount,
            devise: facture.devise,
            methode: "carte",
            reference: session.payment_intent?.toString() ?? session.id,
          },
        });

        // Update invoice status
        const totalPaye =
          facture.paiements.reduce((sum, p) => sum + p.montant, 0) + amount;
        const newStatut = totalPaye >= facture.montant ? "PAYEE" : facture.statut;

        await prisma.facture.update({
          where: { id: factureId },
          data: { statut: newStatut as never },
        });

        console.log(`[Stripe] Paiement enregistré pour facture ${facture.numero}: ${amount}`);
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Stripe Webhook] Error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
