import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  analyserReussiteSuperieure,
  analyserInsertionParFiliere,
  analyserReseauAlumni,
} from "@/lib/learnos/alumni-intelligence";

/**
 * Intelligence post-diplôme (alumni).
 *
 * GET — calcule en parallèle :
 *   1. Réussite supérieure des diplômés (I26)
 *   2. Filière d'orientation → insertion professionnelle (I27)
 *   3. Activité du réseau alumni (I28)
 *
 * Ouvert à la direction et aux enseignants (`entrainement:read`).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;

  const [reussiteSuperieure, insertionParFiliere, reseauAlumni] =
    await Promise.all([
      analyserReussiteSuperieure(tenantId, session.user),
      analyserInsertionParFiliere(tenantId, session.user),
      analyserReseauAlumni(tenantId, session.user),
    ]);

  return NextResponse.json({
    reussiteSuperieure,
    insertionParFiliere,
    reseauAlumni,
  });
}
