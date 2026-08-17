import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { genererRevisionSemaine } from "@/lib/learnos/revision-semaine";

/**
 * GET /api/learnos/revision-semaine?eleveId=...&classeId=...&anneeId=...
 *
 * Génère la révision de la semaine pour un élève : résumés des chapitres
 * traités cette semaine, re-levelés selon le niveau de lecture de l'élève.
 *
 * Ouvert à STUDENT (pour soi), PARENT (pour son enfant), et au personnel
 * avec `entrainement:read`.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const { searchParams } = new URL(req.url);
  const eleveId = searchParams.get("eleveId");
  const classeId = searchParams.get("classeId");
  const anneeId = searchParams.get("anneeId");

  if (!eleveId || !classeId || !anneeId) {
    return NextResponse.json(
      { error: "eleveId, classeId et anneeId sont requis" },
      { status: 400 }
    );
  }

  // Vérifier que l'élève existe et appartient au tenant.
  // Pour STUDENT et PARENT, le filtre de site est neutre (périmètre relationnel).
  const eleve = await prisma.eleve.findFirst({
    where: { id: eleveId, tenantId, deletedAt: null, ...siteFilterForModel("eleve", session.user) },
    select: { id: true, userId: true, classeId: true },
  });
  if (!eleve) return erreurJson("ELEVE_INTROUVABLE");

  // Les élèves ne peuvent voir que leur propre révision.
  if (session.user.role === "STUDENT" && eleve.userId !== session.user.id) {
    return erreurJson("NON_AUTORISE");
  }

  // Les parents ne peuvent voir que la révision de leurs enfants.
  if (session.user.role === "PARENT") {
    // eslint-disable-next-line ecolpro/require-site-filter
    const lien = await prisma.eleveParent.findFirst({
      where: { eleveId, parent: { userId: session.user.id } },
    });
    if (!lien) return erreurJson("NON_AUTORISE");
  }

  try {
    const revision = await genererRevisionSemaine(
      tenantId,
      session.user,
      eleveId,
      classeId,
      anneeId
    );
    return NextResponse.json(revision);
  } catch (error) {
    console.error("[api/revision-semaine]", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération de la révision" },
      { status: 500 }
    );
  }
}
