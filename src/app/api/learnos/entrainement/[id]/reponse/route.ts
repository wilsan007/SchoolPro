import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { ErreurSeance, soumettreEtape } from "@/lib/learnos/entrainement";

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
  const body = (await req.json().catch(() => null)) as {
    exerciceId?: string;
    index?: number;
    reponse?: string;
  } | null;

  if (!body?.exerciceId || typeof body.index !== "number" || typeof body.reponse !== "string") {
    return erreurJson("CHAMPS_REPONSE_REQUIS");
  }

  try {
    const resultat = await soumettreEtape(session.user.tenantId, session.user, {
      feuilleId,
      exerciceId: body.exerciceId,
      index: body.index,
      // Une réponse démesurée n'est pas une réponse : on borne avant de
      // l'écrire, plutôt que de stocker ce qu'un client a bien voulu envoyer.
      reponse: body.reponse.slice(0, 500),
    });
    return NextResponse.json(resultat);
  } catch (error) {
    if (error instanceof ErreurSeance) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: STATUT_PAR_CODE[error.code] }
      );
    }
    throw error;
  }
}
