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
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/**
 * Conseil Augmenté — agrégation par élève des signaux pédagogiques,
 * disciplinaires et d'assiduité utiles au conseil de classe.
 *
 * Contrairement à `/api/bulletins/conseil-data` qui ne renvoie que moyenne,
 * rang, décision et appréciation, cette route rassemble en un seul appel :
 *  - les moyennes par matière (BulletinMatiere) ;
 *  - les absences et retards de la période ;
 *  - les incidents et sanctions actives ;
 *  - les recommandations LEARNOS actives (par niveau) ;
 *  - le profil d'apprentissage (compétences maîtrisées / fragiles / critiques) ;
 *  - les interventions pédagogiques proposées ou en cours ;
 *  - les plans de progression actifs ;
 *  - les prédictions de difficulté en cours ;
 *  - le mentorat actif éventuel.
 *
 * L'écriture (décision + appréciation) reste confiée à
 * `/api/bulletins/conseil` : cette route est strictement lisible.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "bulletins:read");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const classeId = searchParams.get("classeId");
  const periodeId = searchParams.get("periodeId");

  if (!classeId || !periodeId) {
    return erreurJson("DONNEES_INVALIDES");
  }

  const tenantId = session.user.tenantId;
  const user = session.user;
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  // Vérifier que la classe appartient au tenant et au périmètre de site de
  // l'appelant. Sans cela, un enseignant d'un site obtiendrait le récapitulatif
  // d'une classe d'un autre site.
  const classe = await prisma.classe.findFirst({
    where: {
      id: classeId,
      tenantId,
      ...siteFilterForModel("classe", user),
      ...(anneeCourante ? { annee: anneeCourante } : {}),
    },
    select: { id: true },
  });
  if (!classe) return erreurJson("CLASSE_INTROUVABLE");

  const periode = await prisma.periode.findFirst({
    where: { id: periodeId, annee: { tenantId } },
    select: { id: true, dateDebut: true, dateFin: true },
  });
  if (!periode) return erreurJson("PERIODE_INTROUVABLE");

  // `bulletins:read` ouvre cette route à PARENT et STUDENT. Le filtre de site
  // ne les borne pas (périmètre relationnel), donc `personalScopeFilter` est
  // le seul rempart : sans lui, un parent lirait les signaux de toute la
  // classe. Neutre pour le personnel.
  const eleveWhere = {
    classeId,
    tenantId,
    statut: "ACTIF" as const,
    ...mergeFilters(
      siteFilterForModel("eleve", user),
      personalScopeFilter(user, null)
    ),
  };

  const eleves = await prisma.eleve.findMany({
    where: eleveWhere,
    select: {
      id: true,
      nom: true,
      prenom: true,
      matricule: true,
      bulletins: {
        where: { periodeId },
        select: {
          id: true,
          moyenneGenerale: true,
          rang: true,
          decision: true,
          appreciation: true,
          heuresAbsence: true,
          matieres: {
            select: {
              matiereId: true,
              matiere: { select: { nom: true, code: true } },
              moyenneEleve: true,
              rang: true,
              appreciation: true,
            },
          },
        },
      },
    },
    orderBy: [{ prenom: "asc" }, { nom: "asc" }],
  });

  if (eleves.length === 0) {
    return NextResponse.json({ eleves: [] });
  }

  const eleveIds = eleves.map((e) => e.id);

  // ── Absences et retards sur la période ──────────────────────────
  const absences = await prisma.absence.findMany({
    where: {
      tenantId,
      eleveId: { in: eleveIds },
      date: { gte: periode.dateDebut, lte: periode.dateFin },
      ...siteFilterForModel("absence", user),
    },
    select: {
      eleveId: true,
      isRetard: true,
      motif: true,
      statut: true,
    },
  });

  // ── Incidents et sanctions ──────────────────────────────────────
  const incidents = await prisma.incident.findMany({
    where: {
      tenantId,
      eleveId: { in: eleveIds },
      date: { gte: periode.dateDebut, lte: periode.dateFin },
      ...siteFilterForModel("incident", user),
    },
    select: {
      eleveId: true,
      statut: true,
      gravite: true,
      sanctions: {
        select: {
          id: true,
          type: true,
          dateFin: true,
          dateRetourEffective: true,
        },
      },
    },
  });

  // ── Recommandations LEARNOS actives ─────────────────────────────
  // `ECARTEE` = écartée par l'enseignant ; tout le reste est « active ».
  const recommandations = await prisma.recommandation.findMany({
    where: {
      tenantId,
      eleveId: { in: eleveIds },
      statut: { not: "ECARTEE" },
      ...siteFilterForModel("recommandation", user),
    },
    select: { eleveId: true, niveau: true },
  });

  // ── Profil d'apprentissage par compétence ───────────────────────
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      eleveId: { in: eleveIds },
      ...siteFilterForModel("studentLearningProfile", user),
    },
    select: { eleveId: true, masteryStatus: true },
  });

  // ── Interventions pédagogiques ──────────────────────────────────
  const interventions = await prisma.studentIntervention.findMany({
    where: {
      tenantId,
      eleveId: { in: eleveIds },
      status: { in: ["PROPOSED", "APPROVED", "ACTIVE", "UNDER_REVIEW"] },
      ...siteFilterForModel("studentIntervention", user),
    },
    select: { eleveId: true, status: true },
  });

  // ── Plans de progression actifs ─────────────────────────────────
  const plans = await prisma.planProgression.findMany({
    where: {
      tenantId,
      eleveId: { in: eleveIds },
      statut: { in: ["PROPOSE", "ACTIF", "EN_REVUE"] },
      ...siteFilterForModel("planProgression", user),
    },
    select: { eleveId: true, type: true, statut: true },
  });

  // ── Prédictions de difficulté en cours (non vérifiées) ──────────
  const predictions = await prisma.predictionDifficulte.findMany({
    where: {
      tenantId,
      eleveId: { in: eleveIds },
      verifieeLe: null,
      ...siteFilterForModel("predictionDifficulte", user),
    },
    select: { eleveId: true, difficultePredite: true },
  });

  // ── Mentorat actif (via l'utilisateur lié à l'élève) ────────────
  // Le mentorat relie des `User`, pas des `Eleve`. On ne peut donc pas
  // filtrer directement par `eleveId`. On récupère les userIds des élèves
  // via leur compte lié, puis les mentorats actifs.
  // Note : `Eleve` n'a pas toujours un `userId` (l'élève n'a pas
  // nécessairement de compte). On récupère ceux qui en ont un.
  const elevesAvecUser = await prisma.eleve.findMany({
    where: {
      id: { in: eleveIds },
      tenantId,
      userId: { not: null },
      ...siteFilterForModel("eleve", user),
    },
    select: { id: true, userId: true },
  });
  const eleveToUserId = new Map(
    elevesAvecUser.map((e) => [e.userId!, e.id])
  );
  const userIds = [...eleveToUserId.keys()];
  const mentorats = userIds.length
    ? await prisma.mentorat.findMany({
        where: {
          tenantId,
          mentoreId: { in: userIds },
          statut: "ACTIF",
        },
        select: { mentoreId: true, type: true },
      })
    : [];

  // ── Agrégation par élève ────────────────────────────────────────
  const absencesParEleve = new Map<string, { total: number; retards: number; injustifiees: number }>();
  for (const a of absences) {
    const e = absencesParEleve.get(a.eleveId) ?? { total: 0, retards: 0, injustifiees: 0 };
    e.total++;
    if (a.isRetard) e.retards++;
    if (a.motif === "INJUSTIFIE") e.injustifiees++;
    absencesParEleve.set(a.eleveId, e);
  }

  const incidentsParEleve = new Map<string, { total: number; ouverts: number; graves: number; sanctionsActives: number }>();
  for (const inc of incidents) {
    const e = incidentsParEleve.get(inc.eleveId) ?? { total: 0, ouverts: 0, graves: 0, sanctionsActives: 0 };
    e.total++;
    if (inc.statut === "OUVERT" || inc.statut === "EN_TRAITEMENT") e.ouverts++;
    if (inc.gravite >= 3) e.graves++;
    for (const s of inc.sanctions) {
      // Sanction active = pas encore de retour effectif et dateFin dans le
      // futur ou absente (exclusion temporaire en cours).
      if (!s.dateRetourEffective) e.sanctionsActives++;
    }
    incidentsParEleve.set(inc.eleveId, e);
  }

  const recosParEleve = new Map<string, { total: number; critiques: number; fragiles: number; consolidees: number }>();
  for (const r of recommandations) {
    const e = recosParEleve.get(r.eleveId) ?? { total: 0, critiques: 0, fragiles: 0, consolidees: 0 };
    e.total++;
    if (r.niveau === "CRITIQUE") e.critiques++;
    else if (r.niveau === "FRAGILE") e.fragiles++;
    else if (r.niveau === "CONSOLIDE") e.consolidees++;
    recosParEleve.set(r.eleveId, e);
  }

  const profilsParEleve = new Map<string, { maitrises: number; fragiles: number; critiques: number; inconnues: number }>();
  for (const p of profils) {
    const e = profilsParEleve.get(p.eleveId) ?? { maitrises: 0, fragiles: 0, critiques: 0, inconnues: 0 };
    // MASTERED / PROFICIENT = maîtrise solide ; DEVELOPING / EMERGING = fragile ;
    // NEEDS_REVIEW = critique ; UNKNOWN = non évaluée.
    if (p.masteryStatus === "MASTERED" || p.masteryStatus === "PROFICIENT") e.maitrises++;
    else if (p.masteryStatus === "DEVELOPING" || p.masteryStatus === "EMERGING") e.fragiles++;
    else if (p.masteryStatus === "NEEDS_REVIEW") e.critiques++;
    else e.inconnues++;
    profilsParEleve.set(p.eleveId, e);
  }

  const interventionsParEleve = new Map<string, { proposees: number; enCours: number }>();
  for (const i of interventions) {
    const e = interventionsParEleve.get(i.eleveId) ?? { proposees: 0, enCours: 0 };
    if (i.status === "PROPOSED") e.proposees++;
    else e.enCours++;
    interventionsParEleve.set(i.eleveId, e);
  }

  const plansParEleve = new Map<string, { remediation: number; approfondissement: number }>();
  for (const p of plans) {
    const e = plansParEleve.get(p.eleveId) ?? { remediation: 0, approfondissement: 0 };
    if (p.type === "remediation") e.remediation++;
    else e.approfondissement++;
    plansParEleve.set(p.eleveId, e);
  }

  const predictionsParEleve = new Map<string, { total: number; critiques: number }>();
  for (const p of predictions) {
    const e = predictionsParEleve.get(p.eleveId) ?? { total: 0, critiques: 0 };
    e.total++;
    if (p.difficultePredite === "CRITIQUE") e.critiques++;
    predictionsParEleve.set(p.eleveId, e);
  }

  const mentoratsParEleve = new Map<string, string>();
  for (const m of mentorats) {
    const eleveId = eleveToUserId.get(m.mentoreId);
    if (eleveId) mentoratsParEleve.set(eleveId, m.type);
  }

  const result = eleves.map((e) => {
    const bulletin = e.bulletins[0];
    const abs = absencesParEleve.get(e.id);
    const inc = incidentsParEleve.get(e.id);
    const rec = recosParEleve.get(e.id);
    const prof = profilsParEleve.get(e.id);
    const intv = interventionsParEleve.get(e.id);
    const pln = plansParEleve.get(e.id);
    const pred = predictionsParEleve.get(e.id);
    const ment = mentoratsParEleve.get(e.id);
    return {
      id: e.id,
      nom: e.nom,
      prenom: e.prenom,
      matricule: e.matricule,
      moyenneGenerale: bulletin?.moyenneGenerale ?? null,
      rang: bulletin?.rang ?? null,
      decision: (bulletin?.decision as string | null) ?? null,
      appreciation: bulletin?.appreciation ?? "",
      matieres: bulletin?.matieres ?? [],
      assiduite: {
        absences: abs?.total ?? 0,
        retards: abs?.retards ?? 0,
        injustifiees: abs?.injustifiees ?? 0,
        heuresAbsence: bulletin?.heuresAbsence ?? 0,
      },
      discipline: {
        incidents: inc?.total ?? 0,
        incidentsOuverts: inc?.ouverts ?? 0,
        incidentsGraves: inc?.graves ?? 0,
        sanctionsActives: inc?.sanctionsActives ?? 0,
      },
      learnos: {
        recommandations: rec?.total ?? 0,
        recosCritiques: rec?.critiques ?? 0,
        recosFragiles: rec?.fragiles ?? 0,
        recosConsolidees: rec?.consolidees ?? 0,
        competencesMaitrisees: prof?.maitrises ?? 0,
        competencesFragiles: prof?.fragiles ?? 0,
        competencesCritiques: prof?.critiques ?? 0,
        competencesInconnues: prof?.inconnues ?? 0,
        interventionsProposees: intv?.proposees ?? 0,
        interventionsEnCours: intv?.enCours ?? 0,
        plansRemediation: pln?.remediation ?? 0,
        plansApprofondissement: pln?.approfondissement ?? 0,
        predictionsEnCours: pred?.total ?? 0,
        predictionsCritiques: pred?.critiques ?? 0,
      },
      mentorat: ment ?? null,
    };
  });

  // Trier par moyenne décroissante — comme `conseil-data`.
  result.sort((a, b) => (b.moyenneGenerale ?? 0) - (a.moyenneGenerale ?? 0));

  return NextResponse.json({ eleves: result });
}
