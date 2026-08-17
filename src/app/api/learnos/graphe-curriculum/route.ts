import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  identifierNoeudsCritiques,
  validerPrerequisEmpiriquement,
} from "@/lib/learnos/graphe-curriculum";

/**
 * Analyse structurelle du graphe de curriculum.
 *
 * GET — exécute en parallèle deux analyses :
 *        1. Identification des nœuds critiques (compétences charnières)
 *        2. Validation empirique des prérequis déclarés
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
  const matiereId = searchParams.get("matiereId") ?? undefined;

  const [noeudsCritiques, validationPrerequis] = await Promise.all([
    identifierNoeudsCritiques(tenantId, session.user, matiereId),
    validerPrerequisEmpiriquement(tenantId, session.user, matiereId),
  ]);

  return NextResponse.json({
    noeudsCritiques,
    validationPrerequis,
  });
}
