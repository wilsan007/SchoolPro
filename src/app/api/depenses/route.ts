import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const DepenseSchema = z.object({
  budgetId: z.string().optional().nullable(),
  date: z.string().datetime(),
  montant: z.number().min(0),
  devise: z.string().default("DJF"),
  categorie: z
    .enum([
      "FONCTIONNEMENT",
      "PEDAGOGIE",
      "MAINTENANCE",
      "SALAIRES",
      "TRANSPORT",
      "CANTINE",
      "EVENEMENTIEL",
      "INVESTISSEMENT",
      "AUTRE",
    ])
    .default("AUTRE"),
  libelle: z.string().min(1),
  description: z.string().optional().nullable(),
  methodePaiement: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  justificatifUrl: z.string().optional().nullable(),
  siteId: z.string().optional().nullable(),
  // ── Traçabilité de l'engagement de dépense ──
  /// Personne qui a autorisé l'engagement
  autoriseParId: z.string().optional().nullable(),
  /// Personne qui a effectué le paiement
  payeParId: z.string().optional().nullable(),
  /// Type d'engagement auprès du fournisseur
  typeEngagement: z
    .enum(["bon_commande", "facture_fournisseur", "achat_direct", "contrat", "autre"])
    .optional()
    .nullable(),
  /// Nom du fournisseur / prestataire
  fournisseur: z.string().optional().nullable(),
  /// Contact du fournisseur (téléphone, email, adresse)
  fournisseurContact: z.string().optional().nullable(),
});

/**
 * Recalcule le montant dépensé d'un budget à partir de la somme de ses
 * dépenses, met à jour le statut (DEPASSE si montantDepense > montantPrevu)
 * et notifie les administrateurs si le budget est dépassé.
 *
 * Les notifications ne doivent JAMAIS bloquer l'action principale.
 */
async function recalculateBudget(
  budgetId: string,
  tenantId: string,
  sessionUserId: string,
  claims: Record<string, unknown>
): Promise<void> {
  const result = await prisma.depense.aggregate({
    where: { budgetId, tenantId, ...siteFilterForModel("depense", claims) },
    _sum: { montant: true },
  });
  const montantDepense = result._sum.montant ?? 0;

  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, tenantId, ...siteFilterForModel("budget", claims) },
    select: { montantPrevu: true, statut: true },
  });
  if (!budget) return;

  const isDepasse = montantDepense > budget.montantPrevu;
  const newStatut = isDepasse ? "DEPASSE" : budget.statut === "DEPASSE" ? "VALIDE" : budget.statut;

  await prisma.budget.update({
    where: { id: budgetId },
    data: { montantDepense, statut: newStatut },
  });

  // Notifier les administrateurs si le budget vient de passer en DEPASSE.
  if (isDepasse && budget.statut !== "DEPASSE") {
    try {
      await prisma.notification.create({
        data: {
          tenantId,
          titre: "Budget dépassé",
          contenu: `Le budget a dépassé le montant prévu. Montant prévu : ${budget.montantPrevu}, montant dépensé : ${montantDepense}.`,
          canal: "IN_APP",
          cible: "TOUS",
          envoyeParId: sessionUserId,
          nbDestinataires: 1,
          nbDelivres: 1,
          statut: "ENVOYEE",
          envoyeeAt: new Date(),
        },
      });
    } catch (notifErr) {
      console.error("[Depenses] Notification budget dépassé échouée:", notifErr);
    }
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "finance:read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const budgetId = searchParams.get("budgetId");
  const requestedSiteId = searchParams.get("siteId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const sessionSiteId =
    (session.user as { siteId?: string | null }).siteId ?? null;
  let activeSiteId: string | null = sessionSiteId;
  if (requestedSiteId === "all") activeSiteId = null;
  else if (requestedSiteId) activeSiteId = requestedSiteId;

  const claims = { ...session.user, siteId: activeSiteId };

  const siteFilter = siteFilterForModel("depense", claims);

  const depenses = await prisma.depense.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilter,
      ...(budgetId ? { budgetId } : {}),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    },
    include: {
      budget: { select: { annee: true, categorie: true } },
      site: { select: { nom: true } },
      enregistrePar: { select: { id: true, name: true } },
      autorisePar: { select: { id: true, name: true } },
      payePar: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json({ depenses });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "finance:write");
  if (denied) return denied;

  try {
    const json = await request.json();
    const data = DepenseSchema.parse(json);

    const siteId =
      data.siteId ?? (session.user as { siteId?: string | null }).siteId ?? null;

    // Vérifier que le budget appartient au tenant si fourni.
    if (data.budgetId) {
      const budget = await prisma.budget.findFirst({
        where: {
          id: data.budgetId,
          tenantId: session.user.tenantId,
          ...siteFilterForModel("budget", session.user),
        },
      });
      if (!budget) {
        return NextResponse.json(
          { error: "Budget introuvable" },
          { status: 404 }
        );
      }
    }

    const depense = await prisma.depense.create({
      data: {
        tenantId: session.user.tenantId,
        siteId: siteId || null,
        budgetId: data.budgetId ?? null,
        date: new Date(data.date),
        montant: data.montant,
        devise: data.devise,
        categorie: data.categorie,
        libelle: data.libelle,
        description: data.description ?? null,
        methodePaiement: data.methodePaiement ?? null,
        reference: data.reference ?? null,
        justificatifUrl: data.justificatifUrl ?? null,
        enregistreParId: session.user.id,
        // Traçabilité de l'engagement
        autoriseParId: data.autoriseParId ?? null,
        payeParId: data.payeParId ?? null,
        typeEngagement: data.typeEngagement ?? null,
        fournisseur: data.fournisseur ?? null,
        fournisseurContact: data.fournisseurContact ?? null,
      },
    });

    // Recalculer le budget parent si la dépense est rattachée.
    if (data.budgetId) {
      await recalculateBudget(
        data.budgetId,
        session.user.tenantId,
        session.user.id,
        session.user
      );
    }

    return NextResponse.json(depense, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[Depenses POST] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
