import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const periodeId = searchParams.get("periodeId");

    if (!classeId || !periodeId) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const tenantId = session.user.tenantId;

    const eleves = await prisma.eleve.findMany({
      where: { classeId, tenantId, statut: "ACTIF" },
      select: {
        id: true,
        nom: true,
        prenom: true,
        matricule: true,
        bulletins: {
          where: { periodeId },
          select: {
            moyenneGenerale: true,
            rang: true,
            decision: true,
            appreciation: true,
          },
        },
      },
      orderBy: [{ prenom: "asc" }, { nom: "asc" }],
    });

    const result = eleves.map((e) => {
      const bulletin = e.bulletins[0];
      return {
        id: e.id,
        nom: e.nom,
        prenom: e.prenom,
        matricule: e.matricule,
        moyenneGenerale: bulletin?.moyenneGenerale ?? null,
        rang: bulletin?.rang ?? null,
        decision: (bulletin?.decision as string | null) ?? null,
        appreciation: bulletin?.appreciation ?? "",
      };
    });

    // Trier par moyenne décroissante
    result.sort((a, b) => (b.moyenneGenerale ?? 0) - (a.moyenneGenerale ?? 0));

    return NextResponse.json({ eleves: result });
  } catch (error) {
    console.error("[API/bulletins/conseil-data]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
