import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { isRelationScopedRole } from "@/lib/site-scope";
import { calculerRisqueDecrochage } from "@/lib/learnos/risque-decrochage";
import { getDemoNow } from "@/lib/demo-now";

/**
 * Synthèse du risque de décrochage scolaire : score 0-100 par élève
 * combinant cinq signaux pondérés, plus la détection du décrochage
 * silencieux (élèves dont la maîtrise baisse sans avoir encore basculé
 * en échec visible).
 *
 * Ouvert à la direction et aux enseignants (`entrainement:read`).
 * ISO-H1 (audit v2) : les familles (PARENT/STUDENT) ont `entrainement:read`
 * pour leur enfant, pas pour la surveillance globale du tenant.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = await checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  // ISO-H1 : outil du personnel — les familles ne voient que leur enfant
  // via les routes dédiées, pas la synthèse globale du tenant.
  if (isRelationScopedRole(session.user.role)) {
    return erreurJson("ACCES_REFUSE");
  }

  const tenantId = session.user.tenantId;
  const { searchParams } = new URL(req.url);
  const classeId = searchParams.get("classeId") ?? undefined;

  const maintenant = await getDemoNow();
  const synthese = await calculerRisqueDecrochage(tenantId, session.user, {
    classeId,
  }, maintenant);

  return NextResponse.json(synthese, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
  });
}
