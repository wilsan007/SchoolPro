import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

// ============================================================
// GET /api/remises-caisse/[id] — détail d'une remise de caisse
// ============================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "finance:read");
  if (denied) return denied;

  const { id } = await params;
  const siteFilter = siteFilterForModel("remiseCaisse", session.user);

  const remise = await prisma.remiseCaisse.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter },
    include: {
      caissier: { select: { id: true, name: true } },
      receveur: { select: { id: true, name: true } },
      site: { select: { id: true, nom: true } },
    },
  });

  if (!remise) {
    return NextResponse.json(
      { error: "Remise de caisse introuvable" },
      { status: 404 }
    );
  }

  return NextResponse.json(remise);
}
