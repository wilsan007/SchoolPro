import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import {
  siteFilterForModel,
  personalScopeFilter,
  mergeFilters,
} from "@/lib/site-scope";
import { erreurJson } from "@/lib/erreurs-api";

/**
 * Dossier de Progression Continue (DPC) — vue longitudinale par élève.
 *
 * Contrairement au conseil augmenté (snapshot par période) ou au dossier
 * parent (récit court), le DPC est la trace pédagogique complète de l'élève,
 * vue par l'équipe éducative :
 *  - progression des compétences (StudentLearningProfile) ;
 *  - trail de preuves (LearningEvidence) ;
 *  - interventions pédagogiques et leurs résultats ;
 *  - plans de progression et leur avancement ;
 *  - prédictions de difficulté et leur vérification ;
 *  - recommandations, y compris résolues ;
 *  - journal d'apprentissage (analyses portant sur cet élève).
 *
 * `eleves:read` ouvre cette route au personnel éducatif ; `personalScopeFilter`
 * borne PARENT et STUDENT à leur propre périmètre relationnel.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "eleves:read");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const eleveId = searchParams.get("eleveId");
  if (!eleveId) return erreurJson("DONNEES_INVALIDES");

  const tenantId = session.user.tenantId;
  const user = session.user;

  // Vérifier que l'élève existe dans le tenant et le périmètre de l'appelant.
  // `personalScopeFilter` borne PARENT/STUDENT à leur enfant / eux-mêmes ;
  // `siteFilterForModel` borne le personnel au site de l'élève.
  const eleve = await prisma.eleve.findFirst({
    where: {
      id: eleveId,
      tenantId,
      ...mergeFilters(
        siteFilterForModel("eleve", user),
        personalScopeFilter(user, null)
      ),
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      matricule: true,
      classe: { select: { id: true, nom: true, niveau: true } },
    },
  });
  if (!eleve) return erreurJson("ELEVE_INTROUVABLE");

  const baseFilter = {
    tenantId,
    eleveId,
    ...siteFilterForModel("eleve", user),
  };

  const [
    profils,
    evidences,
    interventions,
    plans,
    predictions,
    recommandations,
    journal,
  ] = await Promise.all([
    // 1. Profils d'apprentissage par compétence
    prisma.studentLearningProfile.findMany({
      where: baseFilter,
      select: {
        competenceId: true,
        masteryScore: true,
        confidenceScore: true,
        masteryStatus: true,
        trend: true,
        evidenceCount: true,
        lastEvidenceAt: true,
        competence: {
          select: {
            id: true,
            code: true,
            libelle: true,
            chapitre: { select: { id: true, nom: true, matiere: { select: { id: true, nom: true, code: true } } } },
          },
        },
      },
      orderBy: { masteryScore: "asc" },
    }),

    // 2. Trail de preuves — les plus récentes d'abord
    prisma.learningEvidence.findMany({
      where: baseFilter,
      select: {
        id: true,
        sourceType: true,
        evidenceType: true,
        rawScore: true,
        maxScore: true,
        masterySignal: true,
        confidence: true,
        weight: true,
        occurredAt: true,
        competence: { select: { id: true, code: true, libelle: true } },
        matiere: { select: { id: true, nom: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),

    // 3. Interventions pédagogiques — toutes, avec résultats
    prisma.studentIntervention.findMany({
      where: baseFilter,
      select: {
        id: true,
        reason: true,
        interventionType: true,
        recommendedAction: true,
        status: true,
        startDate: true,
        reviewDate: true,
        outcome: true,
        masteryBefore: true,
        masteryAfter: true,
        approvedBy: true,
        approvedAt: true,
        competence: { select: { id: true, code: true, libelle: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // 4. Plans de progression — tous, avec étapes
    prisma.planProgression.findMany({
      where: baseFilter,
      select: {
        id: true,
        type: true,
        origine: true,
        statut: true,
        motif: true,
        regleDeclenchee: true,
        motifParams: true,
        dateDebut: true,
        dateRevue: true,
        dateFin: true,
        valideParId: true,
        valideLe: true,
        matiere: { select: { id: true, nom: true } },
        etapes: {
          orderBy: { ordre: "asc" },
          select: {
            id: true,
            action: true,
            responsable: true,
            statut: true,
            echeance: true,
            competence: { select: { id: true, libelle: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),

    // 5. Prédictions de difficulté — toutes, avec vérification
    prisma.predictionDifficulte.findMany({
      where: baseFilter,
      select: {
        id: true,
        probaReussite: true,
        difficultePredite: true,
        masteryAvant: true,
        prerequisManquants: true,
        masteryApres: true,
        predictionCorrecte: true,
        ecart: true,
        emiseLe: true,
        verifieeLe: true,
        competence: { select: { id: true, code: true, libelle: true } },
        chapitre: { select: { id: true, nom: true } },
      },
      orderBy: { emiseLe: "desc" },
    }),

    // 6. Recommandations — y compris résolues (historique complet)
    prisma.recommandation.findMany({
      where: baseFilter,
      select: {
        id: true,
        niveau: true,
        statut: true,
        motif: true,
        actionProposee: true,
        regleDeclenchee: true,
        competencesBloquees: true,
        decideParId: true,
        decideeLe: true,
        resolueLe: true,
        createdAt: true,
        competence: { select: { id: true, code: true, libelle: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // 7. Journal d'apprentissage — analyses portant sur cet élève
    // Le journal est au niveau tenant (pas d'eleveId direct), on filtre par
    // périmètre. C'est l'audit de ce que le système a appris sur cet élève.
    prisma.journalApprentissage.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("journalApprentissage", user),
        // Le périmètre est encodé dans `perimetre` (texte libre). On filtre
        // grossièrement par mention de l'élève — c'est un best-effort, pas
        // une garantie d'exhaustivité.
        perimetre: { contains: eleveId },
      },
      select: {
        id: true,
        typeAnalyse: true,
        resume: true,
        echantillon: true,
        perimetre: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  // ── Synthèse ────────────────────────────────────────────────────
  const synthese = {
    totalCompetences: profils.length,
    maitrisees: profils.filter((p) => p.masteryStatus === "MASTERED" || p.masteryStatus === "PROFICIENT").length,
    fragiles: profils.filter((p) => p.masteryStatus === "DEVELOPING" || p.masteryStatus === "EMERGING").length,
    critiques: profils.filter((p) => p.masteryStatus === "NEEDS_REVIEW").length,
    inconnues: profils.filter((p) => p.masteryStatus === "UNKNOWN").length,
    totalEvidences: evidences.length,
    interventionsActives: interventions.filter((i) => ["PROPOSED", "APPROVED", "ACTIVE", "UNDER_REVIEW"].includes(i.status)).length,
    interventionsTerminees: interventions.filter((i) => i.status === "COMPLETED").length,
    plansActifs: plans.filter((p) => ["ACTIF", "EN_REVUE", "PROPOSE"].includes(p.statut)).length,
    plansTermines: plans.filter((p) => p.statut === "TERMINE").length,
    predictionsEnCours: predictions.filter((p) => !p.verifieeLe).length,
    predictionsVerifiees: predictions.filter((p) => p.verifieeLe).length,
    predictionsCorrectes: predictions.filter((p) => p.predictionCorrecte === true).length,
    recosActives: recommandations.filter((r) => r.statut !== "ECARTEE" && !r.resolueLe).length,
    recosResolues: recommandations.filter((r) => r.resolueLe).length,
  };

  return NextResponse.json({
    eleve,
    synthese,
    profils,
    evidences,
    interventions,
    plans,
    predictions,
    recommandations,
    journal,
  });
}
