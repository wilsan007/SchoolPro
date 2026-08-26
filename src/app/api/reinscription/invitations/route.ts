import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";
import { siteFilterForModel, mergeFilters } from "@/lib/site-scope";

/**
 * GET /api/reinscription/invitations?campagneId=...&statut=...
 * Liste les invitations d'une campagne (admin/secretary).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const { searchParams } = new URL(req.url);
  const campagneId = searchParams.get("campagneId");
  const statut = searchParams.get("statut");

  if (!campagneId) return erreurJson("DONNEES_INVALIDES");

  const invitations = await prisma.invitationReinscription.findMany({
    where: mergeFilters(
      {
        tenantId: session.user.tenantId,
        campagneId,
        ...(statut && statut !== "ALL" ? { statut } : {}),
      },
      siteFilterForModel("eleve", session.user)
    ),
    include: {
      eleve: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          matricule: true,
          statut: true,
          classe: { select: { nom: true, niveau: true } },
          parents: {
            include: { parent: { select: { nom: true, prenom: true, phone: true, email: true } } },
          },
        },
      },
    },
    orderBy: { eleve: { nom: "asc" } },
  });

  return Response.json({ invitations });
}
