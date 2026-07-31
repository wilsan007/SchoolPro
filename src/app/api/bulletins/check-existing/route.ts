import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const periodeId = searchParams.get("periodeId");

    if (!classeId || !periodeId) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const count = await prisma.bulletin.count({
      where: {
        eleve: { classeId },
        periodeId,
        tenantId: session.user.tenantId,
      },
    });

    if (count === 0) {
      return NextResponse.json({ exists: false, published: false });
    }

    const publishedCount = await prisma.bulletin.count({
      where: {
        eleve: { classeId },
        periodeId,
        tenantId: session.user.tenantId,
        isPublie: true,
      },
    });

    return NextResponse.json({
      exists: true,
      published: publishedCount > 0,
      count,
    });
  } catch (error) {
    console.error("[API/bulletins/check-existing]", error);
    return NextResponse.json({ exists: false, published: false });
  }
}
