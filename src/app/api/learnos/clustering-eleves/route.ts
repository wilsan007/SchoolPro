import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { clustererEleves, apparierTutorat } from "@/lib/learnos/clustering-eleves";

/**
 * Clustering d'élèves & appariement de tutorat par les pairs.
 *
 * GET — calcule en parallèle :
 *   1. Le clustering par profil d'apprentissage (I7)
 *   2. L'appariement tuteur ↔ tutoré (I16)
 *
 * Ouvert à la direction et aux enseignants (`entrainement:read`).
 * Le paramètre `classeId` restreint l'analyse à une classe donnée.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const { searchParams } = new URL(req.url);
  const classeId = searchParams.get("classeId") ?? undefined;

  const [clustering, tutorat] = await Promise.all([
    clustererEleves(tenantId, session.user, classeId),
    apparierTutorat(tenantId, session.user, classeId),
  ]);

  return NextResponse.json({ clustering, tutorat });
}
