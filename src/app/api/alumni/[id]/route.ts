import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const UpdateSchema = z.object({
  email: z.string().email().optional().nullable(),
  telephone: z.string().optional().nullable(),
  statut: z.enum(["ETUDES_SUPERIEURES", "EN_EMPLOI", "RECHERCHE_EMPLOI", "ENTREPRENEUR", "INCONNU"]).optional(),
  etablissement: z.string().optional().nullable(),
  formation: z.string().optional().nullable(),
  ville: z.string().optional().nullable(),
  pays: z.string().optional().nullable(),
  linkedin: z.string().optional().nullable(),
  accepteContact: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  mention: z.string().optional().nullable(),
  numeroDiplome: z.string().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "alumni:write");
  if (denied) return denied;

  const { id } = await params;

  const siteFilter = siteFilterForModel("alumni", session.user);
  try {
    const json = await request.json();
    const data = UpdateSchema.parse(json);


    const existing = await prisma.alumni.findFirst({
      where: { id, tenantId: session.user.tenantId, ...siteFilter },
    });
    if (!existing) return NextResponse.json({ error: "Alumni introuvable" }, { status: 404 });

    const alumni = await prisma.alumni.update({
      where: { id },
      data,
    });

    return NextResponse.json(alumni);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
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
  const denied = checkPermission(session.user.role, "alumni:delete");
  if (denied) return denied;

  const { id } = await params;

  const siteFilter2 = siteFilterForModel("alumni", session.user);

  const existing = await prisma.alumni.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter2 },
  });
  if (!existing) return NextResponse.json({ error: "Alumni introuvable" }, { status: 404 });

  await prisma.alumni.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
