import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const UpdateSchema = z.object({
  titre: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  niveau: z.enum(["DEBUTANT", "INTERMEDIAIRE", "AVANCE"]).optional(),
  statut: z.enum(["BROUILLON", "PUBLIE", "ARCHIVE"]).optional(),
  matiereNom: z.string().optional(),
  classeNom: z.string().optional(),
  imageUrl: z.string().optional(),
  dureeMin: z.number().optional(),
});

const ContenuSchema = z.object({
  action: z.literal("add_contenu"),
  titre: z.string().min(1),
  type: z.enum(["VIDEO", "DOCUMENT", "LIEN", "TEXTE", "QUIZ"]).default("TEXTE"),
  url: z.string().optional(),
  texte: z.string().optional(),
  dureeMin: z.number().optional(),
  ordre: z.number().default(0),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "cours:read");
  if (denied) return denied;

  const { id } = await params;


  const siteFilter = siteFilterForModel("cours", session.user);
  const cours = await prisma.cours.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter },
    include: {
      contenus: { orderBy: { ordre: "asc" } },
      progressions: true,
      _count: { select: { contenus: true, progressions: true } },
    },
  });

  if (!cours) return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });

  // Incrémenter le compteur de vues
  await prisma.cours.update({ where: { id }, data: { nbVues: { increment: 1 } } });

  return NextResponse.json({ cours });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "cours:write");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();

  // Vérifier que le cours existe
  const siteFilter1 = siteFilterForModel("cours", session.user);

  const existing = await prisma.cours.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter1 },
  });
  if (!existing) return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });

  // Ajout de contenu
  if (body.action === "add_contenu") {
    const data = ContenuSchema.parse(body);
    const contenu = await prisma.contenuCours.create({
      data: {
        coursId: id,
        titre: data.titre,
        type: data.type,
        url: data.url,
        texte: data.texte,
        dureeMin: data.dureeMin,
        ordre: data.ordre,
      },
    });
    return NextResponse.json({ contenu });
  }

  // Mise à jour du cours
  const data = UpdateSchema.parse(body);
  const cours = await prisma.cours.update({
    where: { id },
    data,
    include: {
      contenus: { orderBy: { ordre: "asc" } },
      _count: { select: { contenus: true, progressions: true } },
    },
  });

  return NextResponse.json({ cours });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "cours:delete");
  if (denied) return denied;

  const { id } = await params;

  const siteFilter2 = siteFilterForModel("cours", session.user);

  const existing = await prisma.cours.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter2 },
  });
  if (!existing) return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });

  await prisma.cours.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
