import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileToken, mobileUnauthorized } from "@/lib/mobile-auth";

export async function GET(req: NextRequest) {
  const user = await verifyMobileToken(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const tenantId = user.tenantId;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const classeId = searchParams.get("classeId");

  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      ...(classeId ? { classeId } : {}),
      ...(q
        ? {
            OR: [
              { nom: { contains: q, mode: "insensitive" } },
              { prenom: { contains: q, mode: "insensitive" } },
              { matricule: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      matricule: true,
      nom: true,
      prenom: true,
      dateNaissance: true,
      sexe: true,
      statut: true,
      photoUrl: true,
      classe: { select: { id: true, nom: true, niveau: true } },
    },
    orderBy: { nom: "asc" },
    take: 100,
  });

  return NextResponse.json({ eleves });
}
