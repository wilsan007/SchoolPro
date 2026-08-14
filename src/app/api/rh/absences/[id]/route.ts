import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, mergeFilters } from "@/lib/site-filter";

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

  const absence = await prisma.absencePersonnel.findFirst({
    where: mergeFilters(
      { id, tenantId: session.user.tenantId },
      siteFilterForModel("absencePersonnel", session.user)
    ),
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
      where: mergeFilters(
        { enseignantId: absence.enseignantId, tenantId: session.user.tenantId, statut: "INJUSTIFIEE" },
        siteFilterForModel("absencePersonnel", session.user)
      ),
    });
    // La fiche RH a déjà été résolue en amont via `absence` (elle-même filtrée
    // par site ci-dessus) : cette écriture est bornée au même enseignant.
    const ficheExistante = await prisma.ficheRH.findFirst({
      where: mergeFilters(
        { enseignantId: absence.enseignantId, tenantId: session.user.tenantId },
        siteFilterForModel("ficheRH", session.user)
      ),
      select: { enseignantId: true },
    });
    if (ficheExistante) {
      await prisma.ficheRH.update({
        where: { enseignantId: absence.enseignantId },
        data: { absencesCount: count },
      }).catch(() => {});
    }
  }

  return NextResponse.json({ absence: updated });
}
