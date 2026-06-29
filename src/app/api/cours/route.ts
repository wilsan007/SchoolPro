import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";

const CoursSchema = z.object({
  titre: z.string().min(1).max(200),
  description: z.string().optional(),
  niveau: z.enum(["DEBUTANT", "INTERMEDIAIRE", "AVANCE"]).default("INTERMEDIAIRE"),
  statut: z.enum(["BROUILLON", "PUBLIE", "ARCHIVE"]).default("BROUILLON"),
  matiereNom: z.string().optional(),
  classeNom: z.string().optional(),
  imageUrl: z.string().optional(),
  dureeMin: z.number().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "cours:read");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const statut = searchParams.get("statut");
  const niveau = searchParams.get("niveau");

  const cours = await prisma.cours.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(statut && { statut: statut as "BROUILLON" | "PUBLIE" | "ARCHIVE" }),
      ...(niveau && { niveau: niveau as "DEBUTANT" | "INTERMEDIAIRE" | "AVANCE" }),
    },
    include: {
      _count: { select: { contenus: true, progressions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ cours });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "cours:write");
  if (denied) return denied;

  const body = await req.json();
  const data = CoursSchema.parse(body);

  const cours = await prisma.cours.create({
    data: {
      tenantId: session.user.tenantId,
      ...data,
      auteurNom: session.user.name,
    },
    include: {
      _count: { select: { contenus: true, progressions: true } },
    },
  });

  return NextResponse.json({ cours }, { status: 201 });
}
