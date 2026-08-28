import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { ErreurSeance, soumettreEtape } from "@/lib/learnos/entrainement";

const BodySchema = z.object({
  exerciceId: z.string().min(1),
  index: z.number().int().min(0),
  reponse: z.string(),
});

/** Codes métier traduits en statuts HTTP — le reste est un 500 légitime. */
const STATUT_PAR_CODE: Record<ErreurSeance["code"], number> = {
  introuvable: 404,
  structure_invalide: 422,
  etape_hors_sequence: 409,
  etape_close: 409,
};

/**
 * Soumet la réponse à l'étape courante d'un exercice et la corrige.
 *
 * La correction est faite **ici**, côté serveur, par comparaison — jamais dans
 * le navigateur : le client ne reçoit pas les réponses attendues, et ne
 * pourrait donc pas corriger même s'il le voulait.
 *
 * Le corps ne porte ni score ni durée : ce sont exactement les valeurs qu'un
 * client modifié aurait intérêt à annoncer. Le serveur les établit seul.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "entrainement:write");
  if (denied) return denied;

  const { id: feuilleId } = await params;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return erreurJson("CHAMPS_REPONSE_REQUIS");
  }

  try {
    const resultat = await soumettreEtape(session.user.tenantId, session.user, {
      feuilleId,
      exerciceId: parsed.data.exerciceId,
      index: parsed.data.index,
      // Une réponse démesurée n'est pas une réponse : on borne avant de
      // l'écrire, plutôt que de stocker ce qu'un client a bien voulu envoyer.
      reponse: parsed.data.reponse.slice(0, 500),
    });
    return NextResponse.json(resultat);
  } catch (error) {
    if (error instanceof ErreurSeance) {
      return NextResponse.json(
        { error: "Erreur de séance", code: error.code },
        { status: STATUT_PAR_CODE[error.code] }
      );
    }
    console.error("[API/learnos/entrainement/reponse]", error);
    throw error;
  }
}
