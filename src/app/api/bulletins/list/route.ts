import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";

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
    const eleveId = searchParams.get("eleveId");

    const where: any = { tenantId: session.user.tenantId };
    
    if (periodeId) where.periodeId = periodeId;
    if (eleveId) {
      where.eleveId = eleveId;
    } else if (classeId) {
      where.eleve = { classeId };
    }

    const bulletins = await prisma.bulletin.findMany({
      where,
      include: {
        eleve: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            matricule: true,
            classe: { select: { nom: true } }
          }
        },
        periode: {
          select: { nom: true, numero: true }
        }
      },
      orderBy: [
        { eleve: { nom: "asc" } }
      ]
    });

    return NextResponse.json({ bulletins });
  } catch (error) {
    console.error("[API/bulletins/list]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
