import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { simulerRemediation } from "@/lib/learnos/simulation-remediation";

/**
 * Simulation de remédiation pédagogique.
 *
 * GET — projette l'impact de différentes stratégies de remédiation
 *        sur les cohortes d'élèves en difficulté.
 *
 * Ouvert à la direction et aux enseignants (`entrainement:read`).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const { searchParams } = new URL(req.url);
  const anneeId = searchParams.get("anneeId") ?? undefined;

  const result = await simulerRemediation(tenantId, session.user, anneeId);

  return NextResponse.json(result);
}
