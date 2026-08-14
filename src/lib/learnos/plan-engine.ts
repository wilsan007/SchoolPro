/**
 * EcolPro / LEARNOS — Plans de progression
 * ========================================
 *
 * Quand les recommandations s'accumulent, elles cessent d'être une liste et
 * deviennent **un parcours daté, attribué et vérifié**.
 *
 * QUATRE RÈGLES
 * -------------
 *
 * **1. Un plan = une matière = un responsable.** Un parcours qui mélangerait
 * maths et histoire n'aurait aucun propriétaire : quel enseignant le porte ?
 * Chaque matière a donc son plan, avec ses propres seuils.
 *
 * **2. Aucun plan ne s'active seul.** Le moteur *propose*, un enseignant
 * *valide*. Engager l'établissement dans un dispositif est un acte pédagogique,
 * pas un calcul — et un plan imposé par une machine serait indéfendable devant
 * un parent.
 *
 * **3. Le plan vit.** Une nouvelle difficulté dans la matière **ajoute** une
 * étape au parcours en cours ; une compétence qui régresse **rouvre** son
 * étape. En revanche, retirer ou remplacer une étape reste une décision
 * humaine : un plan qui se réécrirait à chaque note deviendrait illisible, et
 * l'enseignant ne saurait plus ce qu'il a validé.
 *
 * **4. Trop de parcours simultanés est un signal, pas une fatalité.** Un élève
 * avec quatre plans n'a pas quatre problèmes disciplinaires : il en a un seul,
 * global, qui relève de la vie scolaire — pas de quatre enseignants agissant
 * chacun dans son coin.
 *
 * LA BOUCLE SE REFERME SUR L'EXISTANT
 * -----------------------------------
 * Le jalon d'une étape est une évaluation ordinaire, qui produit une
 * `LearningEvidence` par le moteur déjà en place, met à jour le profil, et clôt
 * l'étape. Aucun mécanisme de suivi parallèle.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import { Prisma, type StatutPlan } from "@prisma/client";
import prisma from "@/lib/prisma";
import { resoudreSeuils } from "@/lib/learnos/recommendation-engine";
import { SEUILS_MAITRISE } from "@/lib/learnos/learning-twin";

/** Délai par défaut avant le point d'étape, en jours. */
const DELAI_REVUE_JOURS = 30;
/** Échelonnement des échéances entre étapes, en jours. */
const ESPACEMENT_ETAPES_JOURS = 14;

/**
 * Nombre de parcours simultanés au-delà duquel on cesse d'en ouvrir.
 *
 * Garde-fou de conception, pas seuil pédagogique : au-delà, la difficulté n'est
 * plus disciplinaire et multiplier les dispositifs noierait l'élève comme ses
 * enseignants.
 */
export const PLAFOND_PLANS_SIMULTANES = 3;

const STATUTS_EN_COURS: StatutPlan[] = ["PROPOSE", "ACTIF", "EN_REVUE"];

export interface PlanPropose {
  id: string;
  matiereId: string | null;
  matiereNom: string;
  type: "remediation" | "approfondissement";
  motif: string;
  nbEtapes: number;
}

export interface ResultatEvaluation {
  proposes: PlanPropose[];
  /** Parcours existants enrichis d'une nouvelle difficulté. */
  ajustes: { planId: string; matiereNom: string; etapesAjoutees: number }[];
  /**
   * Vrai quand le plafond empêche d'ouvrir un parcours de plus. À remonter à la
   * vie scolaire : c'est le signal d'une difficulté globale.
   */
  plafondAtteint: boolean;
}

type RecoAvecMatiere = {
  competenceId: string;
  niveau: string;
  competencesBloquees: number;
  actionProposee: string;
  competence: {
    libelle: string;
    chapitre: { niveau: string; matiereId: string; matiere: { nom: string } | null } | null;
  };
};

/**
 * Examine la situation d'un élève, **matière par matière**, et propose ou
 * ajuste les parcours qui s'imposent.
 */
