import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { calculerRisqueDecrochage } from "@/lib/learnos/risque-decrochage";
import { getDemoNow } from "@/lib/demo-now";

/**
 * Synthèse du risque de décrochage scolaire : score 0-100 par élève
 * combinant cinq signaux pondérés, plus la détection du décrochage
 * silencieux (élèves dont la maîtrise baisse sans avoir encore basculé
 * en échec visible).
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
  const classeId = searchParams.get("classeId") ?? undefined;

  const maintenant = await getDemoNow();
  const synthese = await calculerRisqueDecrochage(tenantId, session.user, {
    classeId,
  }, maintenant);

  return NextResponse.json(synthese);
}
