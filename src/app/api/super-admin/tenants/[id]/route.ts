import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { Session } from "next-auth";

function requireSuperAdmin(session: Session | null) {
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    throw new Error("FORBIDDEN");
  }
}

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
  const session = await auth();
  try { requireSuperAdmin(session); } catch {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const json = await request.json();
    const data = UpdateSchema.parse(json);

    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        ...data,
        trialEndsAt: data.trialEndsAt ? new Date(data.trialEndsAt) : undefined,
      },
      include: {
        _count: { select: { eleves: true, enseignants: true, users: true } },
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
  const session = await auth();
  try { requireSuperAdmin(session); } catch {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { id } = await params;

  // Suppression en cascade (onDelete: Cascade sur tous les modèles enfants)
  await prisma.tenant.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
