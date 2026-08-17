import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { proposerPlanLecon } from "@/lib/learnos/plan-lecon";
import { persisterPlanLecon } from "@/lib/learnos/workflow-validation";

/**
 * POST /api/learnos/plans-lecon
 * Body: { competenceId, niveauScolaire, dureeSouhaitee?, effectif?, persister? }
 *
 * Génère un plan de leçon par IA. Si `persister` est true, le plan est
 * sauvegardé en base avec statut PROPOSE (en attente de relecture).
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
  const { competenceId, niveauScolaire, dureeSouhaitee, effectif, persister } = body;

  if (!competenceId || !niveauScolaire) {
    return NextResponse.json(
      { error: "competenceId et niveauScolaire sont requis" },
      { status: 400 }
    );
  }

  try {
    const plan = await proposerPlanLecon(
      tenantId,
      session.user,
      { competenceId, niveauScolaire, dureeSouhaitee, effectif },
      session.user.id
    );

    let planId: string | null = null;
    if (persister) {
      planId = await persisterPlanLecon(
        tenantId,
        session.user,
        {
          competenceId,
          niveauScolaire,
          dureeTotale: plan.dureeTotale,
          titre: plan.titre,
          objectifs: plan.objectifs,
          etapes: plan.etapes,
          materiel: plan.materiel,
          evaluation: plan.evaluation,
          differentiation: plan.differentiation,
        },
        session.user.id,
        plan.modele,
        plan.cached
      );
    }

    return NextResponse.json({ ...plan, planId });
  } catch (error) {
    console.error("[api/plans-lecon]", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération du plan de leçon" },
      { status: 500 }
    );
  }
}
