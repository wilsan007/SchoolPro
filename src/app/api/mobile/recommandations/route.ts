import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { siteFilterForModel } from "@/lib/site-scope";
import { anneeActiveId } from "@/lib/annee-scolaire";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

/**
 * Recommandations LEARNOS accessibles depuis l'app mobile.
 *
 * GET /api/mobile/recommandations?classeId=...
 *
 * Respecte le scope enseignant et l'isolation site.
 */
export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const classeId = searchParams.get("classeId");
  const anneeId = await anneeActiveId(user.tenantId);

  // Scope enseignant
  const teacherScope = isTeacherRole(user.role as Role)
    ? await getTeacherScope(user.tenantId, user.id, user.role as Role)
    : null;

  const recommandations = await prisma.recommandation.findMany({
    where: {
      tenantId: user.tenantId,
      ...siteFilterForModel("recommandation", user),
      ...(teacherScope?.isRestricted
        ? {
            eleve: {
              classe: {
                id: teacherScope.classeIds.length > 0
                  ? { in: teacherScope.classeIds }
                  : { equals: "__none__" as const },
                ...(anneeId ? { anneeId } : {}),
              },
            },
          }
        : classeId
            ? { eleve: { classe: { id: classeId, ...(anneeId ? { anneeId } : {}) } } }
            : {}),
    },
    select: {
      id: true,
      niveau: true,
      statut: true,
      motif: true,
      actionProposee: true,
      regleDeclenchee: true,
      competence: {
        select: {
          id: true,
          code: true,
          chapitre: { select: { id: true, nom: true, matiere: { select: { nom: true } } } },
        },
      },
      eleve: { select: { id: true, nom: true, prenom: true } },
      createdAt: true,
    },
    orderBy: [{ niveau: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  return NextResponse.json({ recommandations });
}
