import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForRelation } from "@/lib/site-filter";

const ActionSchema = z.object({
  action: z.enum(["APPROUVE", "REFUSE", "ANNULE"]),
  commentaire: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "rh:write");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const { action, commentaire } = ActionSchema.parse(body);

  const userFilter = siteFilterForRelation(session.user, "user");
  const siteFilter = Object.keys(userFilter).length > 0
    ? { enseignant: (userFilter as any).user }
    : {};

  const conge = await prisma.congePersonnel.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter },
  });
  if (!conge) {
    return NextResponse.json({ error: "Congé introuvable" }, { status: 404 });
  }

  const updated = await prisma.congePersonnel.update({
    where: { id },
    data: {
      statut: action,
      approuveParId: session.user.id,
      approuveAt: new Date(),
      commentaire: commentaire || conge.commentaire,
    },
  });

  if (action === "APPROUVE" && conge.type === "ANNUEL") {
    await prisma.ficheRH.update({
      where: { enseignantId: conge.enseignantId },
      data: { congesPris: { increment: conge.nbJours } },
    });
  }

  return NextResponse.json({ conge: updated });
}
