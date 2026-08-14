import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { siteFilterForModel, siteFilterForRelation } from "@/lib/site-scope";

/**
 * Couverture de la banque de questions par compétence et par palier.
 *
 * Répond à la question « où le dispositif est-il aveugle ? » : pour chaque
 * compétence du curriculum, compte combien de questions existent à chaque
 * palier. Les couples compétence × palier sans aucune question sont les
 * trous — ce sont eux qui empêchent l'adaptation de fonctionner.
 *
 * Ouvert aux adultes (enseignants, direction) : c'est un tableau de bord de
 * couverture, pas une donnée élève. `entrainement:read` suffit — il est ouvert
 * à tous les rôles pédagogiques et à la direction.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const { searchParams } = new URL(req.url);
  const matiereId = searchParams.get("matiereId");
  const niveau = searchParams.get("niveau");

  // Chapitres du tenant, filtrés par matière/niveau si demandé.
  const chapitres = await prisma.chapitre.findMany({
    where: {
      tenantId,
      ...(matiereId ? { matiereId } : {}),
      ...(niveau ? { niveau } : {}),
      ...siteFilterForRelation(session.user, "competences"),
    },
    select: {
      id: true,
      nom: true,
      niveau: true,
      matiere: { select: { id: true, nom: true } },
      competences: {
        select: {
          id: true,
          code: true,
          libelle: true,
          ordre: true,
        },
        orderBy: { ordre: "asc" },
      },
    },
    orderBy: [{ niveau: "asc" }, { ordre: "asc" }],
  });

  const competenceIds = chapitres.flatMap((c) => c.competences.map((cp) => cp.id));
  if (competenceIds.length === 0) {
    return NextResponse.json({ matieres: [], totalTrous: 0 });
  }

  // Comage des questions actives par compétence × palier.
  const questions = await prisma.question.groupBy({
    by: ["competenceId", "palier"],
    where: {
      tenantId,
      actif: true,
      competenceId: { in: competenceIds },
      ...siteFilterForModel("question", session.user),
    },
    _count: { _all: true },
  });

  // Index : competenceId → palier → count
  const comptes = new Map<string, Map<string, number>>();
  for (const q of questions) {
    let parPalier = comptes.get(q.competenceId);
    if (!parPalier) {
      parPalier = new Map();
      comptes.set(q.competenceId, parPalier);
    }
    parPalier.set(q.palier, q._count._all);
  }

  const PALIERS = ["RESTITUTION", "APPLICATION", "CONSOLIDATION", "TRANSFERT", "OUVERTURE"] as const;

  // Assemblage par matière → chapitre → compétence → paliers
  const matieresMap = new Map<string, { id: string; nom: string; chapitres: unknown[] }>();
  let totalTrous = 0;

  for (const chapitre of chapitres) {
    const matiere = chapitre.matiere;
    let matiereEntry = matieresMap.get(matiere.id);
    if (!matiereEntry) {
      matiereEntry = { id: matiere.id, nom: matiere.nom, chapitres: [] };
      matieresMap.set(matiere.id, matiereEntry);
    }

    const competencesAvecCouverture = chapitre.competences.map((comp) => {
      const parPalier = comptes.get(comp.id);
      const paliers = PALIERS.map((palier) => {
        const count = parPalier?.get(palier) ?? 0;
        if (count === 0) totalTrous++;
        return { palier, count };
      });
      const total = paliers.reduce((s, p) => s + p.count, 0);
      return {
        id: comp.id,
        code: comp.code,
        libelle: comp.libelle,
        total,
        paliers,
      };
    });

    matiereEntry.chapitres.push({
      id: chapitre.id,
      nom: chapitre.nom,
      niveau: chapitre.niveau,
      competences: competencesAvecCouverture,
    });
  }

  return NextResponse.json({
    matieres: [...matieresMap.values()],
    totalTrous,
    paliers: PALIERS,
  });
}
