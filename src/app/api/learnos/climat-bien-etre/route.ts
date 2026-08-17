import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  analyserCorrelationInfirmerie,
  identifierHotspotsIncidents,
  analyserEfficaciteEntretiens,
  analyserNotificationParents,
} from "@/lib/learnos/climat-bien-etre";

/**
 * Climat scolaire & bien-être (A31 → A34).
 *
 * GET — calcule en parallèle :
 *   1. Corrélation passages infirmerie ↔ performances (A31)
 *   2. Hotspots d'incidents par jour/heure (A32)
 *   3. Efficacité des entretiens conseiller (A33)
 *   4. Taux de notification des parents suite à incident (A34)
 *
 * Ouvert à la direction et aux enseignants (`entrainement:read`).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;

  const [
    correlationInfirmerie,
    hotspots,
    efficaciteEntretiens,
    notificationParents,
  ] = await Promise.all([
    analyserCorrelationInfirmerie(tenantId, session.user),
    identifierHotspotsIncidents(tenantId, session.user),
    analyserEfficaciteEntretiens(tenantId, session.user),
    analyserNotificationParents(tenantId, session.user),
  ]);

  return NextResponse.json({
    correlationInfirmerie,
    hotspots,
    efficaciteEntretiens,
    notificationParents,
  });
}
