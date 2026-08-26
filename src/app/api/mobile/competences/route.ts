import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { eleveScopeFilter, siteFilterForModel } from "@/lib/site-filter";
import { anneeActiveId } from "@/lib/annee-scolaire";

/**
 * Compétences et niveaux de maîtrise accessibles depuis l'app mobile.
 *
 * GET /api/mobile/competences?eleveId=...  → compétences d'un élève
 * GET /api/mobile/competences?classeId=... → compétences d'une classe (agrégé)
 *
 * Respecte le scope parent/élève et l'isolation site.
 */
export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const eleveId = searchParams.get("eleveId");
  const classeId = searchParams.get("classeId");
  const anneeId = await anneeActiveId(user.tenantId);

  if (eleveId) {
    // Niveaux de maîtrise pour un élève spécifique
    const scopeFilter = eleveScopeFilter(user, "eleve");
    const evidences = await prisma.learningEvidence.findMany({
      where: {
        tenantId: user.tenantId,
        eleveId,
        ...scopeFilter,
      },
      select: {
        id: true,
        evidenceType: true,
        rawScore: true,
        maxScore: true,
        masterySignal: true,
        confidence: true,
        occurredAt: true,
        sourceType: true,
        competence: {
          select: {
            id: true,
            code: true,
            chapitre: {
              select: {
                id: true,
                nom: true,
                matiere: { select: { id: true, nom: true, code: true } },
              },
            },
          },
        },
      },
      orderBy: { occurredAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ evidences });
  }

  if (classeId) {
    // Compétences travaillées dans une classe (via les planifications de chapitre)
    const competences = await prisma.competence.findMany({
      where: {
        tenantId: user.tenantId,
        chapitre: {
          planifications: {
            some: { classeId, ...(anneeId ? { anneeId } : {}) },
          },
        },
        ...siteFilterForModel("competence", user),
      },
      select: {
        id: true,
        code: true,
        ordre: true,
        chapitre: {
          select: {
            id: true,
            nom: true,
            ordre: true,
            matiere: { select: { id: true, nom: true, code: true, couleur: true } },
          },
        },
      },
      orderBy: [{ chapitre: { ordre: "asc" } }, { ordre: "asc" }],
      take: 200,
    });

    return NextResponse.json({ competences });
  }

  return NextResponse.json({ error: "eleveId ou classeId requis" }, { status: 400 });
}
