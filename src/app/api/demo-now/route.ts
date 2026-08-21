import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  DEMO_NOW_COOKIE,
  DEMO_NOW_ENABLED_COOKIE,
  peutDeplacerHorloge,
} from "@/lib/demo-now";

/**
 * API de la date de démonstration (Time Machine).
 *
 * GET    → état de l'horloge, et droit du compte à la déplacer
 * POST   → fixe la date de démo (body: { date: ISO string | null })
 * DELETE → revient à l'heure réelle
 *
 * RÉSERVÉE À L'ADMINISTRATEUR DU TENANT
 * Le contrôle est ici, pas dans le bouton : masquer un bouton n'empêche
 * personne d'appeler la route. Depuis l'ajout de l'horizon de démonstration
 * (cf. `demo-horizon`), déplacer l'horloge masque des données — un compte
 * quelconque ne doit pas pouvoir s'en servir.
 */

const bodySchema = z.object({
  date: z.string().datetime().nullable(),
});

/** Durée de vie des cookies : une semaine, comme la session de démonstration. */
function dansUneSemaine(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

/**
 * Cookies posés en `httpOnly`.
 *
 * Sans cela, la restriction par rôle ne vaudrait rien : n'importe quel compte
 * pourrait écrire `document.cookie` et se placer à la date de son choix. Aucun
 * code client ne lit ces cookies — l'état passe par le GET ci-dessous.
 */
function poserCookies(date: string | null): Headers {
  const headers = new Headers();
  const expires = dansUneSemaine().toUTCString();
  const commun = `path=/; httpOnly; SameSite=Lax`;

  if (date === null) {
    headers.append("Set-Cookie", `${DEMO_NOW_ENABLED_COOKIE}=false; ${commun}; expires=${expires}`);
    headers.append(
      "Set-Cookie",
      `${DEMO_NOW_COOKIE}=; ${commun}; expires=Thu, 01 Jan 1970 00:00:00 GMT`
    );
  } else {
    headers.append("Set-Cookie", `${DEMO_NOW_ENABLED_COOKIE}=true; ${commun}; expires=${expires}`);
    headers.append(
      "Set-Cookie",
      `${DEMO_NOW_COOKIE}=${encodeURIComponent(date)}; ${commun}; expires=${expires}`
    );
  }
  return headers;
}

async function roleAutorise(): Promise<boolean> {
  const session = await auth();
  return peutDeplacerHorloge(session?.user?.role);
}

export async function GET() {
  const autorise = await roleAutorise();
  const realNow = new Date().toISOString();

  // Le champ `autorise` sert au bouton à se retirer de la barre. Pour un compte
  // non autorisé, l'horloge est rapportée inactive : son état ne le regarde pas.
  if (!autorise) {
    return NextResponse.json({ autorise: false, enabled: false, date: null, realNow });
  }

  const cookieStore = await cookies();
  const enabled = cookieStore.get(DEMO_NOW_ENABLED_COOKIE)?.value;
  const iso = cookieStore.get(DEMO_NOW_COOKIE)?.value;

  if (enabled !== "true" || !iso) {
    return NextResponse.json({ autorise: true, enabled: false, date: null, realNow });
  }

  const d = new Date(decodeURIComponent(iso));
  if (isNaN(d.getTime())) {
    return NextResponse.json({ autorise: true, enabled: false, date: null, realNow });
  }

  return NextResponse.json({
    autorise: true,
    enabled: true,
    date: d.toISOString(),
    realNow,
  });
}

export async function POST(req: NextRequest) {
  if (!(await roleAutorise())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Date invalide", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { date } = parsed.data;
    return NextResponse.json(
      { autorise: true, enabled: date !== null, date, realNow: new Date().toISOString() },
      { headers: poserCookies(date) }
    );
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
}

export async function DELETE() {
  if (!(await roleAutorise())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  return NextResponse.json(
    { autorise: true, enabled: false, date: null, realNow: new Date().toISOString() },
    { headers: poserCookies(null) }
  );
}
