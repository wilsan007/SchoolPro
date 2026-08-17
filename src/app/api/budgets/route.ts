import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const BudgetSchema = z.object({
  annee: z.string().min(1),
  categorie: z.enum([
    "FONCTIONNEMENT",
    "PEDAGOGIE",
    "MAINTENANCE",
    "SALAIRES",
    "TRANSPORT",
    "CANTINE",
    "EVENEMENTIEL",
    "INVESTISSEMENT",
    "AUTRE",
  ]),
  montantPrevu: z.number().min(0),
  devise: z.string().default("DJF"),
  statut: z.string().default("VALIDE"),
  description: z.string().optional().nullable(),
  siteId: z.string().optional().nullable(),
});

/** Rôles autorisés à créer un budget. */
const BUDGET_CREATE_ROLES = new Set(["TENANT_ADMIN", "PRINCIPAL", "SUPER_ADMIN"]);

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "finance:read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const annee = searchParams.get("annee");
  const categorie = searchParams.get("categorie");
  const requestedSiteId = searchParams.get("siteId");

  const sessionSiteId =
    (session.user as { siteId?: string | null }).siteId ?? null;
  let activeSiteId: string | null = sessionSiteId;
  if (requestedSiteId === "all") activeSiteId = null;
  else if (requestedSiteId) activeSiteId = requestedSiteId;

  const claims = { ...session.user, siteId: activeSiteId };

  const siteFilter = siteFilterForModel("budget", claims);

  const budgets = await prisma.budget.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilter,
      ...(annee ? { annee } : {}),
      ...(categorie ? { categorie: categorie as any } : {}),
    },
    include: {
      depenses: {
        where: siteFilterForModel("depense", claims),
        orderBy: { date: "desc" },
      },
      site: { select: { nom: true } },
    },
    orderBy: [{ annee: "desc" }, { categorie: "asc" }],
  });

  return NextResponse.json({ budgets });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "finance:write");
  if (denied) return denied;

  // Restriction de rôle : seuls TENANT_ADMIN, PRINCIPAL et SUPER_ADMIN
  // peuvent créer un budget.
  if (!BUDGET_CREATE_ROLES.has(session.user.role)) {
    return NextResponse.json(
      { error: "Accès refusé : privilèges insuffisants" },
      { status: 403 }
    );
  }

  try {
    const json = await request.json();
    const data = BudgetSchema.parse(json);

    const siteId = data.siteId ?? (session.user as { siteId?: string | null }).siteId ?? null;

    const budget = await prisma.budget.create({
      data: {
        tenantId: session.user.tenantId,
        siteId: siteId || null,
        annee: data.annee,
        categorie: data.categorie,
        montantPrevu: data.montantPrevu,
        montantDepense: 0,
        devise: data.devise,
        statut: data.statut,
        description: data.description ?? null,
      },
      include: { depenses: true },
    });

    return NextResponse.json(budget, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[Budgets POST] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
