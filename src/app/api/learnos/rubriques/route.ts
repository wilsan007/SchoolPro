import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { proposerRubrique } from "@/lib/learnos/rubrique-evaluation";
import { persisterRubrique } from "@/lib/learnos/workflow-validation";

/**
 * POST /api/learnos/rubriques
 * Body: { competenceId, niveauScolaire, baremeTotal?, persister? }
 *
 * Génère une grille d'évaluation (rubric) par IA. Si `persister` est true,
 * la grille est sauvegardée avec statut PROPOSE.
 *
 * ACCÈS : TEACHER, CLASS_TEACHER, SUBJECT_LEAD, TENANT_ADMIN, PRINCIPAL, SUPER_ADMIN
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "curriculum:write");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const body = await req.json().catch(() => ({}));
  const { competenceId, niveauScolaire, baremeTotal, persister } = body;

  if (!competenceId || !niveauScolaire) {
    return NextResponse.json(
      { error: "competenceId et niveauScolaire sont requis" },
      { status: 400 }
    );
  }

  try {
    const rubrique = await proposerRubrique(
      tenantId,
      session.user,
      { competenceId, niveauScolaire, baremeTotal },
      session.user.id
    );

    let rubriqueId: string | null = null;
    if (persister) {
      rubriqueId = await persisterRubrique(
        tenantId,
        session.user,
        {
          competenceId,
          niveauScolaire,
          totalPoints: rubrique.totalPoints,
          titre: rubrique.titre,
          criteres: rubrique.critères,
        },
        session.user.id,
        rubrique.modele,
        rubrique.cached
      );
    }

    return NextResponse.json({ ...rubrique, rubriqueId });
  } catch (error) {
    console.error("[api/rubriques]", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération de la rubrique" },
      { status: 500 }
    );
  }
}
