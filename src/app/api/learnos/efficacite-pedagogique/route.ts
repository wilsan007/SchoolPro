import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  analyserEfficacitePlans,
  analyserEfficaciteEnseignants,
  comparerTypesIntervention,
  correlerEtapesSucces,
  mesurerAdoptionIA,
} from "@/lib/learnos/efficacite-pedagogique";

/**
 * Tableau de bord d'efficacité pédagogique.
 *
 * GET — agrège en parallèle cinq analyses :
 *        1. Efficacité des plans de remédiation
 *        2. Efficacité par enseignant
 *        3. Comparaison des types d'intervention
 *        4. Corrélation entre étapes et succès
 *        5. Mesure de l'adoption de l'IA par les enseignants
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

  const [plans, enseignants, interventions, correlation, adoptionIA] = await Promise.all([
    analyserEfficacitePlans(tenantId, session.user, anneeId),
    analyserEfficaciteEnseignants(tenantId, session.user, anneeId),
    comparerTypesIntervention(tenantId, session.user),
    correlerEtapesSucces(tenantId, session.user),
    mesurerAdoptionIA(tenantId, session.user),
  ]);

  return NextResponse.json({
    plans,
    enseignants,
    interventions,
    correlation,
    adoptionIA,
  });
}
