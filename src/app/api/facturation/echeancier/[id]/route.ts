import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";
import { annulerEcheancier, marquerEcheancePayee } from "@/lib/echeancier";

/**
 * PATCH /api/facturation/echeancier/[id]
 * Actions sur un échéancier ou une échéance.
 * Body: { action: "annuler" } — annule l'échéancier
 * Body: { action: "marquerPayee", echeanceId, paiementId } — marque une échéance payée
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.action) return erreurJson("DONNEES_INVALIDES");

  // Vérifier que l'échéancier appartient au tenant (via facture)
  const echeancier = await prisma.echeancier.findFirst({
    where: { id, facture: { tenantId: session.user.tenantId } },
  });
  if (!echeancier) return erreurJson("ECHEANCIER_INTROUVABLE");

  try {
    switch (body.action) {
      case "annuler": {
        const result = await annulerEcheancier(id);
        return Response.json(result);
      }

      case "marquerPayee": {
        if (!body.echeanceId || !body.paiementId) {
          return erreurJson("DONNEES_INVALIDES");
        }
        const result = await marquerEcheancePayee(body.echeanceId, body.paiementId);
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
