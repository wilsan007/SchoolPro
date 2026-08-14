import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";
import { creerEcheancier, getEcheancierPourFacture } from "@/lib/echeancier";

/**
 * GET /api/facturation/echeancier?factureId=xxx
 * Récupère l'échéancier d'une facture.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const { searchParams } = new URL(req.url);
  const factureId = searchParams.get("factureId");
  if (!factureId) return erreurJson("DONNEES_INVALIDES");

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

  const body = await req.json().catch(() => null);
  if (!body?.factureId || !body.nbEcheances || !body.datePremiereEcheance) {
    return erreurJson("DONNEES_INVALIDES");
  }

  // Vérifier que la facture appartient au tenant
  // eslint-disable-next-line ecolpro/require-site-filter -- filtré par tenantId
  const facture = await prisma.facture.findFirst({
    where: { id: body.factureId, tenantId: session.user.tenantId },
  });
  if (!facture) return erreurJson("FACTURE_INTROUVABLE");

  // Vérifier qu'il n'y a pas déjà un échéancier actif
  const existant = await prisma.echeancier.findFirst({
    where: { factureId: body.factureId, statut: "ACTIF" },
  });
  if (existant) {
    return erreurJson("SLUG_DEJA_UTILISE", undefined, {
      detail: "Un échéancier actif existe déjà pour cette facture",
    });
  }

  try {
    const echeancier = await creerEcheancier(
      body.factureId,
      body.nbEcheances,
      new Date(body.datePremiereEcheance),
      body.intervalleJours ?? 30,
      body.montants
    );
    return Response.json(echeancier, { status: 201 });
  } catch (e) {
    return erreurJson("ERREUR_SERVEUR", undefined, {
      detail: e instanceof Error ? e.message : undefined,
    });
  }
}
