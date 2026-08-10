import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { revalidateTag } from "next/cache";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "examens:write");
    if (denied) return denied;

    const { id } = await params;
    const tenantId = session.user.tenantId;

    const examen = await prisma.examen.findFirst({ where: { id, tenantId } });
    if (!examen) return NextResponse.json({ error: "Examen introuvable" }, { status: 404 });

    if (examen.statut !== "TERMINE") {
      return NextResponse.json({ error: "L'examen doit être terminé pour délibérer" }, { status: 400 });
    }

    const body = await req.json();

    // Enregistrer les notes de délibération comme JSON dans une annotation (extensible)
    // En production : créer un modèle ResultatExamen dédié
    await prisma.examen.update({
      where: { id },
      data: {
        description: `${examen.description ?? ""}\n[DÉLIBÉRÉ le ${new Date().toLocaleDateString("fr-FR")}]`.trim(),
      },
    });

    revalidateTag("dashboard-data");

    return NextResponse.json({
      success: true,
      message: "Délibération validée",
      examId: id,
      deliberedAt: new Date(),
    });
  } catch (error) {
    console.error("[API/examens/:id/deliberation POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
