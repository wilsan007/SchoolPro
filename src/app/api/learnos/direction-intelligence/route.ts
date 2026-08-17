import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { canAccessSite } from "@/lib/site-scope";
import { tableauIntelligenceDirecteur } from "@/lib/learnos/direction-intelligence";
import { getDemoNow } from "@/lib/demo-now";

/**
 * Tableau de bord d'intelligence du directeur : sept indices composites
 * (ISP, IEIS, IVF, ICS, ROI, Vitesse, IRO) + un score de santé globale.
 *
 * Ouvert à la direction et aux enseignants (`entrainement:read`).
 *
 * Paramètres optionnels :
 *  - `anneeId` : restreint le calcul à une année scolaire donnée.
 *  - `siteId`  : restreint le calcul à un site donné (utile pour le
 *                comparateur inter-sites). Le site doit être accessible à
 *                l'utilisateur ; sinon le périmètre de session est conservé.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const { searchParams } = new URL(req.url);
  const anneeId = searchParams.get("anneeId") ?? undefined;
  const siteId = searchParams.get("siteId") ?? undefined;

  // Si un siteId explicite est fourni, on l'injecte dans les claims de
  // session pour que `siteFilterForModel` restreigne le calcul à ce site.
  // `canAccessSite` vérifie que l'utilisateur a bien le droit d'accéder à
  // ce site ; sinon on ignore le paramètre et on conserve le périmètre
  // de session (fail-safe).
  const claims = { ...session.user };
  if (siteId) {
    if (canAccessSite(session.user, siteId)) {
      claims.siteId = siteId;
    }
  }

  // Date simulée par la machine à remonter le temps (cookie demo-now).
  // Par défaut, retombe sur l'horloge réelle.
  const maintenant = await getDemoNow();

  const tableau = await tableauIntelligenceDirecteur(
    tenantId,
    claims,
    anneeId,
    maintenant
  );

  return NextResponse.json(tableau);
}
