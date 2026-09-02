import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import prisma from "@/lib/prisma";

const BodySchema = z.object({
  chefEtablissement: z.string().nullable().optional(),
  signatureUrl: z.string().nullable().optional(),
  cachetUrl: z.string().nullable().optional(),
});

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const denied = checkPermission(session.user.role, "parametres:write");
  if (denied) return denied;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const { chefEtablissement, signatureUrl, cachetUrl } = parsed.data;

  const tenant = await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: {
      chefEtablissement: chefEtablissement ?? null,
      signatureUrl: signatureUrl ?? null,
      cachetUrl: cachetUrl ?? null,
    },
    select: { name: true, chefEtablissement: true, signatureUrl: true, cachetUrl: true },
  });

  return NextResponse.json(tenant);
}
