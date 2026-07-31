import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import type { StructureType } from "@prisma/client";

const STRUCTURE_TYPES: StructureType[] = ["MATERNELLE", "PRIMAIRE", "COLLEGE", "LYCEE"];

const CreateSchema = z.object({
  types: z.array(z.enum(["MATERNELLE", "PRIMAIRE", "COLLEGE", "LYCEE"])).min(1),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const structures = await prisma.structure.findMany({
      where: { tenantId: session.user.tenantId },
      include: {
        _count: { select: { classes: true } },
      },
      orderBy: [{ type: "asc" }],
    });

    return NextResponse.json(structures);
  } catch (error) {
    console.error("[API/structures] GET", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const json = await req.json();
    const { types } = CreateSchema.parse(json);

    const tenantId = session.user.tenantId;

    // Récupérer les structures déjà existantes pour ne pas les recréer
    const existing = await prisma.structure.findMany({
      where: { tenantId },
      select: { type: true },
    });
    const existingTypes = new Set(existing.map((s) => s.type));

    const toCreate = types
      .filter((type) => !existingTypes.has(type))
      .map((type) => ({
        tenantId,
        type,
        nom: typeLabel(type),
        actif: true,
      }));

    if (toCreate.length > 0) {
      await prisma.structure.createMany({ data: toCreate });
    }

    const all = await prisma.structure.findMany({
      where: { tenantId },
      include: { _count: { select: { classes: true } } },
      orderBy: [{ type: "asc" }],
    });

    return NextResponse.json(all, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("[API/structures] POST", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const structureId = searchParams.get("id");
    if (!structureId) {
      return NextResponse.json({ error: "id requis" }, { status: 400 });
    }

    // Vérifier qu'il n'y a pas de classes rattachées
    const classCount = await prisma.classe.count({
      where: { structureId, tenantId: session.user.tenantId },
    });
    if (classCount > 0) {
      return NextResponse.json(
        { error: `Impossible de supprimer : ${classCount} classe(s) rattachée(s)` },
        { status: 409 }
      );
    }

    await prisma.structure.delete({
      where: { id: structureId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/structures] DELETE", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

function typeLabel(type: StructureType): string {
  const labels: Record<StructureType, string> = {
    MATERNELLE: "Maternelle",
    PRIMAIRE: "Primaire",
    COLLEGE: "Collège",
    LYCEE: "Lycée",
  };
  return labels[type];
}
