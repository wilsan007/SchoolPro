import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

/**
 * API route pour gérer la date de démonstration (Time Machine).
 *
 * GET    → retourne la date actuelle de démo (ou null si désactivée)
 * POST   → définit la date de démo (body: { date: ISO string | null })
 * DELETE → désactive la date de démo (retour à la vraie heure)
 */

const DEMO_NOW_COOKIE = "demo_now";
const DEMO_NOW_ENABLED_COOKIE = "demo_now_enabled";

const bodySchema = z.object({
  date: z.string().datetime().nullable(),
});

export async function GET() {
  const cookieStore = await cookies();
  const enabled = cookieStore.get(DEMO_NOW_ENABLED_COOKIE)?.value;
  const iso = cookieStore.get(DEMO_NOW_COOKIE)?.value;

  if (enabled !== "true" || !iso) {
    return NextResponse.json({
      enabled: false,
      date: null,
      realNow: new Date().toISOString(),
    });
  }

  const d = new Date(decodeURIComponent(iso));
  if (isNaN(d.getTime())) {
    return NextResponse.json({
      enabled: false,
      date: null,
      realNow: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    enabled: true,
    date: d.toISOString(),
    realNow: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Date invalide", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { date } = parsed.data;
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    const headers = new Headers();
    if (date === null) {
      headers.append(
        "Set-Cookie",
        `${DEMO_NOW_ENABLED_COOKIE}=false; path=/; expires=${expires.toUTCString()}; SameSite=Lax`
      );
      headers.append(
        "Set-Cookie",
        `${DEMO_NOW_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
      );
    } else {
      headers.append(
        "Set-Cookie",
        `${DEMO_NOW_ENABLED_COOKIE}=true; path=/; expires=${expires.toUTCString()}; SameSite=Lax`
      );
      headers.append(
        "Set-Cookie",
        `${DEMO_NOW_COOKIE}=${encodeURIComponent(date)}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`
      );
    }

    return NextResponse.json(
      { enabled: date !== null, date, realNow: new Date().toISOString() },
      { headers }
    );
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
}

export async function DELETE() {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);

  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    `${DEMO_NOW_ENABLED_COOKIE}=false; path=/; expires=${expires.toUTCString()}; SameSite=Lax`
  );
  headers.append(
    "Set-Cookie",
    `${DEMO_NOW_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
  );

  return NextResponse.json(
    { enabled: false, date: null, realNow: new Date().toISOString() },
    { headers }
  );
}
