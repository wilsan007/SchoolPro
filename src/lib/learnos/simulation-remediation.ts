/**
 * EcolPro / LEARNOS — Simulation contre-factuelle de remédiation
 * ==============================================================
 *
 * PRIORISER PAR IMPACT PLUTÔT QU'AU HASARD
 * ----------------------------------------
 * Le directeur demande : « Si je remédiais ces 3 compétences, combien
 * d'élèves seraient sauvés du redoublement ? » Remédier au hasard dilue
 * l'effort : on soigne des compétences qui ne bloquent rien et on laisse
 * pourrir des prérequis dont dépend tout le reste.
 *
 * Plutôt que de deviner, on SIMULE l'impact de chaque intervention possible.
 * Pour chaque compétence critique non résolue, on applique le Δ de maîtrise
 * moyen observé sur les interventions passées, et l'on compte combien
 * d'élèves franchiraient le seuil de réussite. On en déduit un ROI
 * (élèves sauvés / coût estimé) qui permet de prioriser les interventions
 * à fort impact et faible coût.
 *
 * Aucune boule de cristal : la simulation s'appuie sur l'historique réel
 * des interventions (masteryBefore → masteryAfter) et sur la structure du
 * graphe de prérequis. Si l'historique est vide, un Δ par défaut de 0.2
 * est utilisé et signalé.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { compterCompetencesEnAval } from "@/lib/learnos/recommendation-engine";

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------

/**
 * Seuil de réussite par défaut : un élève est « sauvé » quand sa maîtrise
 * simulée franchit ce seuil. 0.55 correspond à la borne `seuilFragile` :
 * en deçà, l'élève est en bande CRITIQUE ou FRAGILE ; au-delà, il entre
 * dans la bande CONSOLIDÉE et n'est plus considéré à risque.
 */
const SEUIL_REUSSITE_DEFAUT = 0.55;

/**
 * Δ de maîtrise par défaut quand aucun historique d'intervention n'existe.
 * 0.2 est une estimation conservatrice : une remédiation bien menée fait
 * progresser d'environ un cinquième de l'échelle de maîtrise.
 */
const DELTA_DEFAUT = 0.2;

/** Durée d'une intervention de remédiation, en heures. */
const DUREE_INTERVENTION_HEURES = 2;

/** Types d'intervention pris en compte pour le calcul du Δ moyen. */
const TYPES_INTERVENTION = ["remediation", "retest", "prerequisite_review"] as const;

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface ScenarioRemediation {
  competenceId: string;
  competenceLibelle: string;
  matiereNom: string;
  elevesConcernes: number;
  elevesSauvesEstime: number; // après simulation
  competencesLiberees: number; // en cascade
  coutEstime: number; // en devise du tenant
  roi: number; // elevesSauves / cout
  deltaMoyenApplique: number; // Δ mastery moyen utilisé pour la simulation
  typeIntervention: string; // "remediation" | "retest" | "prerequisite_review"
}

export interface ResultatSimulation {
  scenarios: ScenarioRemediation[];
  scenariosPriorises: ScenarioRemediation[]; // triés par ROI décroissant
  deltaMoyenParType: { type: string; delta: number; echantillon: number }[];
  totalElevesARisque: number;
  totalElevesSauvables: number;
  coutTotalOptimal: number;
}

// ------------------------------------------------------------
// Calcul principal
// ------------------------------------------------------------

/**
 * Simule l'impact de chaque remédiation possible et prioriser par ROI.
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site obligatoire).
 * @param anneeId   Année scolaire optionnelle : borne l'historique
 *                  d'interventions à la période correspondante. Si absent,
 *                  tout l'historique est utilisé.
 */
