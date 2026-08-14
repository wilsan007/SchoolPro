import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { chargerSeance } from "@/lib/learnos/entrainement";

/**
 * État d'une séance, tel que l'élève a le droit de le voir.
 *
 * La projection retire les réponses attendues et n'expose que les étapes déjà
 * atteintes (cf. `vueEleve`). Renvoyer la feuille entière pour épargner des
 * allers-retours publierait le corrigé dans l'onglet réseau du navigateur.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const { id } = await params;
  const seance = await chargerSeance(session.user.tenantId, id, session.user);
  if (!seance) {
    return erreurJson("SEANCE_INTROUVABLE");
  }

  return NextResponse.json(seance);
}
