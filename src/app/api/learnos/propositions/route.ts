import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { listerPropositions } from "@/lib/learnos/workflow-validation";

/**
 * GET /api/learnos/propositions?statut=PROPOSE|AJUSTE|VALIDE|REJETE
 *
 * Liste les propositions IA (plans de leçon + grilles d'évaluation) avec leur
 * statut de workflow. Permet à la direction et aux enseignants de suivre les
 * propositions en attente de relecture, d'ajustement ou de validation.
 *
 * ACCÈS : TEACHER, CLASS_TEACHER, SUBJECT_LEAD, TENANT_ADMIN, PRINCIPAL, SUPER_ADMIN
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "curriculum:read");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const statut = searchParams.get("statut") ?? undefined;

  try {
    const result = await listerPropositions(
      session.user.tenantId,
      session.user,
      statut
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/propositions GET]", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des propositions" },
      { status: 500 }
    );
  }
}
