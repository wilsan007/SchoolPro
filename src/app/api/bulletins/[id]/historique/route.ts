import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForRelation } from "@/lib/site-filter";

/**
 * GET /api/bulletins/[id]/historique
 * Retourne l'historique des modifications d'un bulletin.
 * Accessible à tout utilisateur ayant la permission `bulletins:read`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:read");
    if (denied) return denied;

    const { id } = await params;

    // Vérifier que le bulletin appartient bien au tenant de l'utilisateur
    const siteFilter = siteFilterForRelation(session.user, "eleve");
    const bulletin = await prisma.bulletin.findFirst({
      where: { id, tenantId: session.user.tenantId, ...siteFilter },
      select: { id: true },
    });
    if (!bulletin) {
      return NextResponse.json({ error: "Bulletin introuvable" }, { status: 404 });
    }

    const historique = await prisma.bulletinHistorique.findMany({
      where: { bulletinId: id, tenantId: session.user.tenantId },
      orderBy: { createdAt: "desc" },
      take: 100, // Limite pour éviter de charger trop de données
    });

    return NextResponse.json({ historique });
  } catch (error) {
    console.error("[API/bulletins/[id]/historique]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
