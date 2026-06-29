import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";

const UpdateSchema = z.object({
  statut: z.enum(["SOUMISE", "EN_EXAMEN", "ADMIS", "REFUSE", "INSCRIT", "ANNULE"]).optional(),
  dateExamen: z.string().optional().nullable(),
  noteExamen: z.number().min(0).max(20).optional().nullable(),
  commentaire: z.string().optional(),
  motifRefus: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "admissions:write");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const data = UpdateSchema.parse(body);

  const candidature = await prisma.candidature.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });

  if (!candidature) {
    return NextResponse.json({ error: "Candidature introuvable" }, { status: 404 });
  }

  const updated = await prisma.candidature.update({
    where: { id },
    data: {
      ...(data.statut && { statut: data.statut }),
      ...(data.dateExamen !== undefined && {
        dateExamen: data.dateExamen ? new Date(data.dateExamen) : null,
      }),
      ...(data.noteExamen !== undefined && { noteExamen: data.noteExamen }),
      ...(data.commentaire !== undefined && { commentaire: data.commentaire }),
      ...(data.motifRefus !== undefined && { motifRefus: data.motifRefus }),
    },
  });

  return NextResponse.json({ candidature: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "admissions:delete");
  if (denied) return denied;

  const { id } = await params;

  const candidature = await prisma.candidature.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });

  if (!candidature) {
    return NextResponse.json({ error: "Candidature introuvable" }, { status: 404 });
  }

  await prisma.candidature.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
