import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  analyserBesoinsSpeciauxInterventions,
  analyserEquiteInterSite,
  analyserRepresentationGenre,
  comparerInternesExternes,
} from "@/lib/learnos/equite-inclusion";

/**
 * Équité & inclusion : quatre analyses indépendantes lancées en parallèle
 * — besoins spéciaux vs interventions, équité inter-site, représentation
 * par genre, et comparaison internes/externes.
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
    besoinsSpeciaux,
    equiteInterSite,
    representationGenre,
    internesExternes,
  ] = await Promise.all([
    analyserBesoinsSpeciauxInterventions(tenantId, session.user),
    analyserEquiteInterSite(tenantId, session.user),
    analyserRepresentationGenre(tenantId, session.user),
    comparerInternesExternes(tenantId, session.user),
  ]);

  return NextResponse.json({
    besoinsSpeciaux,
    equiteInterSite,
    representationGenre,
    internesExternes,
  });
}
