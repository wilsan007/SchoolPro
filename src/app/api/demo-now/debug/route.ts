import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { diagnostiquerDemoDate, getDemoDate, getDemoNow, peutDeplacerHorloge } from "@/lib/demo-now";

/**
 * Route de diagnostic pour la Time Machine.
 *
 * Retourne l'état détaillé de la résolution de date de démo : cookies présents,
 * scope parsé, session résolue, et point exact de failure.
 *
 * Même règle d'accès que le reste de la Time Machine (`peutDeplacerHorloge`) :
 * le rôle POSSÉDÉ compte, pas seulement le rôle actif. Sans cela, le directeur
 * qui a basculé en `TEACHER` pour la démonstration reçoit un 403 précisément
 * quand il en a besoin — c'est sous un autre rôle que l'horloge pose problème.
 *
 * Usage : GET /api/demo-now/debug
 */
export async function GET() {
  const session = await auth();
  const rolesPossedes = (session?.user as { availableRoles?: Role[] } | undefined)?.availableRoles;
  if (!session?.user || !peutDeplacerHorloge(session.user.role, rolesPossedes)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const diag = await diagnostiquerDemoDate();
  const demoDate = await getDemoDate();
  const demoNow = await getDemoNow();

  return NextResponse.json({
    session: {
      id: session.user.id,
      tenantId: session.user.tenantId,
      role: session.user.role,
    },
    diagnostic: {
      enabled: diag.enabled,
      dateCookie: diag.dateCookie,
      scopeCookie: diag.scopeCookie,
      scopeParsed: diag.scopeParsed,
      session: diag.session,
      echec: diag.echec,
      date: diag.date?.toISOString() ?? null,
    },
    getDemoDate: demoDate?.toISOString() ?? null,
    getDemoNow: demoNow.toISOString(),
    realNow: new Date().toISOString(),
  });
}
