import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForRelation } from "@/lib/site-filter";

const UpdateSchema = z.object({
  statut: z.enum(["JUSTIFIEE", "INJUSTIFIEE", "EN_ATTENTE"]),
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
  const { statut, commentaire } = UpdateSchema.parse(body);

  const userFilter = siteFilterForRelation(session.user, "user");
  const siteFilter = Object.keys(userFilter).length > 0
    ? { enseignant: (userFilter as any).user }
    : {};

  const absence = await prisma.absencePersonnel.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter },
  });
  if (!absence) {
    return NextResponse.json({ error: "Absence introuvable" }, { status: 404 });
  }

  const updated = await prisma.absencePersonnel.update({
    where: { id },
    data: {
      statut,
      commentaire: commentaire || absence.commentaire,
    },
  });

  if (statut === "INJUSTIFIEE" || statut === "JUSTIFIEE") {
    const count = await prisma.absencePersonnel.count({
      where: {
        enseignantId: absence.enseignantId,
        tenantId: session.user.tenantId,
        statut: "INJUSTIFIEE",
      },
    });
    await prisma.ficheRH.update({
      where: { enseignantId: absence.enseignantId },
      data: { absencesCount: count },
    }).catch(() => {});
  }

  return NextResponse.json({ absence: updated });
}
