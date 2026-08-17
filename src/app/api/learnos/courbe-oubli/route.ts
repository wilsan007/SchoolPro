import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { calculerCourbeOubli } from "@/lib/learnos/courbe-oubli";

/**
 * Courbe d'oubli : modélisation de la décroissance de la maîtrise
 * dans le temps, par compétence (ou agrégée sur toutes les compétences
 * rattachées à des preuves).
 *
 * Ouvert à la direction et aux enseignants (`entrainement:read`).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const { searchParams } = new URL(req.url);
  const competenceId = searchParams.get("competenceId") ?? undefined;

  const courbeOubli = await calculerCourbeOubli(
    tenantId,
    session.user,
    competenceId
  );

  return NextResponse.json({ courbeOubli });
}
