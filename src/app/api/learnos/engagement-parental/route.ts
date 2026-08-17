import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  analyserCorrelationEngagement,
  analyserQuestionsFrequentes,
  analyserImpactAlertePaiement,
  analyserTauxValidationLien,
} from "@/lib/learnos/engagement-parental";

/**
 * Tableau de bord d'engagement parental.
 *
 * GET — calcule en parallèle les 4 indicateurs d'engagement du tenant :
 *   - corrélation engagement / résultats
 *   - questions fréquentes
 *   - impact des alertes de paiement
 *   - taux de validation du lien parent-élève
 *
 * Ouvert à la direction et aux enseignants (`entrainement:read`).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;

  const [correlation, questionsFrequentes, impactAlerte, validationLien] =
    await Promise.all([
      analyserCorrelationEngagement(tenantId, session.user),
      analyserQuestionsFrequentes(tenantId, session.user),
      analyserImpactAlertePaiement(tenantId, session.user),
      analyserTauxValidationLien(tenantId, session.user),
    ]);

  return NextResponse.json({
    correlation,
    questionsFrequentes,
    impactAlerte,
    validationLien,
  });
}
