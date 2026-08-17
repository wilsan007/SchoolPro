import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const UpdateSchema = z.object({
  statut: z.string().optional(),
  montantPrevu: z.number().min(0).optional(),
  description: z.string().optional().nullable(),
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
  annee: z.string().optional(),
});

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
  const siteFilter = siteFilterForModel("budget", session.user);

  const budget = await prisma.budget.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter },
    include: {
      depenses: {
        where: siteFilterForModel("depense", session.user),
        orderBy: { date: "desc" },
      },
      site: { select: { nom: true } },
    },
  });

  if (!budget) {
    return NextResponse.json({ error: "Budget introuvable" }, { status: 404 });
  }

  return NextResponse.json(budget);
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
  const siteFilter = siteFilterForModel("budget", session.user);

  try {
    const json = await request.json();
    const data = UpdateSchema.parse(json);

    const existing = await prisma.budget.findFirst({
      where: { id, tenantId: session.user.tenantId, ...siteFilter },
    });
    if (!existing) {
      return NextResponse.json({ error: "Budget introuvable" }, { status: 404 });
    }

    const budget = await prisma.budget.update({
      where: { id },
      data: {
        ...(data.statut !== undefined && { statut: data.statut }),
        ...(data.montantPrevu !== undefined && { montantPrevu: data.montantPrevu }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.devise !== undefined && { devise: data.devise }),
        ...(data.categorie !== undefined && { categorie: data.categorie }),
        ...(data.annee !== undefined && { annee: data.annee }),
      },
      include: { depenses: true },
    });

    return NextResponse.json(budget);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[Budgets PATCH] Erreur:", err);
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
  const siteFilter = siteFilterForModel("budget", session.user);

  const existing = await prisma.budget.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter },
    include: { _count: { select: { depenses: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Budget introuvable" }, { status: 404 });
  }

  // Refuser la suppression si des dépenses sont rattachées.
  if (existing._count.depenses > 0) {
    return NextResponse.json(
      {
        error: `Impossible de supprimer ce budget : ${existing._count.depenses} dépense(s) y sont rattachées. Supprimez d'abord les dépenses.`,
      },
      { status: 409 }
    );
  }

  await prisma.budget.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
