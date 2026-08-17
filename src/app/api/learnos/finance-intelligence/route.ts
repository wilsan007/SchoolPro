import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  calculerRisqueFamilles,
  calculerCoutParEleve,
  analyserDepassementsBudget,
  analyserEfficaciteRelances,
  calculerDelaiPaiement,
  calculerTauxAdmission,
  simulerContreFactuelRemises,
} from "@/lib/learnos/finance-intelligence";
import { getDemoNow } from "@/lib/demo-now";

/**
 * Tableau de bord d'intelligence financière.
 *
 * GET — calcule en parallèle les 7 indicateurs financiers du tenant :
 *   - risque des familles
 *   - coût par élève
 *   - dépassements de budget
 *   - efficacité des relances
 *   - délai de paiement
 *   - taux d'admission
 *   - simulation contre-factuelle des remises
 *
 * Ouvert à la direction et aux enseignants (`entrainement:read`).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const maintenant = await getDemoNow();

  const [
    risqueFamilles,
    coutParEleve,
    depassements,
    efficaciteRelances,
    delaiPaiement,
    tauxAdmission,
    contreFactuelRemises,
  ] = await Promise.all([
    calculerRisqueFamilles(tenantId, session.user),
    calculerCoutParEleve(tenantId, session.user, undefined, maintenant),
    analyserDepassementsBudget(tenantId, session.user),
    analyserEfficaciteRelances(tenantId, session.user),
    calculerDelaiPaiement(tenantId, session.user),
    calculerTauxAdmission(tenantId, session.user),
    simulerContreFactuelRemises(tenantId, session.user),
  ]);

  return NextResponse.json({
    risqueFamilles,
    coutParEleve,
    depassements,
    efficaciteRelances,
    delaiPaiement,
    tauxAdmission,
    contreFactuelRemises,
  });
}
