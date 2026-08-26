import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { tableauBordSeance } from "@/lib/learnos/tableau-bord-enseignant";

/**
 * GET /api/cahier-journal/tableau-bord/[seanceId]
 *
 * Retourne le tableau de bord pré-séance pour l'enseignant :
 * planification, compétences prévues, prédiction, pattern historique,
 * plan de leçon proposé et exercices de remédiation.
 *
 * ACCÈS : TEACHER, CLASS_TEACHER, SUBJECT_LEAD, TENANT_ADMIN, PRINCIPAL, SUPER_ADMIN
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ seanceId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

    const denied = checkPermission(session.user.role, "curriculum:read");
    if (denied) return denied;

    const { seanceId } = await params;

    const tableau = await tableauBordSeance(
      session.user.tenantId,
      session.user,
      seanceId
    );

    if (!tableau) {
      return erreurJson("SEANCE_INTROUVABLE");
    }

    return NextResponse.json(tableau);
  } catch (error) {
    console.error("[API/cahier-journal/tableau-bord GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
