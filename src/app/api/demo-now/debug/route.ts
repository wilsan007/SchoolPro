import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { diagnostiquerDemoDate, getDemoDate, getDemoNow } from "@/lib/demo-now";

/**
 * Route de diagnostic pour la Time Machine.
 *
 * Retourne l'état détaillé de la résolution de date de démo : cookies présents,
 * scope parsé, session résolue, et point exact de failure. Accessible uniquement
 * aux TENANT_ADMIN (même restriction que le reste de la Time Machine).
 *
 * Usage : GET /api/demo-now/debug
 */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "TENANT_ADMIN") {
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
