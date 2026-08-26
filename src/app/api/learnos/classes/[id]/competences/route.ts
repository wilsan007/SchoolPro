import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, mergeFilters } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/**
 * Profil de compétences d'une classe entière (LEARNOS).
 *
 * Renvoie la matrice complète : toutes les compétences du niveau de la classe,
 * avec pour chacune la répartition des statuts de maîtrise, et pour chaque
 * élève son statut individuel par compétence.
 *
 * Trois usages côté client :
 *  1. Tableau matriciel — lignes = compétences, colonnes = statuts ;
 *  2. Barres empilées — répartition visuelle par compétence ;
 *  3. Heatmap — élève × compétence, couleur = statut.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "eleves:read");
  if (denied) return denied;

  const { id: classeId } = await params;
  const tenantId = session.user.tenantId;

  // Vérifier l'accès à la classe
  const classe = await prisma.classe.findFirst({
    where: mergeFilters(
      { id: classeId, tenantId },
      siteFilterForModel("classe", session.user)
    ),
    select: { id: true, nom: true, niveau: true },
  });
  if (!classe) {
    return erreurJson("CLASSE_INTROUVABLE");
  }

  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  // 1. Élèves actifs de la classe pour l'année courante
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      classeId,
      statut: "ACTIF",
      deletedAt: null,
      ...siteFilterForModel("eleve", session.user),
      ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
    },
    select: { id: true, nom: true, prenom: true },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  if (eleves.length === 0) {
    return NextResponse.json({
      classe: { id: classe.id, nom: classe.nom, niveau: classe.niveau },
      eleves: [],
      competences: [],
      profils: [],
    });
  }

  const eleveIds = eleves.map((e) => e.id);

  // 2. Compétences du niveau de la classe (via chapitres)
  // On récupère les chapitres dont le niveau correspond à celui de la classe,
  // puis les compétences de ces chapitres. On inclut les compétences du
  // référentiel national (tenantId null) ET celles du tenant : un élève
  // suit les deux, et restreindre au seul tenant cacherait le référentiel.
  // La fuite est nulle : les compétences ne contiennent aucune donnée
  // sensible — ce sont des libellés pédagogiques publics.
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- référentiel national + tenant, cf. ci-dessus
  const competences = await prisma.competence.findMany({
    where: {
      chapitre: { niveau: classe.niveau },
      // Compétences du tenant OU du référentiel national (tenantId null)
      OR: [
        { tenantId },
        { tenantId: null },
      ],
    },
    select: {
      id: true,
      code: true,
      libelle: true,
      ordre: true,
      chapitre: {
        select: {
          id: true,
          nom: true,
          niveau: true,
          matiere: { select: { id: true, nom: true, couleur: true } },
        },
      },
    },
    orderBy: [
      { chapitre: { matiere: { nom: "asc" } } },
      { chapitre: { ordre: "asc" } },
      { ordre: "asc" },
    ],
  });

  if (competences.length === 0) {
    return NextResponse.json({
      classe: { id: classe.id, nom: classe.nom, niveau: classe.niveau },
      eleves,
      competences: [],
      profils: [],
    });
  }

  const competenceIds = competences.map((c) => c.id);

  // 3. Tous les profils d'apprentissage pour ces élèves × ces compétences
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      eleveId: { in: eleveIds },
      competenceId: { in: competenceIds },
      ...siteFilterForModel("studentLearningProfile", session.user),
    },
    select: {
      eleveId: true,
      competenceId: true,
      masteryScore: true,
      masteryStatus: true,
      evidenceCount: true,
      trend: true,
    },
  });

  return NextResponse.json({
    classe: { id: classe.id, nom: classe.nom, niveau: classe.niveau },
    eleves,
    competences,
    profils,
  });
}
