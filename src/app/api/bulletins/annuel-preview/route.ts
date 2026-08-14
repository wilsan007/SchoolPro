import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getBulletinAnnuelData } from "@/lib/pdf/bulletin-generator";
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
    const anneeId = searchParams.get("anneeId");

    if (!eleveId || !anneeId) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // Même raison que dans `/api/bulletins/preview` : la bibliothèque de rendu
    // ne borne que le tenant et confie la portée à l'appelant. Or pour PARENT
    // et STUDENT — qui possèdent `bulletins:read` — le filtre de site est
    // NEUTRE (périmètre relationnel, cf. site-scope.ts). Seul
    // `personalScopeFilter` empêche de réclamer le bilan annuel d'un élève qui
    // n'est pas le sien.
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

    const data = await getBulletinAnnuelData(eleveId, anneeId, session.user.tenantId);

    if (!data) {
      return NextResponse.json({ error: "Données introuvables" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[API/bulletins/annuel-preview]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
