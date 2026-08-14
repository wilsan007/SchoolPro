import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForRelation, siteFilterForModel } from "@/lib/site-filter";

// GET — liste des enseignants avec fiche RH
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "rh:read");
  if (denied) return denied;

  const siteFilter = siteFilterForRelation(session.user, "user");

  const enseignants = await prisma.enseignant.findMany({
    where: { tenantId: session.user.tenantId, ...siteFilter },
    include: {
      user: {
        select: {
          id: true, name: true, email: true, avatarUrl: true,
          phone: true, isActive: true, lastLoginAt: true,
        },
      },
      ficheRH: {
        include: {
          bulletinsPaie: {
            where: siteFilterForModel("bulletinPaie", session.user),
            orderBy: [{ annee: "desc" }, { mois: "desc" }],
            take: 3,
          },
        },
      },
      emploiTemps: {
        where: siteFilterForModel("emploiTemps", session.user),
        select: {
          jour: true, heureDebut: true, heureFin: true,
          matiere: { select: { nom: true, couleur: true } },
          classe: { select: { nom: true } },
        },
      },
      classesPrincipales: {
        where: siteFilterForModel("classe", session.user),
        select: { id: true, nom: true, niveau: true },
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  return NextResponse.json({ enseignants });
}