export async function evaluerBesoinDePlans(
  tenantId: string,
  eleveId: string,
  maintenant: Date = new Date()
): Promise<ResultatEvaluation> {
  const resultat: ResultatEvaluation = { proposes: [], ajustes: [], plafondAtteint: false };

  const recommandations = (await prisma.recommandation.findMany({
    where: { tenantId, eleveId, resolueLe: null, statut: { not: "ECARTEE" } },
    select: {
      competenceId: true,
      niveau: true,
      competencesBloquees: true,
      actionProposee: true,
      competence: {
        select: {
          libelle: true,
          chapitre: {
            select: { niveau: true, matiereId: true, matiere: { select: { nom: true } } },
          },
        },
      },
    },
  })) as RecoAvecMatiere[];
  if (recommandations.length === 0) return resultat;

  const plansEnCours = await prisma.planProgression.findMany({
    where: { tenantId, eleveId, statut: { in: STATUTS_EN_COURS } },
    select: {
      id: true,
      matiereId: true,
      type: true,
      etapes: { select: { competenceId: true } },
    },
  });
  const planParMatiere = new Map(plansEnCours.map((p) => [p.matiereId ?? "", p]));

  // Regroupement par matière : un plan = une matière = un responsable.
  const parMatiere = new Map<string, RecoAvecMatiere[]>();
  for (const r of recommandations) {
    const cle = r.competence.chapitre?.matiereId ?? "";
    if (!parMatiere.has(cle)) parMatiere.set(cle, []);
    parMatiere.get(cle)!.push(r);
  }

  let plansOuverts = plansEnCours.length;

  for (const [matiereId, recos] of parMatiere) {
    const matiereNom = recos[0].competence.chapitre?.matiere?.nom ?? "—";
    const existant = planParMatiere.get(matiereId);

    // Un parcours est déjà en cours dans cette matière : on l'enrichit au lieu
    // d'en ouvrir un second.
    if (existant) {
      const dejaCouvertes = new Set(existant.etapes.map((e) => e.competenceId));
      const nouvelles = recos.filter(
        (r) =>
          !dejaCouvertes.has(r.competenceId) &&
          // Un parcours de remédiation ne s'enrichit pas d'une ouverture, et
          // réciproquement : ce sont deux démarches distinctes.
          (existant.type === "remediation"
            ? r.niveau === "CRITIQUE" || r.niveau === "FRAGILE"
            : r.niveau === "AVANCE" || r.niveau === "EXCELLENCE")
      );

      if (nouvelles.length > 0) {
        await prisma.etapePlan.createMany({
          data: nouvelles.map((r, i) => ({
            planId: existant.id,
            competenceId: r.competenceId,
            ordre: existant.etapes.length + i,
            action: r.actionProposee,
            responsable: existant.type === "approfondissement" ? "eleve" : "enseignant",
            echeance: new Date(
              maintenant.getTime() +
                (existant.etapes.length + i + 1) * ESPACEMENT_ETAPES_JOURS * 86_400_000
            ),
          })),
        });
        resultat.ajustes.push({
          planId: existant.id,
          matiereNom,
          etapesAjoutees: nouvelles.length,
        });
      }
      continue;
    }

    if (plansOuverts >= PLAFOND_PLANS_SIMULTANES) {
      resultat.plafondAtteint = true;
      continue;
    }

    const propose = await proposerPlanMatiere(
      tenantId,
      eleveId,
      matiereId || null,
      matiereNom,
      recos,
      maintenant
    );
    if (propose) {
      resultat.proposes.push(propose);
      plansOuverts++;
    }
  }

  return resultat;
}

