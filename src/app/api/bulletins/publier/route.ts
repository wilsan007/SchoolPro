import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const Schema = z.object({
  classeId: z.string().min(1),
  periodeId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:publish");
    if (denied) return denied;

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const { classeId, periodeId } = parsed.data;
    const tenantId = session.user.tenantId;

    // Récupérer tous les bulletins de la classe pour la période
    const eleves = await prisma.eleve.findMany({
      where: { classeId, tenantId, statut: "ACTIF", ...siteFilterForModel("eleve", session.user) },
      select: { id: true },
    });

    const eleveIds = eleves.map((e) => e.id);

    const result = await prisma.bulletin.updateMany({
      where: { tenantId, ...siteFilterForModel("bulletin", session.user),
        periodeId,
        eleveId: { in: eleveIds },
        isPublie: false,
      },
      data: {
        isPublie: true,
        publishedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `${result.count} bulletins publiés avec succès`,
    });
  } catch (error) {
    console.error("[API/bulletins/publier]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
