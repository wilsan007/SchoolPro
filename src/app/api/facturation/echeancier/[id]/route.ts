import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { annulerEcheancier, marquerEcheancePayee } from "@/lib/echeancier";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("annuler") }),
  z.object({
    action: z.literal("marquerPayee"),
    echeanceId: z.string().min(1),
    paiementId: z.string().min(1),
  }),
]);

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

  const denied = checkPermission(session.user.role, "finance:write");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return erreurJson("DONNEES_INVALIDES");

  // Vérifier que l'échéancier appartient au tenant (via facture)
  const echeancier = await prisma.echeancier.findFirst({
    where: { id, facture: { tenantId: session.user.tenantId } },
  });
  if (!echeancier) return erreurJson("ECHEANCIER_INTROUVABLE");

  try {
    switch (parsed.data.action) {
      case "annuler": {
        const result = await annulerEcheancier(id);
        return Response.json(result);
      }

      case "marquerPayee": {
        const result = await marquerEcheancePayee(parsed.data.echeanceId, parsed.data.paiementId);
        return Response.json(result);
      }
    }
  } catch (e) {
    return erreurJson("ERREUR_SERVEUR", undefined, {
      detail: e instanceof Error ? e.message : undefined,
    });
  }
}
