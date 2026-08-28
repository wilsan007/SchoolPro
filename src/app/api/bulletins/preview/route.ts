import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getBulletinData } from "@/lib/pdf/bulletin-generator";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  siteFilterForModel,
  personalScopeFilter,
  mergeFilters,
} from "@/lib/site-scope";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const eleveId = searchParams.get("eleveId");
    const periodeId = searchParams.get("periodeId");

    if (!eleveId || !periodeId) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // `getBulletinData` ne connaît ni la session ni le périmètre : elle ne
    // vérifie que le tenant et délègue explicitement le contrôle de portée à
    // l'appelant. On le fait donc ici, AVANT de la solliciter.
    //
    // Le filtre de site ne suffit pas : `bulletins:read` est accordé à PARENT
    // et STUDENT, deux rôles à périmètre relationnel pour lesquels
    // `siteFilterForModel` renvoie un fragment VIDE (cf. site-scope.ts). Sans
    // `personalScopeFilter`, il suffisait de passer l'`eleveId` d'un autre
    // élève pour obtenir son bulletin complet (moyennes, rang, appréciations).
    const eleveAutorise = await prisma.eleve.findFirst({
      where: {
        id: eleveId,
        tenantId: session.user.tenantId,
        ...mergeFilters(
          siteFilterForModel("eleve", session.user),
          personalScopeFilter(session.user, null)
        ),
      },
      select: { id: true },
    });
    if (!eleveAutorise) return erreurJson("ELEVE_INTROUVABLE");

    const data = await getBulletinData(eleveId, periodeId, session.user.tenantId);

    if (!data) {
      return NextResponse.json({ error: "Données introuvables" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[API/bulletins/preview]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