/** Évalue les seuils d'une matière et crée le parcours s'ils sont franchis. */
async function proposerPlanMatiere(
  tenantId: string,
  eleveId: string,
  matiereId: string | null,
  matiereNom: string,
  recos: RecoAvecMatiere[],
  maintenant: Date
): Promise<PlanPropose | null> {
  // Seuils résolus dans le contexte de CETTE matière : appliquer les seuils de
  // maths à des compétences d'histoire n'aurait aucun sens.
  const seuils = await resoudreSeuils(tenantId, {
    niveau: recos[0].competence.chapitre?.niveau,
    matiereId,
  });

  const critiques = recos.filter((r) => r.niveau === "CRITIQUE");
  const hautes = recos.filter((r) => r.niveau === "AVANCE" || r.niveau === "EXCELLENCE");
  const bloquantMassivement = critiques.filter((r) => r.competencesBloquees >= 3);

  let type: "remediation" | "approfondissement" | null = null;
  let motif = "";
  let regle = "";
  // Paramètres de la phrase : c'est eux qui la rendent traduisible.
  let params: Record<string, string | number> = {};
  let cibles: RecoAvecMatiere[] = [];

  if (critiques.length >= seuils.declenchementPlanCritiques) {
    type = "remediation";
    regle = "plan_difficultes_multiples";
    motif =
      `${matiereNom} — ${critiques.length} compétences ne sont pas acquises : ` +
      `${critiques.map((r) => r.competence.libelle).join(", ")}.`;
    params = {
      matiere: matiereNom,
      n: critiques.length,
      competences: critiques.map((r) => r.competence.libelle).join(", "),
    };
    cibles = critiques;
  } else if (bloquantMassivement.length > 0) {
    // Une seule compétence suffit si elle verrouille la suite du programme.
    type = "remediation";
    regle = "plan_blocage_structurel";
    const r = bloquantMassivement[0];
    motif =
      `${matiereNom} — « ${r.competence.libelle} » n'est pas acquise et conditionne ` +
      `${r.competencesBloquees} compétences à venir : le retard s'accumulera mécaniquement.`;
    params = {
      matiere: matiereNom,
      competence: r.competence.libelle,
      bloquees: r.competencesBloquees,
    };
    cibles = bloquantMassivement;
  } else if (hautes.length >= seuils.declenchementPlanAvances) {
    type = "approfondissement";
    regle = "plan_potentiel_eleve";
    motif =
      `${matiereNom} — ${hautes.length} compétences sont maîtrisées au-delà des attendus : ` +
      `un parcours d'approfondissement entretiendrait l'engagement.`;
    params = { matiere: matiereNom, n: hautes.length };
    cibles = hautes;
  }

  if (!type) return null;

  // Traitement de fond déclenché par le drainage, donc sans session : aucun
  // périmètre d'utilisateur à appliquer. L'isolation tient au `tenantId`, et le
  // site est lu pour être *posé* sur le plan, non pour arbitrer un accès.
  // eslint-disable-next-line ecolpro/require-site-filter
  const eleve = await prisma.eleve.findFirst({
    where: { id: eleveId, tenantId },
    select: { siteId: true },
  });

  const plan = await prisma.planProgression.create({
    data: {
      tenantId,
      siteId: eleve?.siteId ?? null,
      eleveId,
      matiereId,
      type,
      origine: "automatique",
      // PROPOSE, jamais ACTIF : la validation humaine est le passage obligé.
      statut: "PROPOSE",
      motif,
      regleDeclenchee: regle,
      motifParams: params as unknown as Prisma.InputJsonValue,
      dateRevue: new Date(maintenant.getTime() + DELAI_REVUE_JOURS * 86_400_000),
      etapes: {
        create: cibles.map((r, index) => ({
          competenceId: r.competenceId,
          ordre: index,
          action: r.actionProposee,
          responsable: type === "approfondissement" ? "eleve" : "enseignant",
          echeance: new Date(
            maintenant.getTime() + (index + 1) * ESPACEMENT_ETAPES_JOURS * 86_400_000
          ),
        })),
      },
    },
    select: { id: true },
  });

  return { id: plan.id, matiereId, matiereNom, type, motif, nbEtapes: cibles.length };
}

/**
 * Valide un plan proposé — l'acte par lequel un humain l'engage.
 *
 * Enregistre la maîtrise moyenne de départ : sans cette photographie, on ne
 * pourra pas dire à la fin si le dispositif a servi.
 */
export async function validerPlan(
  tenantId: string,
  planId: string,
  valideParId: string,
  responsableUserId?: string,
  maintenant: Date = new Date()
): Promise<boolean> {
  const plan = await prisma.planProgression.findFirst({
    where: { tenantId, id: planId, statut: "PROPOSE" },
    select: { id: true, eleveId: true, etapes: { select: { competenceId: true } } },
  });
  if (!plan) return false;

  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      eleveId: plan.eleveId,
      competenceId: { in: plan.etapes.map((e) => e.competenceId) },
    },
    select: { masteryScore: true },
  });
  const moyenne =
    profils.length > 0
      ? profils.reduce((s, p) => s + p.masteryScore, 0) / profils.length
      : null;

  await prisma.planProgression.updateMany({
    where: { id: planId, tenantId },
    data: {
      statut: "ACTIF",
      valideParId,
      valideLe: maintenant,
      dateDebut: maintenant,
      responsableUserId: responsableUserId ?? valideParId,
      masteryAvant: moyenne,
    },
  });
  return true;
}

/** Refus d'un plan proposé — décision assumée, conservée pour l'historique. */
export async function refuserPlan(
  tenantId: string,
  planId: string,
  motif?: string
): Promise<boolean> {
  const { count } = await prisma.planProgression.updateMany({
    where: { tenantId, id: planId, statut: "PROPOSE" },
    data: { statut: "ABANDONNE", resultat: motif ?? "Écarté par l'enseignant" },
  });
  return count > 0;
}

/**
 * Synchronise les étapes d'un élève sur une compétence, dans les deux sens.
 *
 * C'est la **preuve** qui pilote l'étape, jamais une déclaration : un élève ne
 * coche pas sa progression, il la démontre — et une régression rouvre l'étape
 * au lieu de laisser croire que l'acquis tient encore.
 *
 * @returns étapes validées et étapes rouvertes.
 */
