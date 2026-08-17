import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  analyserEcartGenre,
  comparerBoursiers,
  analyserEfficaciteRedoublement,
  analyserMotifsTransfert,
  calculerProbabiliteDiplomation,
  predireRemplissageClasses,
} from "@/lib/learnos/trajectoires-cohortes";

/**
 * Trajectoires de cohortes : six analyses indépendantes lancées en
 * parallèle — écart de genre, comparaison boursiers/non-boursiers,
 * efficacité du redoublement, motifs de transfert, probabilité de
 * diplomation et prédiction du remplissage des classes.
 *
 * Ouvert à la direction et aux enseignants (`entrainement:read`).
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;

  const [
    ecartGenre,
    boursiers,
    redoublement,
    motifsTransfert,
    diplomation,
    remplissage,
  ] = await Promise.all([
    analyserEcartGenre(tenantId, session.user),
    comparerBoursiers(tenantId, session.user),
    analyserEfficaciteRedoublement(tenantId, session.user),
    analyserMotifsTransfert(tenantId, session.user),
    calculerProbabiliteDiplomation(tenantId, session.user),
    predireRemplissageClasses(tenantId, session.user),
  ]);

  return NextResponse.json({
    ecartGenre,
    boursiers,
    redoublement,
    motifsTransfert,
    diplomation,
    remplissage,
  });
}
