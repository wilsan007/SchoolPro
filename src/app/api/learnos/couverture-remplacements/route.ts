import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  calculerTauxCouverture,
  identifierCreneauxOrphelins,
  prioriserRemplacements,
  identifierSallesGoulot,
} from "@/lib/learnos/couverture-remplacements";

/**
 * Tableau de bord de couverture des remplacements.
 *
 * GET — calcule en parallèle les 4 indicateurs de remplacement du tenant :
 *   - taux de couverture
 *   - créneaux orphelins
 *   - priorisation des remplacements
 *   - salles goulot
 *
 * Ouvert à la direction et aux enseignants (`entrainement:read`).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;

  const [tauxCouverture, creneauxOrphelins, priorisation, sallesGoulot] =
    await Promise.all([
      calculerTauxCouverture(tenantId, session.user),
      identifierCreneauxOrphelins(tenantId, session.user),
      prioriserRemplacements(tenantId, session.user),
      identifierSallesGoulot(tenantId, session.user),
    ]);

  return NextResponse.json({
    tauxCouverture,
    creneauxOrphelins,
    priorisation,
    sallesGoulot,
  });
}