export async function synchroniserEtapes(
  tenantId: string,
  eleveId: string,
  competenceId: string,
  maintenant: Date = new Date()
): Promise<{ validees: number; rouvertes: number }> {
  const profil = await prisma.studentLearningProfile.findFirst({
    where: { tenantId, eleveId, competenceId },
    select: { masteryStatus: true, masteryScore: true },
  });
  if (!profil) return { validees: 0, rouvertes: 0 };

  const acquis =
    profil.masteryStatus === "PROFICIENT" || profil.masteryStatus === "MASTERED";

  if (acquis) {
    const { count } = await prisma.etapePlan.updateMany({
      where: {
        competenceId,
        statut: { in: ["A_FAIRE", "EN_COURS", "FAIT"] },
        plan: { tenantId, eleveId, statut: { in: ["ACTIF", "EN_REVUE"] } },
      },
      data: { statut: "VALIDE", valideeLe: maintenant },
    });
    if (count > 0) await cloturerPlansAcheves(tenantId, eleveId, maintenant);
    return { validees: count, rouvertes: 0 };
  }

  // Régression avérée — et non simple ignorance : `UNKNOWN` ne rouvre rien,
  // ne plus savoir n'est pas avoir oublié.
  const regresse =
    profil.masteryStatus !== "UNKNOWN" &&
    profil.masteryScore < SEUILS_MAITRISE.enDeveloppement;

  if (!regresse) return { validees: 0, rouvertes: 0 };

  const { count } = await prisma.etapePlan.updateMany({
    where: {
      competenceId,
      statut: "VALIDE",
      plan: { tenantId, eleveId, statut: { in: ["ACTIF", "EN_REVUE", "TERMINE"] } },
    },
    data: { statut: "EN_COURS", valideeLe: null },
  });

  // Un plan clos dont une étape retombe doit se rouvrir : le déclarer terminé
  // alors que l'acquis s'est perdu serait un faux positif durable.
  if (count > 0) {
    await prisma.planProgression.updateMany({
      where: {
        tenantId,
        eleveId,
        statut: "TERMINE",
        etapes: { some: { competenceId, statut: "EN_COURS" } },
      },
      data: { statut: "EN_REVUE", dateFin: null, resultat: null },
    });
  }

  return { validees: 0, rouvertes: count };
}

/**
 * Termine un plan dont toutes les étapes sont validées, et mesure l'effet.
 *
 * `masteryApres` face à `masteryAvant` dira, à l'échelle de l'établissement,
 * quels dispositifs fonctionnent — et lesquels sont sans effet.
 */
async function cloturerPlansAcheves(
  tenantId: string,
  eleveId: string,
  maintenant: Date
): Promise<void> {
  const plans = await prisma.planProgression.findMany({
    where: { tenantId, eleveId, statut: { in: ["ACTIF", "EN_REVUE"] } },
    select: {
      id: true,
      masteryAvant: true,
      etapes: { select: { statut: true, competenceId: true } },
    },
  });

  for (const plan of plans) {
    if (plan.etapes.some((e) => e.statut !== "VALIDE")) continue;

    const profils = await prisma.studentLearningProfile.findMany({
      where: {
        tenantId,
        eleveId,
        competenceId: { in: plan.etapes.map((e) => e.competenceId) },
      },
      select: { masteryScore: true },
    });
    const apres =
      profils.length > 0
        ? profils.reduce((s, p) => s + p.masteryScore, 0) / profils.length
        : null;

    const gain =
      apres !== null && plan.masteryAvant !== null ? apres - plan.masteryAvant : null;

    await prisma.planProgression.updateMany({
      where: { id: plan.id, tenantId },
      data: {
        statut: "TERMINE",
        dateFin: maintenant,
        masteryApres: apres,
        resultat:
          gain === null
            ? "Toutes les étapes validées."
            : `Toutes les étapes validées — progression de ${Math.round(gain * 100)} points de maîtrise.`,
      },
    });
  }
}

/**
 * Bascule en revue les parcours dont la date de point d'étape est atteinte.
 *
 * Sans cela, `dateRevue` serait un rendez-vous que personne n'honore : un plan
 * pourrait rester actif toute l'année sans que quiconque se demande s'il sert.
 * Appelée par le répartiteur de tâches planifiées.
 *
 * @returns nombre de parcours passés en revue.
 */
export async function passerEnRevueLesPlansEchus(
  maintenant: Date = new Date()
): Promise<number> {
  // Tâche système : elle balaie délibérément tous les tenants, comme les autres
  // traitements planifiés.
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
  const { count } = await prisma.planProgression.updateMany({
    where: { statut: "ACTIF", dateRevue: { lte: maintenant } },
    data: { statut: "EN_REVUE" },
  });
  return count;
}

/** Statuts considérés comme « en cours », pour les écrans de suivi. */
export const STATUTS_ACTIFS: StatutPlan[] = STATUTS_EN_COURS;
