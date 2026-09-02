import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { eleveScopeFilter } from "@/lib/site-filter";

const QuerySchema = z.object({
  annee: z.string().optional(),
});

const PostSchema = z.object({
  invitationId: z.string().min(1),
  confirme: z.boolean(),
});

/**
 * Campagnes de réinscription et invitations accessibles depuis l'app mobile.
 *
 * GET /api/mobile/reinscription
 *   → Pour un parent : ses invitations de réinscription en cours.
 *   → Pour un admin : la campagne active avec stats.
 *
 * POST /api/mobile/reinscription
 *   → Confirmation/refus par un parent : { invitationId, confirme }
 */
export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", details: parsed.error.issues }, { status: 400 });
  }
  const { annee } = parsed.data;

  // Parent/Élève : voir ses invitations
  if (user.role === "PARENT" || user.role === "STUDENT") {
    const scopeFilter = eleveScopeFilter(user, "eleve");

    const invitations = await prisma.invitationReinscription.findMany({
      where: {
        tenantId: user.tenantId,
        ...scopeFilter,
        campagne: {
          statut: { in: ["EN_COURS", "PROMOTION", "REINSCRIPTIONS"] },
          ...(annee ? { anneeCible: annee } : {}),
        },
      },
      select: {
        id: true,
        statut: true,
        dateInvitation: true,
        dateReponse: true,
        canal: true,
        decisionPromotion: true,
        eleve: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            classe: { select: { id: true, nom: true, niveau: true } },
          },
        },
        campagne: {
          select: {
            id: true,
            libelle: true,
            anneeSource: true,
            anneeCible: true,
            statut: true,
            dateFin: true,
          },
        },
      },
      orderBy: { dateInvitation: "desc" },
    });

    return NextResponse.json({ invitations });
  }

  // Admin/Direction : voir la campagne active avec stats
  const campagne = await prisma.campagneReinscription.findFirst({
    where: {
      tenantId: user.tenantId,
      statut: { in: ["EN_COURS", "PROMOTION", "REINSCRIPTIONS"] },
      ...(annee ? { anneeCible: annee } : {}),
    },
    orderBy: { dateDebut: "desc" },
    select: {
      id: true,
      libelle: true,
      anneeSource: true,
      anneeCible: true,
      statut: true,
      etapeActuelle: true,
      nbElevesTotal: true,
      nbReinscrits: true,
      nbNonReinscrits: true,
      nbDiplomes: true,
      revenusPrevus: true,
      dateDebut: true,
      dateFin: true,
    },
  });

  if (!campagne) {
    return NextResponse.json({ campagne: null, invitations: [] });
  }

  const invitations = await prisma.invitationReinscription.findMany({
    where: { tenantId: user.tenantId, campagneId: campagne.id },
    select: {
      id: true,
      statut: true,
      dateInvitation: true,
      dateReponse: true,
      eleve: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          classe: { select: { id: true, nom: true, niveau: true } },
        },
      },
    },
    orderBy: { dateInvitation: "desc" },
    take: 100,
  });

  return NextResponse.json({ campagne, invitations });
}

export async function POST(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", details: parsed.error.issues }, { status: 400 });
  }
  const { invitationId, confirme } = parsed.data;

  // Vérifier que l'invitation appartient au scope de l'utilisateur
  const scopeFilter = eleveScopeFilter(user, "eleve");
  const invitation = await prisma.invitationReinscription.findFirst({
    where: { id: invitationId, tenantId: user.tenantId, ...scopeFilter },
    include: { campagne: true },
  });

  if (!invitation) {
    return NextResponse.json({ error: "Invitation introuvable" }, { status: 404 });
  }
  if (invitation.statut !== "INVITE" && invitation.statut !== "SANS_REPONSE") {
    return NextResponse.json({ error: "Vous avez déjà répondu" }, { status: 400 });
  }
  if (invitation.campagne.statut === "TERMINEE" || invitation.campagne.statut === "ANNULEE") {
    return NextResponse.json({ error: "Campagne fermée" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.invitationReinscription.update({
      where: { id: invitationId, tenantId: user.tenantId },
      data: {
        statut: confirme ? "CONFIRME" : "REFUSE",
        dateReponse: new Date(),
      },
    }),
    prisma.eleve.update({
      where: { id: invitation.eleveId, tenantId: user.tenantId },
      data: { statut: confirme ? "REINSCRIT" : "NON_REINSCRIT" },
    }),
  ]);

  // Mettre à jour les compteurs de la campagne
  const stats = await prisma.invitationReinscription.groupBy({
    by: ["statut"],
    where: { campagneId: invitation.campagneId, tenantId: user.tenantId },
    _count: true,
  });

  const nbReinscrits = stats.find((s) => s.statut === "CONFIRME")?._count ?? 0;
  const nbNonReinscrits =
    (stats.find((s) => s.statut === "REFUSE")?._count ?? 0) +
    (stats.find((s) => s.statut === "SANS_REPONSE")?._count ?? 0);

  await prisma.campagneReinscription.update({
    where: { id: invitation.campagneId, tenantId: user.tenantId },
    data: { nbReinscrits, nbNonReinscrits },
  });

  return NextResponse.json({
    success: true,
    statut: confirme ? "CONFIRME" : "REFUSE",
  });
}
