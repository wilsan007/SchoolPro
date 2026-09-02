import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

const UpdateSchema = z.object({
  soin: z.string().optional().nullable(),
  suite: z.string().optional(),
  retourCours: z.boolean().optional(),
  dureeMin: z.number().int().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "vie-scolaire:read");
  if (denied) return denied;

  const { id } = await params;
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  const passage = await prisma.passageInfirmerie.findFirst({
    where: {
      id,
      tenantId: session.user.tenantId,
      ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
    },
    include: {
      eleve: { select: { nom: true, prenom: true, classe: { select: { nom: true } } } },
      infirmier: { select: { name: true } },
    },
  });
  if (!passage) {
    return NextResponse.json({ error: "Passage introuvable" }, { status: 404 });
  }
  return NextResponse.json(passage);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "vie-scolaire:write");
  if (denied) return denied;

  try {
    const { id } = await params;
    const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
    const json = await request.json();
    const data = UpdateSchema.parse(json);

    const existing = await prisma.passageInfirmerie.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
      },
      select: { id: true, retourCours: true, eleveId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Passage introuvable" }, { status: 404 });
    }

    const passage = await prisma.passageInfirmerie.update({
      where: { id },
      data: {
        ...(data.soin !== undefined && { soin: data.soin }),
        ...(data.suite !== undefined && { suite: data.suite }),
        ...(data.retourCours !== undefined && { retourCours: data.retourCours }),
        ...(data.dureeMin !== undefined && { dureeMin: data.dureeMin }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        eleve: { select: { nom: true, prenom: true, classe: { select: { nom: true } } } },
      },
    });

    // Si retourCours passe de true à false, notifier les parents.
    if (existing.retourCours && data.retourCours === false) {
      try {
        const eleve = await prisma.eleve.findFirst({
          where: { id: existing.eleveId, tenantId: session.user.tenantId, ...siteFilterForModel("eleve", session.user) },
          select: { nom: true, prenom: true },
        });
        await prisma.notification.create({
          data: {
            tenantId: session.user.tenantId,
            titre: "Passage à l'infirmerie",
            contenu: `Votre enfant ${eleve?.prenom ?? ""} ${eleve?.nom ?? ""} a été conduit à l'infirmerie. Suite donnée : ${data.suite ?? "renvoi domicile"}.`,
            canal: "IN_APP",
            cible: "PARENTS",
            envoyeParId: session.user.id,
            nbDestinataires: 1,
            nbDelivres: 1,
            statut: "ENVOYEE",
            envoyeeAt: new Date(),
          },
        });
      } catch (notifErr) {
        console.error("[Infirmerie PATCH] Notification parents échouée:", notifErr);
      }
    }

    return NextResponse.json(passage);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[Infirmerie PATCH] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "vie-scolaire:write");
  if (denied) return denied;

  const { id } = await params;
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  const existing = await prisma.passageInfirmerie.findFirst({
    where: {
      id,
      tenantId: session.user.tenantId,
      ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Passage introuvable" }, { status: 404 });
  }

  await prisma.passageInfirmerie.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