export async function simulerRemediation(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeId?: string,
): Promise<ResultatSimulation> {
  // ── 1. Élèves à risque : recommandations OBLIGATOIRE non résolues ──────
  //
  // Une recommandation OBLIGATOIRE n'est émise que pour une bande CRITIQUE
  // qui bloque assez de compétences en aval (cf. `statutParDefaut`). Ce
  // sont donc les élèves les plus exposés au redoublement.
  const recommandations = await prisma.recommandation.findMany({
    where: {
      tenantId,
      statut: "OBLIGATOIRE",
      resolueLe: null,
      ...siteFilterForModel("recommandation", claims),
    },
    select: {
      eleveId: true,
      competenceId: true,
      competence: {
        select: {
          id: true,
          libelle: true,
          chapitre: { select: { matiere: { select: { id: true, nom: true } } } },
        },
      },
    },
  });

  // Pas d'élève à risque → résultat vide (mais cohérent).
  if (recommandations.length === 0) {
    return {
      scenarios: [],
      scenariosPriorises: [],
      deltaMoyenParType: TYPES_INTERVENTION.map((t) => ({
        type: t,
        delta: DELTA_DEFAUT,
        echantillon: 0,
      })),
      totalElevesARisque: 0,
      totalElevesSauvables: 0,
      coutTotalOptimal: 0,
    };
  }

  // Indexer par compétence : quels élèves sont à risque sur chacune.
  const parCompetence = new Map<
    string,
    {
      libelle: string;
      matiereNom: string;
      eleveIds: Set<string>;
    }
  >();
  const tousElevesIds = new Set<string>();
  for (const r of recommandations) {
    const c = r.competence;
    let entree = parCompetence.get(c.id);
    if (!entree) {
      entree = {
        libelle: c.libelle,
        matiereNom: c.chapitre.matiere.nom,
        eleveIds: new Set(),
      };
      parCompetence.set(c.id, entree);
    }
    entree.eleveIds.add(r.eleveId);
    tousElevesIds.add(r.eleveId);
  }

  // ── 2. Δ mastery moyen par type d'intervention ────────────────────────
  //
  // On mesure l'efficacité passée des interventions : de combien de points
  // de maîtrise a progressé un élève en moyenne, selon le type. C'est ce Δ
  // qui sert de moteur à la simulation.
  // Borner à l'année scolaire si demandé.
  let plageAnnee: { debut: Date; fin: Date } | null = null;
  if (anneeId) {
    const annee = await prisma.anneesScolaires.findFirst({
      where: { id: anneeId, tenantId },
      select: { dateDebut: true, dateFin: true },
    });
    if (annee) {
      plageAnnee = { debut: annee.dateDebut, fin: annee.dateFin };
    }
  }

  const interventions = await prisma.studentIntervention.findMany({
    where: {
      tenantId,
      status: "COMPLETED",
      masteryBefore: { not: null },
      masteryAfter: { not: null },
      ...(plageAnnee && {
        startDate: { gte: plageAnnee.debut, lte: plageAnnee.fin },
      }),
      ...siteFilterForModel("studentIntervention", claims),
    },
    select: { interventionType: true, masteryBefore: true, masteryAfter: true },
  });

  // Calcul du Δ moyen par type.
  const deltasParType = new Map<string, { somme: number; count: number }>();
  for (const iv of interventions) {
    const delta = (iv.masteryAfter ?? 0) - (iv.masteryBefore ?? 0);
    const cle = iv.interventionType;
    const courant = deltasParType.get(cle) ?? { somme: 0, count: 0 };
    courant.somme += delta;
    courant.count += 1;
    deltasParType.set(cle, courant);
  }

  const deltaMoyenParType: { type: string; delta: number; echantillon: number }[] =
    TYPES_INTERVENTION.map((t) => {
      const d = deltasParType.get(t);
      return d && d.count > 0
        ? { type: t, delta: d.somme / d.count, echantillon: d.count }
        : { type: t, delta: DELTA_DEFAUT, echantillon: 0 };
    });

  // Déterminer s'il existe au moins un type avec données réelles.
  const aDesDonneesReelles = deltaMoyenParType.some((d) => d.echantillon > 0);

  // ── 3. Profils d'apprentissage des élèves à risque ────────────────────
  //
  // Le masteryScore actuel est le point de départ de la simulation : on
  // y ajoute le Δ moyen pour estimer la maîtrise après intervention.
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      eleveId: { in: [...tousElevesIds] },
      ...siteFilterForModel("studentLearningProfile", claims),
    },
    select: { eleveId: true, competenceId: true, masteryScore: true },
  });

  // Index : (eleveId, competenceId) → masteryScore.
  const masteryParEleveCompetence = new Map<string, number>();
  for (const p of profils) {
    masteryParEleveCompetence.set(`${p.eleveId}|${p.competenceId}`, p.masteryScore);
  }

  // ── 4. Coût horaire moyen (tarifHoraire des vacataires) ───────────────
  //
  // Le coût d'une intervention = durée (2 h) × taux horaire moyen des
  // enseignants du tenant. On utilise `FicheRH.tarifHoraire` (renseigné pour
  // les vacataires) ; à défaut, on retombe sur un coût nul — le ROI devient
  // alors nul, ce qui est acceptable : sans données de coût, on ne peut
  // qu'optimiser l'impact brut.
  const fichesRH = await prisma.ficheRH.findMany({
    where: {
      tenantId,
      tarifHoraire: { not: null },
      ...siteFilterForModel("ficheRH", claims),
    },
    select: { tarifHoraire: true },
  });
  const tarifsValides = fichesRH
    .map((f) => f.tarifHoraire)
    .filter((t): t is number => t !== null);
  const tarifHoraireMoyen =
    tarifsValides.length > 0
      ? tarifsValides.reduce((a, b) => a + b, 0) / tarifsValides.length
      : 0;

  // ── 5. Simulation : un scénario par compétence critique ───────────────
  const scenarios: ScenarioRemediation[] = [];

  for (const [competenceId, info] of parCompetence) {
    const eleveIds = [...info.eleveIds];

    // Choisir le type d'intervention le plus efficace (Δ le plus élevé).
    // Si aucune donnée réelle n'existe, on utilise "remediation" avec le
    // Δ par défaut.
    let typeChoisi: string = "remediation";
    let deltaChoisi = DELTA_DEFAUT;
    if (aDesDonneesReelles) {
      let meilleurDelta = -Infinity;
      for (const d of deltaMoyenParType) {
        if (d.echantillon > 0 && d.delta > meilleurDelta) {
          meilleurDelta = d.delta;
          typeChoisi = d.type;
          deltaChoisi = d.delta;
        }
      }
      // Si aucun type n'a d'échantillon, on garde le défaut.
      if (meilleurDelta === -Infinity) {
        deltaChoisi = DELTA_DEFAUT;
      }
    }

    // Simuler : mastery_actuel + Δ → est-ce ≥ seuil de réussite ?
    let elevesSauves = 0;
    for (const eleveId of eleveIds) {
      const masteryActuel =
        masteryParEleveCompetence.get(`${eleveId}|${competenceId}`) ?? 0;
      const masterySimule = masteryActuel + deltaChoisi;
      if (masterySimule >= SEUIL_REUSSITE_DEFAUT) {
        elevesSauves += 1;
      }
    }

    // Compétences libérées en cascade : combien de compétences dépendantes
    // seraient débloquées si celle-ci était maîtrisée.
    const competencesLiberees = await compterCompetencesEnAval(tenantId, competenceId);

    // Coût estimé : nb élèves × taux horaire × durée.
    const coutEstime = eleveIds.length * tarifHoraireMoyen * DUREE_INTERVENTION_HEURES;

    // ROI : élèves sauvés par unité de coût. Coût nul → on évite la division
    // par zéro en retournant 0 (pas de coût = pas de ROI mesurable).
    const roi = coutEstime > 0 ? elevesSauves / coutEstime : 0;

    scenarios.push({
      competenceId,
      competenceLibelle: info.libelle,
      matiereNom: info.matiereNom,
      elevesConcernes: eleveIds.length,
      elevesSauvesEstime: elevesSauves,
      competencesLiberees,
      coutEstime,
      roi,
      deltaMoyenApplique: deltaChoisi,
      typeIntervention: typeChoisi,
    });
  }

  // ── 6. Priorisation par ROI décroissant ───────────────────────────────
  //
  // On trie par ROI (impact / coût) : les scénarios qui sauvent le plus
  // d'élèves pour le moins d'argent remontent en tête. En cas d'égalité,
  // le nombre d'élèves sauvés départage.
  const scenariosPriorises = [...scenarios].sort((a, b) => {
    if (b.roi !== a.roi) return b.roi - a.roi;
    return b.elevesSauvesEstime - a.elevesSauvesEstime;
  });

  // ── 7. Totaux ─────────────────────────────────────────────────────────
  const totalElevesARisque = tousElevesIds.size;

  // Élèves sauvables : union des élèves sauvés par au moins un scénario.
  // Un même élève peut être à risque sur plusieurs compétences ; on ne le
  // compte qu'une fois.
  const elevesSauvables = new Set<string>();
  for (const [competenceId, info] of parCompetence) {
    const scenario = scenarios.find((s) => s.competenceId === competenceId);
    if (!scenario || scenario.elevesSauvesEstime === 0) continue;

    // Identifier quels élèves seraient sauvés sur cette compétence.
    for (const eleveId of info.eleveIds) {
      const masteryActuel =
        masteryParEleveCompetence.get(`${eleveId}|${competenceId}`) ?? 0;
      const masterySimule = masteryActuel + scenario.deltaMoyenApplique;
      if (masterySimule >= SEUIL_REUSSITE_DEFAUT) {
        elevesSauvables.add(eleveId);
      }
    }
  }
  const totalElevesSauvables = elevesSauvables.size;

  // Coût total optimal : somme des coûts des scénarios qui sauvent au moins
  // un élève. Les scénarios à impact nul ne méritent pas d'investissement.
  const coutTotalOptimal = scenarios
    .filter((s) => s.elevesSauvesEstime > 0)
    .reduce((acc, s) => acc + s.coutEstime, 0);

  return {
    scenarios,
    scenariosPriorises,
    deltaMoyenParType,
    totalElevesARisque,
    totalElevesSauvables,
    coutTotalOptimal,
  };
}
