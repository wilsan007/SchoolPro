import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const UpdateSchema = z.object({
  budgetId: z.string().optional().nullable(),
  date: z.string().datetime().optional(),
  montant: z.number().min(0).optional(),
  devise: z.string().optional(),
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
    .optional(),
  libelle: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  methodePaiement: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  justificatifUrl: z.string().optional().nullable(),
  // Traçabilité de l'engagement
  autoriseParId: z.string().optional().nullable(),
  payeParId: z.string().optional().nullable(),
  typeEngagement: z
    .enum(["bon_commande", "facture_fournisseur", "achat_direct", "contrat", "autre"])
    .optional()
    .nullable(),
  fournisseur: z.string().optional().nullable(),
  fournisseurContact: z.string().optional().nullable(),
});

/**
 * Recalcule le montant dépensé d'un budget et met à jour le statut.
 */
async function recalculateBudget(
  budgetId: string,
  tenantId: string,
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
  const newStatut = isDepasse
    ? "DEPASSE"
    : budget.statut === "DEPASSE"
      ? "VALIDE"
      : budget.statut;

  await prisma.budget.update({
    where: { id: budgetId },
    data: { montantDepense, statut: newStatut },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "finance:read");
  if (denied) return denied;

  const { id } = await params;
  const siteFilter = siteFilterForModel("depense", session.user);

  const depense = await prisma.depense.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter },
    include: {
      budget: { select: { annee: true, categorie: true } },
      site: { select: { nom: true } },
      enregistrePar: { select: { id: true, name: true } },
      autorisePar: { select: { id: true, name: true } },
      payePar: { select: { id: true, name: true } },
    },
  });

  if (!depense) {
    return NextResponse.json({ error: "Dépense introuvable" }, { status: 404 });
  }

  return NextResponse.json(depense);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "finance:write");
  if (denied) return denied;

  const { id } = await params;
  const siteFilter = siteFilterForModel("depense", session.user);

  try {
    const json = await request.json();
    const data = UpdateSchema.parse(json);

    const existing = await prisma.depense.findFirst({
      where: { id, tenantId: session.user.tenantId, ...siteFilter },
    });
    if (!existing) {
      return NextResponse.json({ error: "Dépense introuvable" }, { status: 404 });
    }

    // Mémoriser l'ancien budgetId pour recalculer les deux budgets si nécessaire.
    const oldBudgetId = existing.budgetId;

    // Vérifier le nouveau budget si fourni.
    if (data.budgetId !== undefined && data.budgetId) {
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

    const depense = await prisma.depense.update({
      where: { id },
      data: {
        ...(data.budgetId !== undefined && { budgetId: data.budgetId }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
        ...(data.montant !== undefined && { montant: data.montant }),
        ...(data.devise !== undefined && { devise: data.devise }),
        ...(data.categorie !== undefined && { categorie: data.categorie }),
        ...(data.libelle !== undefined && { libelle: data.libelle }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.methodePaiement !== undefined && { methodePaiement: data.methodePaiement }),
        ...(data.reference !== undefined && { reference: data.reference }),
        ...(data.justificatifUrl !== undefined && { justificatifUrl: data.justificatifUrl }),
        ...(data.autoriseParId !== undefined && { autoriseParId: data.autoriseParId }),
        ...(data.payeParId !== undefined && { payeParId: data.payeParId }),
        ...(data.typeEngagement !== undefined && { typeEngagement: data.typeEngagement }),
        ...(data.fournisseur !== undefined && { fournisseur: data.fournisseur }),
        ...(data.fournisseurContact !== undefined && { fournisseurContact: data.fournisseurContact }),
      },
    });

    // Recalculer le budget concerné (nouveau et/ou ancien).
    const budgetsToRecalc = new Set<string>();
    if (depense.budgetId) budgetsToRecalc.add(depense.budgetId);
    if (oldBudgetId && oldBudgetId !== depense.budgetId) {
      budgetsToRecalc.add(oldBudgetId);
    }
    for (const bid of budgetsToRecalc) {
      await recalculateBudget(bid, session.user.tenantId, session.user);
    }

    return NextResponse.json(depense);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[Depenses PATCH] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "finance:delete");
  if (denied) return denied;

  const { id } = await params;
  const siteFilter = siteFilterForModel("depense", session.user);

  const existing = await prisma.depense.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter },
  });
  if (!existing) {
    return NextResponse.json({ error: "Dépense introuvable" }, { status: 404 });
  }

  const budgetId = existing.budgetId;

  await prisma.depense.delete({ where: { id } });

  // Recalculer le budget parent.
  if (budgetId) {
    await recalculateBudget(budgetId, session.user.tenantId, session.user);
  }

  return NextResponse.json({ ok: true });
}
