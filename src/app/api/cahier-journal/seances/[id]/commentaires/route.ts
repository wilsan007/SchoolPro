import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { siteFilterForModel } from "@/lib/site-scope";
import { auditFire } from "@/lib/audit";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { z } from "zod";

const CreateSchema = z.object({
  contenu: z.string().min(1).max(2000),
});

const DeleteSchema = z.object({
  commentaireId: z.string().min(1),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "cahier-journal:read");
    if (denied) return denied;

    const { id } = await params;
    const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
    const seance = await prisma.seancePedagogique.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        ...siteFilterForModel("seancePedagogique", session.user),
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
      },
      select: { id: true },
    });
    if (!seance) return erreurJson("SEANCE_INTROUVABLE");

    const commentaires = await prisma.seanceCommentaire.findMany({
      where: { seanceId: id },
      include: {
        auteur: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ commentaires });
  } catch (error) {
    console.error("[API/cahier-journal/seances/:id/commentaires GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "cahier-journal:read");
    if (denied) return denied;

    const { id } = await params;
    const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
    const seance = await prisma.seancePedagogique.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        ...siteFilterForModel("seancePedagogique", session.user),
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
      },
      select: { id: true },
    });
    if (!seance) return erreurJson("SEANCE_INTROUVABLE");

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    const commentaire = await prisma.seanceCommentaire.create({
      data: {
        seanceId: id,
        auteurId: session.user.id,
        contenu: parsed.data.contenu,
      },
      include: {
        auteur: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    auditFire({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "cahier-journal:commentaire-ajout",
      verdict: "ALLOWED",
      resource: "seancePedagogique",
      resourceId: id,
      metadata: { commentaireId: commentaire.id },
    });

    return NextResponse.json(commentaire, { status: 201 });
  } catch (error) {
    console.error("[API/cahier-journal/seances/:id/commentaires POST]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

    const { id } = await params;
    const body = await req.json();
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    const commentaire = await prisma.seanceCommentaire.findFirst({
      where: {
        id: parsed.data.commentaireId,
        seanceId: id,
        seance: {
          tenantId: session.user.tenantId,
          ...siteFilterForModel("seancePedagogique", session.user),
        },
      },
      include: { seance: { select: { tenantId: true } } },
    });
    if (!commentaire) return erreurJson("SEANCE_INTROUVABLE");

    const isAuthor = commentaire.auteurId === session.user.id;
    const isAdmin = ["TENANT_ADMIN", "PRINCIPAL", "SUPER_ADMIN"].includes(session.user.role);
    if (!isAuthor && !isAdmin) return erreurJson("PERMISSIONS_INSUFFISANTES");

    await prisma.seanceCommentaire.delete({ where: { id: parsed.data.commentaireId } });

    auditFire({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "cahier-journal:commentaire-suppression",
      verdict: "ALLOWED",
      resource: "seancePedagogique",
      resourceId: id,
      metadata: { commentaireId: parsed.data.commentaireId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API/cahier-journal/seances/:id/commentaires DELETE]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
