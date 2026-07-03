import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";

const LinkSchema = z.object({
  eleveId: z.string().min(1),
  parentId: z.string().min(1),
  lien: z.enum(["PERE", "MERE", "TUTEUR", "AUTRE"]).default("TUTEUR"),
  isGardien: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "eleves:write");
  if (denied) return denied;

  const body = await req.json();
  const parsed = LinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
  }

  const { eleveId, parentId, lien, isGardien } = parsed.data;
  const tenantId = session.user.tenantId;

  // Verify both belong to tenant
  const eleve = await prisma.eleve.findFirst({ where: { id: eleveId, tenantId } });
  if (!eleve) return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });

  const parent = await prisma.parent.findFirst({ where: { id: parentId, tenantId } });
  if (!parent) return NextResponse.json({ error: "Parent introuvable" }, { status: 404 });

  // Check if link already exists
  const existing = await prisma.eleveParent.findUnique({
    where: { eleveId_parentId: { eleveId, parentId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Ce lien existe déjà" }, { status: 409 });
  }

  const link = await prisma.eleveParent.create({
    data: { eleveId, parentId, lien, isGardien },
  });

  return NextResponse.json({ success: true, link }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const eleveId = searchParams.get("eleveId");

  if (eleveId) {
    const parents = await prisma.eleveParent.findMany({
      where: { eleveId },
      include: { parent: { select: { id: true, nom: true, prenom: true, phone: true, email: true } } },
    });
    return NextResponse.json({ parents });
  }

  // List all links with eleve and parent info
  const links = await prisma.eleveParent.findMany({
    where: { eleve: { tenantId: session.user.tenantId } },
    include: {
      eleve: { select: { id: true, nom: true, prenom: true, matricule: true } },
      parent: { select: { id: true, nom: true, prenom: true, phone: true, email: true } },
    },
  });
  return NextResponse.json({ links });
}
