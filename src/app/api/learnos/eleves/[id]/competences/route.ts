import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, eleveScopeFilter, mergeFilters } from "@/lib/site-scope";
import { exigencesAVenirPourEleve } from "@/lib/learnos/planification";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/**
 * Profil de compétences d'un élève (LEARNOS).
 *
 * Renvoie, par compétence, l'état estimé **et** la fiabilité de cette
 * estimation. Les deux sont transmis séparément : l'interface doit pouvoir
 * dire « nous n'en savons pas assez » plutôt que d'afficher un chiffre
 * auquel personne ne devrait se fier.
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

  const { id: eleveId } = await params;
  const tenantId = session.user.tenantId;

  // Double contrôle : périmètre de site ET périmètre personnel — un parent ne
  // doit voir que ses enfants, un élève que son propre dossier.
  const eleve = await prisma.eleve.findFirst({
    where: mergeFilters(
      { id: eleveId, tenantId },
      siteFilterForModel("eleve", session.user),
      eleveScopeFilter(session.user, null)
    ),
    select: { id: true, nom: true, prenom: true },
  });
  if (!eleve) {
    return erreurJson("ELEVE_INTROUVABLE");
  }

  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  const [profils, recommandations] = await Promise.all([
    prisma.studentLearningProfile.findMany({
      where: {
        tenantId,
        eleveId,
        ...siteFilterForModel("studentLearningProfile", session.user),
      },
      select: {
        competenceId: true,
        masteryScore: true,
        confidenceScore: true,
        masteryStatus: true,
        evidenceCount: true,
        lastEvidenceAt: true,
        trend: true,
        prerequisiteStatus: true,
        competence: {
          select: {
            code: true,
            libelle: true,
            chapitre: {
              select: {
                nom: true,
                niveau: true,
                matiere: { select: { id: true, nom: true, couleur: true } },
              },
            },
          },
        },
      },
    }),
    prisma.recommandation.findMany({
      where: {
        tenantId,
        eleveId,
        resolueLe: null,
        ...siteFilterForModel("recommandation", session.user),
        ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
      },
      select: {
        id: true,
        competenceId: true,
        niveau: true,
        statut: true,
        motif: true,
        actionProposee: true,
        regleDeclenchee: true,
        motifParams: true,
        competencesBloquees: true,
      },
    }),
  ]);

  // Ce qui arrive : relie le programme de l'année au profil individuel.
  const aVenir = await exigencesAVenirPourEleve(tenantId, eleveId, session.user);

  return NextResponse.json({ eleve, profils, recommandations, aVenir });
}
