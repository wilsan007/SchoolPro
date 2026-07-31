import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json();
  const { chefEtablissement, signatureUrl, cachetUrl } = body;

  const tenant = await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: {
      chefEtablissement: chefEtablissement || null,
      signatureUrl: signatureUrl || null,
      cachetUrl: cachetUrl || null,
    },
    select: { name: true, chefEtablissement: true, signatureUrl: true, cachetUrl: true },
  });

  return NextResponse.json(tenant);
}
