import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import { ContexteAppreciation } from "@prisma/client";

const RegleSchema = z.object({
  contexte: z.nativeEnum(ContexteAppreciation),
  seuilMin: z.coerce.number().default(0),
  seuilMax: z.coerce.number().default(0),
  libelle: z.string().min(1),
  ordre: z.coerce.number().default(0),
});

const PutSchema = RegleSchema.omit({ ordre: true }).extend({
  id: z.string().min(1),
  ordre: z.coerce.number().optional(),
});

const QuerySchema = z.object({
  id: z.string().min(1),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const denied = checkPermission(session.user.role, "parametres:read");
  if (denied) return denied;

  const regles = await prisma.reglesAppreciation.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ contexte: "asc" }, { seuilMin: "asc" }],
  });

  return NextResponse.json({ regles });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const denied = checkPermission(session.user.role, "parametres:write");
  if (denied) return denied;

  const parsed = RegleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const regle = await prisma.reglesAppreciation.create({
    data: {
      tenantId: session.user.tenantId,
      ...parsed.data,
    },
  });

  return NextResponse.json(regle);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const denied = checkPermission(session.user.role, "parametres:write");
  if (denied) return denied;

  const parsed = PutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const { id, ...data } = parsed.data;

  const regle = await prisma.reglesAppreciation.update({
    where: { id, tenantId: session.user.tenantId },
    data,
  });

  return NextResponse.json(regle);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const denied = checkPermission(session.user.role, "parametres:write");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({ id: searchParams.get("id") });
  if (!parsed.success) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  await prisma.reglesAppreciation.delete({
    where: { id: parsed.data.id, tenantId: session.user.tenantId },
  });

  return NextResponse.json({ success: true });
}
