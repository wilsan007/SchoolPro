import { NextRequest, NextResponse } from "next/server";
import { verifyMobileToken, mobileUnauthorized } from "@/lib/mobile-auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const user = await verifyMobileToken(req);
    if (!user) return mobileUnauthorized();
    if (!user.tenantId) {
      return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
    }

    const classes = await prisma.classe.findMany({
      where: { tenantId: user.tenantId },
      include: {
        eleves: {
          where: { statut: "ACTIF" },
          select: {
            id: true,
            nom: true,
            prenom: true,
            photoUrl: true,
            sexe: true,
            matricule: true,
          },
          orderBy: [{ nom: "asc" }, { prenom: "asc" }],
        },
      },
      orderBy: { nom: "asc" },
    });

    return NextResponse.json({ classes });
  } catch (error) {
    console.error("[API/mobile/classes]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
