import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

// ============================================================
// Schémas de validation
// ============================================================

const DeclareRemiseSchema = z.object({
  /// Montant déclaré par le caissier
  montantDeclare: z.number().min(0, "Le montant doit être positif"),
  /// Date à laquelle le caissier déclare avoir remis la caisse
  dateRemise: z.string().datetime(),
  /// Période couverte par la remise (dates de début et fin des recettes)
  periodeDebut: z.string().datetime(),
  periodeFin: z.string().datetime(),
  /// Devise des montants
  devise: z.string().default("DJF"),
  /// Site (null = remise globale tous sites)
  siteId: z.string().optional().nullable(),
});

// ============================================================
// GET /api/remises-caisse — liste des remises de caisse
// ============================================================
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "finance:read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const statut = searchParams.get("statut");
  const requestedSiteId = searchParams.get("siteId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const sessionSiteId =
    (session.user as { siteId?: string | null }).siteId ?? null;
  let activeSiteId: string | null = sessionSiteId;
  if (requestedSiteId === "all") activeSiteId = null;
  else if (requestedSiteId) activeSiteId = requestedSiteId;

  const claims = { ...session.user, siteId: activeSiteId };
  const siteFilter = siteFilterForModel("remiseCaisse", claims);

  const remises = await prisma.remiseCaisse.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilter,
      ...(statut ? { statut: statut as never } : {}),
      ...(dateFrom || dateTo
        ? {
            dateRemise: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    },
    include: {
      caissier: { select: { id: true, name: true } },
      receveur: { select: { id: true, name: true } },
      site: { select: { id: true, nom: true } },
    },
    orderBy: { dateRemise: "desc" },
  });

  return NextResponse.json({ remises });
}

// ============================================================
// POST /api/remises-caisse — déclarer une remise de caisse (caissier)
// ============================================================
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "finance:write");
  if (denied) return denied;

  try {
    const json = await request.json();
    const data = DeclareRemiseSchema.parse(json);

    const siteId =
      data.siteId ?? (session.user as { siteId?: string | null }).siteId ?? null;

    // La date de saisie de la déclaration est automatique (jour de la saisie).
    // La dateRemise est fournie par le caissier (jour de la remise).
    const remise = await prisma.remiseCaisse.create({
      data: {
        tenantId: session.user.tenantId,
        siteId: siteId || null,
        caissierId: session.user.id,
        montantDeclare: data.montantDeclare,
        dateRemise: new Date(data.dateRemise),
        // dateSaisieRemise est automatique (@default(now()))
        periodeDebut: new Date(data.periodeDebut),
        periodeFin: new Date(data.periodeFin),
        devise: data.devise,
        statut: "EN_ATTENTE",
      },
      include: {
        caissier: { select: { id: true, name: true } },
        site: { select: { id: true, nom: true } },
      },
    });

    return NextResponse.json(remise, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[RemisesCaisse POST] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
