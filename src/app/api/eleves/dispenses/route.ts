import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { checkPermission } from "@/lib/rbac";
import { z } from "zod";
import { auditFire } from "@/lib/audit";

const CreateSchema = z.object({
  eleveId: z.string().min(1),
  matiereId: z.string().min(1),
  motif: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // API-H1 (audit v2) : contrôle de rôle — seuls les rôles avec eleves:write
  // peuvent créer une dispense.
  const denied = checkPermission(session.user.role, "eleves:write");
  if (denied) return denied;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const { eleveId, matiereId, motif } = parsed.data;

  const siteFilter = siteFilterForModel("eleve", session.user);
  const eleve = await prisma.eleve.findFirst({
    where: { id: eleveId, tenantId: session.user.tenantId, ...siteFilter },
  });
  if (!eleve) {
    return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });
  }

  const matiere = await prisma.matiere.findFirst({
    where: { id: matiereId, tenantId: session.user.tenantId, ...siteFilterForModel("matiere", session.user) },
    select: { id: true, nom: true, code: true },
  });
  if (!matiere) {
    return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  }

  const dispense = await prisma.dispenseMatiere.create({
    data: {
      tenantId: session.user.tenantId,
      eleveId,
      matiereId,
      motif: motif || null,
    },
  });

  return NextResponse.json({
    id: dispense.id,
    matiereId: matiere.id,
    matiereNom: matiere.nom,
    motif: dispense.motif,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // API-H1 (audit v2) : contrôle de rôle — seuls les rôles avec eleves:write
  // peuvent supprimer une dispense.
  const denied = checkPermission(session.user.role, "eleves:write");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  await prisma.dispenseMatiere.delete({
    where: { id, tenantId: session.user.tenantId },
  });

  auditFire({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "dispense:delete",
    verdict: "ALLOWED",
    resource: "dispenseMatiere",
    resourceId: id,
  });

  return NextResponse.json({ success: true });
}
