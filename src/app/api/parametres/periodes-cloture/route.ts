import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import prisma from "@/lib/prisma";

const BodySchema = z.object({
  periodeId: z.string().min(1),
  statut: z.enum(["OUVERTE", "CLOTUREE"]),
  dateLimiteSaisie: z.string().optional(),
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
  const { periodeId, statut, dateLimiteSaisie } = parsed.data;

  const data: Record<string, unknown> = { statut };
  if (statut === "CLOTUREE") {
    data.cloturedAt = new Date();
  } else {
    data.cloturedAt = null;
  }
  if (dateLimiteSaisie) {
    data.dateLimiteSaisie = new Date(dateLimiteSaisie);
  }

  const periode = await prisma.periode.update({
    where: {
      id: periodeId,
      annee: { tenantId: session.user.tenantId },
    },
    data,
  });

  return NextResponse.json(periode);
}
