import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import { budgetDuJour } from "@/lib/learnos/entrainement/budget-ia";
import {
  chargerFileCorrections,
  type FiltreStatut,
} from "@/lib/learnos/entrainement/file-corrections";
import { ErreurCorrection, soumettreCorrection } from "@/lib/learnos/entrainement/soumettre-correction";
import { AiAllProvidersFailedError } from "@/lib/ai/provider";

/**
 * File des corrections proposées par un modèle, en attente d'un adulte.
 *
 * Ce que l'enseignant voit ici est une PROPOSITION : elle ne pèse sur aucun
 * profil tant qu'il ne l'a pas validée. La liste porte la confiance et les
 * motifs d'incertitude — sans eux, il ne saurait pas par où commencer.
 *
 * Réservé aux adultes (`entrainement:valider`) : la réponse contient la copie
 * d'un élève et le détail de la correction.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = await checkPermission(session.user.role, "entrainement:valider");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const role = session.user.role as Role;
  const demande = new URL(req.url).searchParams.get("statut");
  const statut: FiltreStatut =
    demande === "INCERTAINE" || demande === "A_VALIDER" ? demande : "TOUS";

  // Un enseignant ne relit que les copies de ses classes ; la direction voit tout.
  const scope = isTeacherRole(role)
    ? await getTeacherScope(tenantId, session.user.id, role)
    : undefined;

  const corrections = await chargerFileCorrections(tenantId, session.user, scope, statut);

  return NextResponse.json({ corrections, budget: await budgetDuJour(tenantId) });
}

const SchemaSoumission = z.object({
  eleveId: z.string().min(1),
  questionId: z.string().min(1),
  reponse: z.string().min(1).max(8000),
});

const STATUT_PAR_CODE: Record<ErreurCorrection["code"], number> = {
  question_introuvable: 404,
  eleve_introuvable: 404,
  sans_grille: 422,
  reponse_vide: 400,
  budget_epuise: 429,
  sortie_inexploitable: 502,
};

/**
 * Soumet une production à la correction assistée.
 *
 * Réservé aux adultes : c'est l'enseignant qui soumet la copie d'un élève, et
 * il en voit aussitôt la proposition. Ouvrir cette route aux élèves leur
 * ferait déclencher des appels payants et recevoir une pseudo-note sans adulte.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = await checkPermission(session.user.role, "entrainement:valider");
  if (denied) return denied;

  const parsed = SchemaSoumission.safeParse(
    await req.json().catch((e) => {
      console.warn("[non-fatal]", e);
      return null;
    })
  );
  if (!parsed.success) return erreurJson("DONNEES_INVALIDES");

  try {
    const resultat = await soumettreCorrection(
      session.user.tenantId,
      session.user,
      parsed.data,
      session.user.id
    );
    return NextResponse.json(resultat, { status: 201 });
  } catch (error) {
    if (error instanceof ErreurCorrection) {
      return NextResponse.json(
        { error: "Correction assistée", code: error.code },
        { status: STATUT_PAR_CODE[error.code] }
      );
    }
    if (error instanceof AiAllProvidersFailedError) return erreurJson("IA_INDISPONIBLE");
    console.error("[API/learnos/corrections]", error);
    throw error;
  }
}
