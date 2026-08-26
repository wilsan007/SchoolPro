import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import type { StructureType } from "@prisma/client";
import { siteFilterForModel } from "@/lib/site-scope";
import { erreurJson } from "@/lib/erreurs-api";

const STRUCTURE_TYPES: StructureType[] = ["MATERNELLE", "PRIMAIRE", "COLLEGE", "LYCEE"];

const CreateSchema = z.object({
  types: z.array(z.enum(["MATERNELLE", "PRIMAIRE", "COLLEGE", "LYCEE"])).min(1),
  siteId: z.string().nullable().optional(), // null = structure partagée entre tous les sites
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return erreurJson("NON_AUTORISE");
    }

    const structures = await prisma.structure.findMany({
      where: { tenantId: session.user.tenantId, ...siteFilterForModel("structure", session.user) },
      include: {
        site: { select: { id: true, nom: true } },
        _count: { select: { classes: true } },
      },
      orderBy: [{ siteId: "asc" }, { type: "asc" }],
    });

    return NextResponse.json(structures);
  } catch (error) {
    console.error("[API/structures] GET", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return erreurJson("NON_AUTORISE");
    }

    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return erreurJson("PERMISSIONS_INSUFFISANTES");
    }

    const json = await req.json();
    const { types, siteId = null } = CreateSchema.parse(json);

    const tenantId = session.user.tenantId;

    // Si siteId est fourni, vérifier qu'il appartient bien au tenant
    if (siteId) {
      const site = await prisma.site.findFirst({
        where: { id: siteId, tenantId },
        select: { id: true },
      });
      if (!site) {
        return erreurJson("SITE_INTROUVABLE");
      }
    }

    // Récupérer les structures déjà existantes pour ce site (ou partagées si siteId=null)
    // pour ne pas les recréer — déduplication par (tenant, site, type)
    // eslint-disable-next-line ecolpro/require-site-filter -- siteId est filtré explicitement
    const existing = await prisma.structure.findMany({
      where: {
        tenantId,
        siteId: siteId ?? null,
        type: { in: types },
      },
      select: { type: true },
    });
    const existingTypes = new Set(existing.map((s) => s.type));

    const toCreate = types
      .filter((type) => !existingTypes.has(type))
      .map((type) => ({
        tenantId,
        siteId: siteId ?? null,
        type,
        nom: typeLabel(type),
        actif: true,
      }));

    if (toCreate.length > 0) {
      await prisma.structure.createMany({ data: toCreate });
    }

    const all = await prisma.structure.findMany({
      where: { tenantId, ...siteFilterForModel("structure", session.user) },
      include: {
        site: { select: { id: true, nom: true } },
        _count: { select: { classes: true } },
      },
      orderBy: [{ siteId: "asc" }, { type: "asc" }],
    });

    return NextResponse.json(all, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: error.errors });
    }
    console.error("[API/structures] POST", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return erreurJson("NON_AUTORISE");
    }

    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return erreurJson("PERMISSIONS_INSUFFISANTES");
    }

    const { searchParams } = new URL(req.url);
    const structureId = searchParams.get("id");
    if (!structureId) {
      return erreurJson("DONNEES_INVALIDES");
    }

    // Vérifier l'appartenance de la structure au tenant et au site
    const structure = await prisma.structure.findFirst({
      where: { id: structureId, tenantId: session.user.tenantId, ...siteFilterForModel("structure", session.user) },
    });
    if (!structure) {
      return NextResponse.json({ error: "Structure introuvable" }, { status: 404 });
    }

    // Vérifier qu'il n'y a pas de classes rattachées
    const classCount = await prisma.classe.count({
      where: { structureId, tenantId: session.user.tenantId, ...siteFilterForModel("classe", session.user) },
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
    return erreurJson("ERREUR_SERVEUR");
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
