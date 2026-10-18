import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { ErreurValidation, validerCorrection } from "@/lib/learnos/entrainement/valider-correction";

/**
 * `criteresValides` : les critères que l'adulte retient comme réussis. `null`
 * REJETTE la proposition. Aucun champ de note : la note découle de la grille.
 */
const Schema = z.object({
  criteresValides: z.array(z.string().min(1)).max(20).nullable(),
});

const STATUT_PAR_CODE: Record<ErreurValidation["code"], number> = {
  introuvable: 404,
  deja_traitee: 409,
  critere_inconnu: 422,
  grille_perdue: 422,
};

/**
 * Valide ou rejette une correction proposée.
 *
 * C'est le SEUL chemin par lequel une proposition de modèle devient une preuve
 * d'apprentissage, et il exige un adulte. Le corps ne porte ni score ni total :
 * un client modifié n'a donc aucune note à falsifier.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = await checkPermission(session.user.role, "entrainement:valider");
  if (denied) return denied;

  const parsed = Schema.safeParse(
    await req.json().catch((e) => {
      console.warn("[non-fatal]", e);
      return null;
    })
  );
  if (!parsed.success) return erreurJson("DONNEES_INVALIDES");

  const { id } = await params;
  try {
    const resultat = await validerCorrection(session.user.tenantId, session.user, {
      correctionId: id,
      criteresValides: parsed.data.criteresValides,
      valideParId: session.user.id,
    });
    return NextResponse.json({ ok: true, resultat });
  } catch (error) {
    if (error instanceof ErreurValidation) {
      return NextResponse.json(
        { error: "Validation de correction", code: error.code },
        { status: STATUT_PAR_CODE[error.code] }
      );
    }
    console.error("[API/learnos/corrections/id]", error);
    throw error;
  }
}
