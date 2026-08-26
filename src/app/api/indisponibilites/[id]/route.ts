import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

/**
 * DELETE /api/indisponibilites/[id]
 *
 * Supprime une indisponibilité. Seuls les admins ou les utilisateurs
 * avec emploi-du-temps:write peuvent supprimer.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:write");
    if (denied) return denied;

    const { id } = await params;

    const indispo = await prisma.indisponibiliteEnseignant.findFirst({
      where: { id, tenantId: session.user.tenantId, ...siteFilterForModel("indisponibiliteEnseignant", session.user) },
    });
    if (!indispo) {
      return NextResponse.json({ error: "Indisponibilité introuvable" }, { status: 404 });
    }

    await prisma.indisponibiliteEnseignant.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API/indisponibilites DELETE]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
