import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { creerEcheancier, getEcheancierPourFacture } from "@/lib/echeancier";

const QuerySchema = z.object({
  factureId: z.string().min(1),
});

const BodySchema = z.object({
  factureId: z.string().min(1),
  nbEcheances: z.coerce.number().int().min(1),
  datePremiereEcheance: z.string(),
  intervalleJours: z.coerce.number().int().min(1).optional(),
  montants: z.array(z.coerce.number().min(0)).optional(),
});

/**
 * GET /api/facturation/echeancier?factureId=xxx
 * Récupère l'échéancier d'une facture.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "finance:read");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({ factureId: searchParams.get("factureId") });
  if (!parsed.success) return erreurJson("DONNEES_INVALIDES");
  const { factureId } = parsed.data;

  // Vérifier que la facture appartient au tenant
  // eslint-disable-next-line ecolpro/require-site-filter -- filtré par tenantId
  const facture = await prisma.facture.findFirst({
    where: { id: factureId, tenantId: session.user.tenantId },
  });
  if (!facture) return erreurJson("FACTURE_INTROUVABLE");

  const echeancier = await getEcheancierPourFacture(factureId);
  return Response.json({ echeancier });
}

/**
 * POST /api/facturation/echeancier
 * Crée un échéancier pour une facture.
 * Body: { factureId, nbEcheances, datePremiereEcheance, intervalleJours?, montants? }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "finance:write");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES");
  }
  const data = parsed.data;

  // Vérifier que la facture appartient au tenant
  // eslint-disable-next-line ecolpro/require-site-filter -- filtré par tenantId
  const facture = await prisma.facture.findFirst({
    where: { id: data.factureId, tenantId: session.user.tenantId },
  });
  if (!facture) return erreurJson("FACTURE_INTROUVABLE");

  // Vérifier qu'il n'y a pas déjà un échéancier actif
  const existant = await prisma.echeancier.findFirst({
    where: { factureId: data.factureId, statut: "ACTIF" },
  });
  if (existant) {
    return erreurJson("SLUG_DEJA_UTILISE", undefined, {
      detail: "Un échéancier actif existe déjà pour cette facture",
    });
  }

  try {
    const echeancier = await creerEcheancier(
      data.factureId,
      data.nbEcheances,
      new Date(data.datePremiereEcheance),
      data.intervalleJours ?? 30,
      data.montants
    );
    return Response.json(echeancier, { status: 201 });
  } catch (e) {
    return erreurJson("ERREUR_SERVEUR", undefined, {
      detail: e instanceof Error ? e.message : undefined,
    });
  }
}
