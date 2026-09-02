import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { synchroniserTachesAuto } from "@/lib/tache-engine";

const BodySchema = z.object({
  tenantId: z.string().min(1).optional(),
});

/**
 * POST /api/taches/sync
 *
 * Déclenche la synchronisation des tâches auto-générées pour le tenant.
 * Scanne l'état du système et crée/ferme les tâches selon les règles du moteur.
 *
 * Accessible à tout le personnel authentifié avec permission taches:read.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  let tenantId: string;
  let claims: Parameters<typeof synchroniserTachesAuto>[1];

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    if (!parsed.data.tenantId) {
      return NextResponse.json({ error: "tenantId requis" }, { status: 400 });
    }
    tenantId = parsed.data.tenantId;
  } else {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "taches:read");
    if (denied) return denied;
    tenantId = session.user.tenantId;
    claims = session.user;
  }

  try {
    const result = await synchroniserTachesAuto(tenantId, claims);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Taches sync] Erreur:", error);
    return NextResponse.json({ error: "Erreur de synchronisation" }, { status: 500 });
  }
}
