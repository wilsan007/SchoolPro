import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Stripe from "stripe";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Rate limit: 5 checkout attempts per minute
    const ip = getClientIP(req);
    const rl = rateLimit({ max: 5, windowSec: 60, key: `stripe:${session.user.id}:${ip}` });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans un instant." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const { factureId } = await req.json();
    if (!factureId) {
      return NextResponse.json({ error: "Facture requise" }, { status: 400 });
    }

    const facture = await prisma.facture.findFirst({
      where: { id: factureId, tenantId: session.user.tenantId },
      include: {
        eleve: {
          select: { nom: true, prenom: true, matricule: true },
        },
      },
    });

    if (!facture) {
      return NextResponse.json({ error: "Facture non trouvée" }, { status: 404 });
    }

    if (facture.statut === "PAYEE" || facture.statut === "ANNULEE") {
      return NextResponse.json({ error: "Facture non payable" }, { status: 400 });
    }

    const totalPaye = await prisma.paiement.aggregate({
      where: { factureId },
      _sum: { montant: true },
    });
    const restant = facture.montant - (totalPaye._sum.montant ?? 0);
    if (restant <= 0) {
      return NextResponse.json({ error: "Facture déjà soldée" }, { status: 400 });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey.includes("xxxx")) {
      return NextResponse.json({ error: "Stripe non configuré" }, { status: 503 });
    }

    const stripe = new Stripe(stripeKey);
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { name: true },
    });

    const origin = req.headers.get("origin") ?? "http://localhost:3001";

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: facture.devise.toLowerCase(),
            product_data: {
              name: `${facture.libelle} — ${facture.eleve.prenom} ${facture.eleve.nom}`,
              description: `Facture ${facture.numero} | Matricule: ${facture.eleve.matricule}`,
            },
            unit_amount: Math.round(restant * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        factureId: facture.id,
        tenantId: session.user.tenantId,
        eleveId: facture.eleveId,
      },
      success_url: `${origin}/facturation/${facture.id}?payment=success`,
      cancel_url: `${origin}/facturation/${facture.id}?payment=cancelled`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("[API/stripe/checkout]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
