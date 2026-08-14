import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";
import {
  cloturerAnnee,
  reouvrirAnnee,
  archiverAnnee,
  peutCloturer,
  peutArchiver,
  peutReouvrir,
} from "@/lib/annee-scolaire";

/**
 * GET /api/parametres/annees-scolaires/[id]
 * Récupère une année scolaire avec ses périodes.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const { id } = await params;
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      periodes: { orderBy: { numero: "asc" } },
      _count: { select: { evenements: true, learnosPlanifications: true } },
    },
  });

  if (!annee) return erreurJson("ANNEE_INTROUVABLE");

  return Response.json(annee);
}

/**
 * PATCH /api/parametres/annees-scolaires/[id]
 * Actions sur une année scolaire.
 * Body: { action: "cloturer" | "reouvrir" | "archiver" }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.action) return erreurJson("DONNEES_INVALIDES");

  // Vérifier que l'année appartient au tenant
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!annee) return erreurJson("ANNEE_INTROUVABLE");

  try {
    switch (body.action) {
      case "cloturer": {
        if (!peutCloturer(annee)) {
          return erreurJson("STATUT_INVALIDE", undefined, {
            detail: `Statut actuel: ${annee.statut}`,
          });
        }
        const result = await cloturerAnnee(id, session.user.id);
        return Response.json(result);
      }

      case "reouvrir": {
        if (!peutReouvrir(annee)) {
          return erreurJson("STATUT_INVALIDE", undefined, {
            detail: `Statut actuel: ${annee.statut}`,
          });
        }
        const result = await reouvrirAnnee(id, session.user.id);
        return Response.json(result);
      }

      case "archiver": {
        if (!peutArchiver(annee)) {
          const raison = annee.isCurrent
            ? "L'année courante ne peut pas être archivée"
            : `Statut actuel: ${annee.statut}`;
          return erreurJson("STATUT_INVALIDE", undefined, { detail: raison });
        }
        const result = await archiverAnnee(id, session.user.id);
        return Response.json(result);
      }

      default:
        return erreurJson("DONNEES_INVALIDES");
    }
  } catch (e) {
    return erreurJson("ERREUR_SERVEUR", undefined, {
      detail: e instanceof Error ? e.message : undefined,
    });
  }
}
