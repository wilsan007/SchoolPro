import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const UpdateSchema = z.object({
  statut: z.enum(["PLANIFIE", "REALISE", "ANNULE", "REPORTÉ"]).optional(),
  compteRendu: z.string().optional(),
  decisions: z.string().optional(),
  suivi: z.string().optional(),
  prochainRendezVous: z.string().datetime().nullable().optional(),
  motif: z.string().max(500).optional(),
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
  const entretien = await prisma.entretienConseiller.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      eleve: { select: { nom: true, prenom: true, classe: { select: { nom: true } } } },
      conseiller: { select: { name: true } },
    },
  });
  if (!entretien) {
    return NextResponse.json({ error: "Entretien introuvable" }, { status: 404 });
  }
  return NextResponse.json(entretien);
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
    const json = await request.json();
    const data = UpdateSchema.parse(json);

    const existing = await prisma.entretienConseiller.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true, statut: true, eleveId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Entretien introuvable" }, { status: 404 });
    }

    const entretien = await prisma.entretienConseiller.update({
      where: { id },
      data: {
        ...(data.statut && { statut: data.statut }),
        ...(data.compteRendu !== undefined && { compteRendu: data.compteRendu }),
        ...(data.decisions !== undefined && { decisions: data.decisions }),
        ...(data.suivi !== undefined && { suivi: data.suivi }),
        ...(data.motif !== undefined && { motif: data.motif }),
        ...(data.prochainRendezVous !== undefined && {
          prochainRendezVous: data.prochainRendezVous
            ? new Date(data.prochainRendezVous)
            : null,
        }),
      },
      include: {
        eleve: { select: { nom: true, prenom: true, classe: { select: { nom: true } } } },
      },
    });

    // Quand l'entretien est réalisé, notifier les parents.
    if (existing.statut !== "REALISE" && data.statut === "REALISE") {
      try {
        const eleve = await prisma.eleve.findFirst({
          where: { id: existing.eleveId, tenantId: session.user.tenantId, ...siteFilterForModel("eleve", session.user) },
          select: { nom: true, prenom: true },
        });
        await prisma.notification.create({
          data: {
            tenantId: session.user.tenantId,
            titre: "Entretien avec le conseiller",
            contenu: `Un entretien a été réalisé avec ${eleve?.prenom ?? ""} ${eleve?.nom ?? ""}. Motif : ${data.motif ?? entretien.motif}.`,
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
        console.error("[Entretien PATCH] Notification parents échouée:", notifErr);
      }
    }

    return NextResponse.json(entretien);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[Entretien PATCH] Erreur:", err);
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
  const existing = await prisma.entretienConseiller.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Entretien introuvable" }, { status: 404 });
  }

  await prisma.entretienConseiller.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
