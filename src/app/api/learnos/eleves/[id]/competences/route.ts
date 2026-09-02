import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, eleveScopeFilter, mergeFilters } from "@/lib/site-scope";
import { exigencesAVenirPourEleve } from "@/lib/learnos/planification";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";
import { recalculerProfils, fusionnerProfil } from "@/lib/learnos/profile-recompute";

/**
 * Profil de compétences d'un élève (LEARNOS).
 *
 * Renvoie, par compétence, l'état estimé **et** la fiabilité de cette
 * estimation. Les deux sont transmis séparément : l'interface doit pouvoir
 * dire « nous n'en savons pas assez » plutôt que d'afficher un chiffre
 * auquel personne ne devrait se fier.
 *
 * TIME MACHINE
 * ------------
 * Les profils stockés (`StudentLearningProfile`) sont des états CUMULATIFS
 * (moyenne des 5 preuves de l'année). En démo, afficher l'état final en
 * octobre trahit le bilan de fin d'année. On recale donc les champs
 * temporels (`masteryScore`, `evidenceCount`, `lastEvidenceAt`, `trend`,
 * `masteryStatus`) à partir des preuves filtrées par `occurredAt <= demoDate`.
 * L'horizon démo filtre automatiquement les `LearningEvidence` ; nous
 * récupérons ces preuves filtrées et recalculons l'agrégat ici.
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
  const demoNow = await getDemoNow();

  const [profilsStockes, recommandations, evidencesFiltrees] = await Promise.all([
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
    // Preuves filtrées par l'horizon démo (occurredAt <= demoDate).
    // Utilisées pour recalculer les champs temporels des profils.
    prisma.learningEvidence.findMany({
      where: {
        tenantId,
        eleveId,
        competenceId: { not: null },
        occurredAt: { lte: demoNow },
        ...siteFilterForModel("learningEvidence", session.user),
      },
      select: {
        competenceId: true,
        masterySignal: true,
        occurredAt: true,
      },
    }),
  ]);

  // Recalculer les profils à partir des preuves filtrées par la date simulée.
  const evidencesPourRecalcul = evidencesFiltrees
    .filter((e) => e.competenceId !== null)
    .map((e) => ({ competenceId: e.competenceId!, masterySignal: e.masterySignal, occurredAt: e.occurredAt }));
  const profilsRecalcules = recalculerProfils(evidencesPourRecalcul);
  const profils = profilsStockes.map((p) =>
    fusionnerProfil(p, profilsRecalcules.get(p.competenceId))
  );

  // Ce qui arrive : relie le programme de l'année au profil individuel.
  const aVenir = await exigencesAVenirPourEleve(tenantId, eleveId, session.user);

  return NextResponse.json({ eleve, profils, recommandations, aVenir });
}
