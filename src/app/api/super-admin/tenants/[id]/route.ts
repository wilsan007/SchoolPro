import { NextRequest, NextResponse } from "next/server";
import { ELEVE_NON_ARCHIVE } from "@/lib/eleve-filters";
import { authorizeSuperAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.string().min(1),
});

const UpdateSchema = z.object({
  status: z.enum(["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"]).optional(),
  plan: z.enum(["STARTER", "PRO", "BUSINESS", "ENTERPRISE"]).optional(),
  trialEndsAt: z.string().optional().nullable(),
  name: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await authorizeSuperAdmin();
  if (!gate.ok) return gate.response;

  try {
    const { id } = ParamsSchema.parse(await params);
    const json = await request.json();
    const data = UpdateSchema.parse(json);

    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        ...data,
        trialEndsAt: data.trialEndsAt ? new Date(data.trialEndsAt) : undefined,
      },
      include: {
        _count: { select: { eleves: ELEVE_NON_ARCHIVE, enseignants: true, users: true } },
      },
    });

    return NextResponse.json(tenant);
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
  const gate = await authorizeSuperAdmin();
  if (!gate.ok) return gate.response;

  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors }, { status: 400 });
  }
  const { id } = parsed.data;

  // Suppression en cascade (onDelete: Cascade sur tous les modèles enfants)
  await prisma.tenant.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
