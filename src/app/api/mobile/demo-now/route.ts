import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { peutDeplacerHorloge } from "@/lib/demo-now";

/**
 * Time Machine — date de démonstration, version mobile.
 *
 * GET    → état de l'horloge + droit de la déplacer
 * POST   → fixer la date de démo (body: { date: ISO string })
 * DELETE → revenir à l'heure réelle
 *
 * Contrairement à la route web (/api/demo-now) qui pose des cookies httpOnly,
 * la version mobile stocke la date côté serveur via un cookie manuel dans
 * les en-têtes de réponse. L'app mobile relaie ce cookie dans les requêtes
 * suivantes via le header Cookie.
 *
 * RÉSERVÉ À L'ADMINISTRATEUR DU TENANT (TENANT_ADMIN).
 */
function dansUneSemaine(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

function poserCookies(date: string | null): Headers {
  const headers = new Headers();
  const expires = dansUneSemaine().toUTCString();
  const commun = `path=/; httpOnly; SameSite=Lax`;

  if (date === null) {
    headers.append("Set-Cookie", `demo_now_enabled=false; ${commun}; expires=${expires}`);
    headers.append("Set-Cookie", `demo_now=; ${commun}; expires=Thu, 01 Jan 1970 00:00:00 GMT`);
  } else {
    headers.append("Set-Cookie", `demo_now_enabled=true; ${commun}; expires=${expires}`);
    headers.append("Set-Cookie", `demo_now=${encodeURIComponent(date)}; ${commun}; expires=${expires}`);
  }
  return headers;
}

export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();

  const autorise = peutDeplacerHorloge(user.role);
  const realNow = new Date().toISOString();

  if (!autorise) {
    return NextResponse.json({ autorise: false, enabled: false, date: null, realNow });
  }

  const enabled = req.cookies.get("demo_now_enabled")?.value;
  const iso = req.cookies.get("demo_now")?.value;

  if (enabled !== "true" || !iso) {
    return NextResponse.json({ autorise: true, enabled: false, date: null, realNow });
  }

  const d = new Date(decodeURIComponent(iso));
  if (isNaN(d.getTime())) {
    return NextResponse.json({ autorise: true, enabled: false, date: null, realNow });
  }

  return NextResponse.json({ autorise: true, enabled: true, date: d.toISOString(), realNow });
}

export async function POST(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();

  if (!peutDeplacerHorloge(user.role)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.date || typeof body.date !== "string") {
    return NextResponse.json({ error: "Date invalide" }, { status: 400 });
  }

  const d = new Date(body.date);
  if (isNaN(d.getTime())) {
    return NextResponse.json({ error: "Date invalide" }, { status: 400 });
  }

  return NextResponse.json(
    { autorise: true, enabled: true, date: d.toISOString(), realNow: new Date().toISOString() },
    { headers: poserCookies(d.toISOString()) },
  );
}

export async function DELETE(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();

  if (!peutDeplacerHorloge(user.role)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  return NextResponse.json(
    { autorise: true, enabled: false, date: null, realNow: new Date().toISOString() },
    { headers: poserCookies(null) },
  );
}
