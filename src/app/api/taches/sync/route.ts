import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { synchroniserTachesAuto } from "@/lib/tache-engine";

/**
 * POST /api/taches/sync
 *
 * Déclenche la synchronisation des tâches auto-générées pour le tenant.
 * Scanne l'état du système et crée/ferme les tâches selon les règles du moteur.
 *
 * Accessible à tout le personnel authentifié avec permission taches:read.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "taches:read");
  if (denied) return denied;

  try {
    const result = await synchroniserTachesAuto(session.user.tenantId, session.user);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Taches sync] Erreur:", error);
    return NextResponse.json({ error: "Erreur de synchronisation" }, { status: 500 });
  }
}
