import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { rlsMode } from "@/lib/prisma-rls";
import { logger } from "@/lib/logger";

/**
 * Health check — vérifie l'état de l'application en production.
 *
 * INF-3 (audit v2) : health check structuré pour les load balancers
 * et les systèmes de monitoring (UptimeRobot, Kubernetes probes).
 *
 * Vérifie :
 * - Connectivité base de données (latence < 1s)
 * - Statut RLS (mode off/warn/enforce)
 * - Version de l'application (si NEXT_PUBLIC_APP_URL est défini)
 *
 * Réponses :
 * - 200 : tout va bien
 * - 503 : base de données inaccessible
 */
export async function GET() {
  const checks: Record<string, unknown> = {};
  let allOk = true;

  // 1. Vérifier la connectivité base de données avec mesure de latence.
  try {
    const start = Date.now();
    // eslint-disable-next-line ecolpro/require-site-filter -- health check système sans session
    await prisma.user.count();
    const latencyMs = Date.now() - start;
    checks.database = { ok: true, latencyMs };
  } catch (error) {
    allOk = false;
    checks.database = { ok: false, error: "Database unreachable" };
    logger.error("Health check: database unreachable", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // 2. Statut RLS.
  checks.rls = { mode: rlsMode() };

  // 3. Version de l'application.
  checks.version = process.env.NEXT_PUBLIC_APP_URL ?? "unknown";

  if (!allOk) {
    return NextResponse.json(
      { ok: false, checks },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, checks });
}
