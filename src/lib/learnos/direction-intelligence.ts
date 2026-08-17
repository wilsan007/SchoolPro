/**
 * EcolPro / LEARNOS — Intelligence du directeur : indices composites
 * =================================================================
 *
 * SEPT INDICES, UN CHIFFRE CHACUN
 * -------------------------------
 *
 * Un chef d'établissement submerge sous les tableaux : couverture du
 * programme, recouvrement, incidents, équité entre sites, vitesse
 * d'apprentissage… Aucun ne dit, seul, si l'établissement va bien. Sept
 * indices ramenés à un score 0-1 résument la santé de l'établissement en
 * un seul chiffre — sans pour autant masquer la décomposition : chaque
 * indice expose ses sous-composantes, pour que le directeur puisse
 * descendre du score global au levier concret.
 *
 *  1. ISP  — Indice de Santé Pédagogique
 *  2. IEIS — Indice d'Équité Inter-Site
 *  3. IVF  — Indice de Viabilité Financière
 *  4. ICS  — Indice de Climat Scolaire
 *  5. ROI  — ROI Pédagogique (rendement des plans de progression)
 *  6.      — Vitesse d'Apprentissage (distribution, non bornée 0-1)
 *  7. IRO  — Indice de Résilience Opérationnelle
 *
 * RÈGLES
 *  - Chaque indice va de 0 (critique) à 1 (excellent), sauf le ROI qui est
 *    un ratio non borné et la vitesse qui est une distribution.
 *  - Une donnée manquante ne produit pas un faux 0 : l'indice porte un
 *    drapeau `donneesInsuffisantes` pour signaler que la valeur n'est pas
 *    fiable.
 *  - La période par défaut est l'année scolaire en cours.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import {
  siteFilterForModel,
  type SessionSiteClaims,
} from "@/lib/site-scope";
import { semaineScolaire } from "@/lib/learnos/planification-pure";

// ------------------------------------------------------------
// Types publics
// ------------------------------------------------------------

/**
 * Un indice composite : un score 0-1 et sa décomposition.
 *
 * `donneesInsuffisantes` signale que l'une des sous-composantes n'avait
 * pas assez de données pour être calculée — la valeur est alors à prendre
 * avec prudence (souvent 0 par défaut, ce qui n'est pas un diagnostic).
 */
export interface IndiceComposite {
  /** Code court : "ISP", "IEIS", "IVF", "ICS", "ROI", "IRO". */
  code: string;
  /** Nom lisible (clé de traduction learnos.direction.*). */
  nom: string;
  /** Score 0-1 (1 = excellent, 0 = critique). Non borné pour le ROI. */
  valeur: number;
  /** Sous-composantes détaillées, chacune 0-1. */
  composantes: Record<string, number>;
  /** `true` quand une donnée essentielle manque. */
  donneesInsuffisantes: boolean;
  /** Explication lisible du calcul. */
  explication: string;
}

/**
 * Distribution de la vitesse d'apprentissage (Δ mastery / Δ temps).
 *
 * Non bornée : une vitesse peut dépasser 1. `null` quand aucune paire de
 * preuves ne permet de calculer une vitesse.
 */
export interface VitesseApprentissage {
  /** Vitesse moyenne (Δ mastery par jour), ou `null` si indisponible. */
  moyenne: number | null;
  min: number | null;
  max: number | null;
  /** Médiane, plus robuste que la moyenne aux valeurs extrêmes. */
  mediane: number | null;
  /** Nombre de paires (élève × compétence) ayant servi au calcul. */
  nbEchantillons: number;
  donneesInsuffisantes: boolean;
}

/**
 * Le tableau de bord complet du directeur : sept indices + un score
 * global synthétique.
 */
export interface TableauIntelligence {
  isp: IndiceComposite;
  ieis: IndiceComposite;
  ivf: IndiceComposite;
  ics: IndiceComposite;
  /** `null` quand aucun plan terminé ne permet de mesurer un rendement. */
  roiPedagogique: IndiceComposite | null;
  vitesseApprentissage: VitesseApprentissage;
  iro: IndiceComposite;
  /** Moyenne des indices disponibles (hors vitesse, non bornée). */
  santeGlobale: number;
  anneeId: string | null;
  /** ISO date du calcul. */
  calculeLe: string;
}

// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------

/** Borner une valeur dans [0, 1]. */
function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** Médiane d'un tableau de nombres (tri modifié sur une copie). */
function mediane(values: number[]): number | null {
  if (values.length === 0) return null;
  const tri = [...values].sort((a, b) => a - b);
  const n = tri.length;
  return n % 2 === 1 ? tri[(n - 1) / 2] : (tri[n / 2 - 1] + tri[n / 2]) / 2;
}

/**
 * Résout l'année scolaire à utiliser : celle passée en argument, sinon la
 * année en cours (`isCurrent: true`). Retourne `null` si aucune n'existe.
 */
async function resoudreAnnee(
  tenantId: string,
  anneeId?: string
): Promise<{ id: string; dateDebut: Date; dateFin: Date } | null> {
  if (anneeId) {
    return prisma.anneesScolaires.findFirst({
      where: { id: anneeId, tenantId },
      select: { id: true, dateDebut: true, dateFin: true },
    });
  }
  return prisma.anneesScolaires.findFirst({
    where: { tenantId, isCurrent: true },
    select: { id: true, dateDebut: true, dateFin: true },
  });
}

// ------------------------------------------------------------
// 1. ISP — Indice de Santé Pédagogique
// ------------------------------------------------------------

/**
 * ISP = 0.3×couvertureProgramme + 0.3×(1-tauxDecalage)
 *       + 0.2×masteryMoyenne + 0.2×precisionPrediction
 *
 *  - couvertureProgramme : % de chapitres TRAITE / total prévu (année).
 *  - tauxDecalage        : % de chapitres dont la semaine de fin est
 *                          dépassée sans être marqués TRAITE.
 *  - masteryMoyenne      : AVG(StudentLearningProfile.masteryScore).
 *  - precisionPrediction : prédictions vérifiées correctes / vérifiées.
 */
export async function calculerISP(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeId?: string,
  maintenant: Date = new Date()
): Promise<IndiceComposite> {
  const annee = await resoudreAnnee(tenantId, anneeId);

  const planifs = annee
    ? await prisma.planificationChapitre.findMany({
        where: {
          tenantId,
          anneeId: annee.id,
          ...siteFilterForModel("planificationChapitre", claims),
        },
        select: { statut: true, semaineFin: true },
      })
    : [];

  const total = planifs.length;
  const traites = planifs.filter((p) => p.statut === "TRAITE").length;
  const couvertureProgramme = total > 0 ? traites / total : 0;

  // Décalage : chapitre dont la semaine de fin est dépassée et qui n'est
  // pas encore traité. Proxy déterministe du DECALAGE d'alerte-decalage.ts.
  // `maintenant` permet à la machine à remonter le temps de déplacer la
  // semaine « courante » pour la démonstration.
  const semaineCourante = annee
    ? semaineScolaire(maintenant, annee.dateDebut)
    : 0;
  const enDecalage = planifs.filter(
    (p) => p.statut !== "TRAITE" && p.semaineFin < semaineCourante
  ).length;
  const tauxDecalage = total > 0 ? enDecalage / total : 0;

  // Mastery moyenne sur l'ensemble des profils de l'année (tous sites du
  // périmètre). Pas de filtre temporel : masteryScore est l'état courant.
  const mastery = await prisma.studentLearningProfile.aggregate({
    _avg: { masteryScore: true },
    _count: true,
    where: {
      tenantId,
      ...siteFilterForModel("studentLearningProfile", claims),
    },
  });
  const masteryMoyenne = mastery._avg.masteryScore ?? 0;
  const masteryDisponible = mastery._count > 0;

  // Précision des prédictions vérifiées (predictionCorrecte non null).
  const [predTotal, predCorrectes] = annee
    ? await Promise.all([
        prisma.predictionDifficulte.count({
          where: {
            tenantId,
            anneeId: annee.id,
            predictionCorrecte: { not: null },
            ...siteFilterForModel("predictionDifficulte", claims),
          },
        }),
        prisma.predictionDifficulte.count({
          where: {
            tenantId,
            anneeId: annee.id,
            predictionCorrecte: true,
            ...siteFilterForModel("predictionDifficulte", claims),
          },
        }),
      ])
    : [0, 0];
  const precisionPrediction = predTotal > 0 ? predCorrectes / predTotal : 0;

  const composantes = {
    couvertureProgramme,
    tauxDecalage,
    masteryMoyenne,
    precisionPrediction,
  };

  const donneesInsuffisantes =
    total === 0 || !masteryDisponible || predTotal === 0;

  const valeur = clamp01(
    0.3 * couvertureProgramme +
      0.3 * (1 - tauxDecalage) +
      0.2 * masteryMoyenne +
      0.2 * precisionPrediction
  );

  return {
    code: "ISP",
    nom: "learnos.direction.isp",
    valeur,
    composantes,
    donneesInsuffisantes,
    explication:
      `${traites}/${total} chapitres traités, ${enDecalage} en décalage, ` +
      `mastery moyenne ${masteryMoyenne.toFixed(2)}, ` +
      `précision prédictions ${precisionPrediction.toFixed(2)}.`,
  };
}

// ------------------------------------------------------------
// 2. IEIS — Indice d'Équité Inter-Site
// ------------------------------------------------------------

/**
 * IEIS = 1 - (écart-type des moyennes entre sites / moyenne globale).
 *
 *  1 = parfaite équité, 0 = inégalité extrême.
 *  Si un seul site possède des bulletins, IEIS = 1 (rien à comparer).
 */
export async function calculerIEIS(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<IndiceComposite> {
  // Bulletin n'a pas de siteId propre : le rattachement passe par l'élève.
  const bulletins = await prisma.bulletin.findMany({
    where: {
      tenantId,
      moyenneGenerale: { not: null },
      ...siteFilterForModel("bulletin", claims),
    },
    select: {
      moyenneGenerale: true,
      eleve: { select: { siteId: true } },
    },
  });

  if (bulletins.length === 0) {
    return {
      code: "IEIS",
      nom: "learnos.direction.ieis",
      valeur: 0,
      composantes: {},
      donneesInsuffisantes: true,
      explication: "Aucun bulletin avec moyenne générale publié.",
    };
  }

  // Regrouper les moyennes par site (null = élèves non rattachés à un site).
  const parSite = new Map<string, number[]>();
  for (const b of bulletins) {
    const cle = b.eleve.siteId ?? "__sans_site__";
    const liste = parSite.get(cle);
    if (liste) liste.push(b.moyenneGenerale!);
    else parSite.set(cle, [b.moyenneGenerale!]);
  }

  // Un seul site (ou aucun rattachement) : rien à comparer → équité parfaite.
  if (parSite.size <= 1) {
    return {
      code: "IEIS",
      nom: "learnos.direction.ieis",
      valeur: 1,
      composantes: { nbSites: parSite.size },
      donneesInsuffisantes: false,
      explication: "Un seul site avec données : équité non mesurable (1).",
    };
  }

  const moyennesSite = Array.from(parSite.values()).map(
    (vals) => vals.reduce((a, b) => a + b, 0) / vals.length
  );
  const moyenneGlobale =
    bulletins.reduce((a, b) => a + (b.moyenneGenerale ?? 0), 0) /
    bulletins.length;

  if (moyenneGlobale === 0) {
    return {
      code: "IEIS",
      nom: "learnos.direction.ieis",
      valeur: 0,
      composantes: { nbSites: parSite.size, moyenneGlobale: 0 },
      donneesInsuffisantes: true,
      explication: "Moyenne globale nulle : ratio indéfini.",
    };
  }

  // Écart-type (population) des moyennes par site.
  const variance =
    moyennesSite.reduce((acc, m) => acc + (m - moyenneGlobale) ** 2, 0) /
    moyennesSite.length;
  const ecartType = Math.sqrt(variance);
  const ratio = ecartType / moyenneGlobale;
  const valeur = clamp01(1 - ratio);

  return {
    code: "IEIS",
    nom: "learnos.direction.ieis",
    valeur,
    composantes: {
      nbSites: parSite.size,
      moyenneGlobale,
      ecartType,
      ratio,
    },
    donneesInsuffisantes: false,
    explication:
      `${parSite.size} sites, écart-type ${ecartType.toFixed(2)} ` +
      `pour une moyenne globale ${moyenneGlobale.toFixed(2)} ` +
      `(ratio ${ratio.toFixed(2)}).`,
  };
}

// ------------------------------------------------------------
// 3. IVF — Indice de Viabilité Financière
// ------------------------------------------------------------

/**
 * IVF = 0.4×tauxRecouvrement + 0.3×(1-tauxImpayes) + 0.3×budgetRespecte
 *
 *  - tauxRecouvrement : SUM(paiements) / SUM(factures).
 *  - tauxImpayes      : COUNT(factures EN_RETARD) / COUNT(factures).
 *  - budgetRespecte   : COUNT(budgets dépense ≤ prévu) / COUNT(budgets).
 */
export async function calculerIVF(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<IndiceComposite> {
  // Factures + paiements associés (Paiement est rattaché au site via la
  // facture, mais on filtre ici sur la facture elle-même qui porte siteId).
  const factures = await prisma.facture.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("facture", claims),
    },
    select: {
      montant: true,
      statut: true,
      paiements: { select: { montant: true } },
    },
  });

  const totalFacture = factures.length;
  const montantFactureTotal = factures.reduce((a, f) => a + f.montant, 0);
  const montantPayeTotal = factures.reduce(
    (a, f) => a + f.paiements.reduce((x, p) => x + p.montant, 0),
    0
  );
  const tauxRecouvrement =
    montantFactureTotal > 0 ? montantPayeTotal / montantFactureTotal : 0;

  const impayes = factures.filter((f) => f.statut === "EN_RETARD").length;
  const tauxImpayes = totalFacture > 0 ? impayes / totalFacture : 0;

  // Budget porte une colonne `siteId` (null = budget global partagé
  // entre tous les sites). Le filtre par site est désormais géré par
  // `siteFilterForModel("budget", ...)` via SITE_PATHS.
  const budgets = await prisma.budget.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("budget", claims),
    },
    select: { montantPrevu: true, montantDepense: true },
  });
  const totalBudget = budgets.length;
  const budgetsRespectes = budgets.filter(
    (b) => b.montantDepense <= b.montantPrevu
  ).length;
  const budgetRespecte = totalBudget > 0 ? budgetsRespectes / totalBudget : 0;

  const composantes = {
    tauxRecouvrement: clamp01(tauxRecouvrement),
    tauxImpayes,
    budgetRespecte,
  };

  const donneesInsuffisantes = totalFacture === 0 && totalBudget === 0;

  const valeur = clamp01(
    0.4 * clamp01(tauxRecouvrement) +
      0.3 * (1 - tauxImpayes) +
      0.3 * budgetRespecte
  );

  return {
    code: "IVF",
    nom: "learnos.direction.ivf",
    valeur,
    composantes,
    donneesInsuffisantes,
    explication:
      `Recouvrement ${Math.round(tauxRecouvrement * 100)}%, ` +
      `${impayes}/${totalFacture} factures en retard, ` +
      `${budgetsRespectes}/${totalBudget} budgets respectés.`,
  };
}

// ------------------------------------------------------------
// 4. ICS — Indice de Climat Scolaire
// ------------------------------------------------------------

/**
 * ICS = 0.4×(1-tauxIncidents) + 0.3×(1-tauxAbsentéisme)
 *       + 0.3×(1-passagesInfirmerieParEleve)
 *
 * Période : du début de l'année scolaire à aujourd'hui.
 */
export async function calculerICS(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeId?: string,
  maintenant: Date = new Date()
): Promise<IndiceComposite> {
  const annee = await resoudreAnnee(tenantId, anneeId);
  const debut = annee?.dateDebut ?? new Date(0);
  // `maintenant` borne la période d'observation [debut, maintenant] pour
  // que la machine à remonter le temps puisse simuler un instant T.
  const finPeriode = maintenant;
  const joursPeriode = Math.max(
    1,
    Math.round((finPeriode.getTime() - debut.getTime()) / 86_400_000)
  );

  // Effectif actif du périmètre.
  const nbEleves = await prisma.eleve.count({
    where: {
      tenantId,
      statut: "ACTIF",
      deletedAt: null,
      ...siteFilterForModel("eleve", claims),
    },
  });

  // Période d'observation : [debut, maintenant] — on exclut les événements
  // postérieurs à la date simulée pour ne pas « voir l'avenir ».
  const periodeFilter = { date: { gte: debut, lte: finPeriode } };

  const [incidents, absencesInjustifiees, passages] = await Promise.all([
    prisma.incident.count({
      where: {
        tenantId,
        statut: { not: "CLASSE" },
        ...periodeFilter,
        ...siteFilterForModel("incident", claims),
      },
    }),
    prisma.absence.count({
      where: {
        tenantId,
        statut: "INJUSTIFIEE",
        ...periodeFilter,
        ...siteFilterForModel("absence", claims),
      },
    }),
    prisma.passageInfirmerie.count({
      where: {
        tenantId,
        ...periodeFilter,
        ...siteFilterForModel("passageInfirmerie", claims),
      },
    }),
  ]);

  // Normalisations : chaque taux est plafonné à 1 (au-delà, l'effet saturé).
  const tauxIncidents = nbEleves > 0 ? clamp01(incidents / nbEleves) : 0;
  const tauxAbsentéisme = nbEleves > 0
    ? clamp01(absencesInjustifiees / (nbEleves * joursPeriode))
    : 0;
  const passagesParEleve = nbEleves > 0 ? passages / nbEleves : 0;
  const passagesNormalise = clamp01(passagesParEleve);

  const composantes = {
    tauxIncidents,
    tauxAbsentéisme,
    passagesInfirmerieParEleve: passagesNormalise,
    nbEleves,
  };

  const donneesInsuffisantes = nbEleves === 0;

  const valeur = clamp01(
    0.4 * (1 - tauxIncidents) +
      0.3 * (1 - tauxAbsentéisme) +
      0.3 * (1 - passagesNormalise)
  );

  return {
    code: "ICS",
    nom: "learnos.direction.ics",
    valeur,
    composantes,
    donneesInsuffisantes,
    explication:
      `${incidents} incidents, ${absencesInjustifiees} absences injustifiées, ` +
      `${passages} passages infirmerie pour ${nbEleves} élèves ` +
      `sur ${joursPeriode} jours.`,
  };
}

// ------------------------------------------------------------
// 5. ROI Pédagogique
// ------------------------------------------------------------

/** Durée estimée d'un plan de progression, en heures. */
const HEURES_PAR_PLAN = 2;

/**
 * ROI = (Δ mastery moyen × nombre d'élèves touchés) / coût estimé.
 *
 *  - Δ mastery       : AVG(PlanProgression.masteryApres - masteryAvant)
 *                      WHERE statut = TERMINE.
 *  - élèves touchés  : COUNT DISTINCT eleveId dans ces plans.
 *  - coût estimé     : COUNT(plans) × tarifHoraire moyen (FicheRH) × 2h.
 *
 * Retourne `null` si aucune donnée ne permet le calcul.
 *
 * NB : le ROI n'est PAS borné à [0,1] — un rendement > 1 signifie que le
 * gain pédagogique dépasse le coût estimé (excellent).
 */
export async function calculerROIPedagogique(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<IndiceComposite | null> {
  const plans = await prisma.planProgression.findMany({
    where: {
      tenantId,
      statut: "TERMINE",
      masteryAvant: { not: null },
      masteryApres: { not: null },
      ...siteFilterForModel("planProgression", claims),
    },
    select: { eleveId: true, masteryAvant: true, masteryApres: true },
  });

  if (plans.length === 0) return null;

  const deltaMoyen =
    plans.reduce((a, p) => a + ((p.masteryApres ?? 0) - (p.masteryAvant ?? 0)), 0) /
    plans.length;

  const elevesTouchees = new Set(plans.map((p) => p.eleveId)).size;

  // Tarif horaire moyen du personnel (vacataires surtout).
  const tarif = await prisma.ficheRH.aggregate({
    _avg: { tarifHoraire: true },
    _count: true,
    where: {
      tenantId,
      tarifHoraire: { not: null },
      ...siteFilterForModel("ficheRH", claims),
    },
  });
  const tarifHoraireMoyen = tarif._avg.tarifHoraire ?? 0;

  if (tarifHoraireMoyen <= 0) {
    // Sans coût de référence, le ratio n'a pas de sens.
    return {
      code: "ROI",
      nom: "learnos.direction.roi",
      valeur: 0,
      composantes: { deltaMoyen, elevesTouchees, nbPlans: plans.length },
      donneesInsuffisantes: true,
      explication:
        "Aucun tarif horaire renseigné dans les fiches RH : coût non estimable.",
    };
  }

  const coutEstime = plans.length * tarifHoraireMoyen * HEURES_PAR_PLAN;
  const roi = coutEstime > 0 ? (deltaMoyen * elevesTouchees) / coutEstime : 0;

  return {
    code: "ROI",
    nom: "learnos.direction.roi",
    valeur: roi,
    composantes: {
      deltaMoyen,
      elevesTouchees,
      nbPlans: plans.length,
      tarifHoraireMoyen,
      coutEstime,
    },
    donneesInsuffisantes: false,
    explication:
      `Δ mastery ${deltaMoyen.toFixed(2)} × ${elevesTouchees} élèves ` +
      `/ coût ${coutEstime.toFixed(0)} = ROI ${roi.toFixed(3)}.`,
  };
}

// ------------------------------------------------------------
// 6. Vitesse d'Apprentissage
// ------------------------------------------------------------

/**
 * Vitesse = Δ mastery / Δ temps, par élève et par compétence.
 *
 * `StudentLearningProfile` ne conserve qu'un état courant (pas d'historique
 * des masteryScore successifs). La véritable série temporelle disponible
 * est `LearningEvidence` : pour chaque paire (élève, compétence) ayant au
 * moins deux preuves, la vitesse est la pente entre la première et la
 * dernière preuve : (masterySignal_final - masterySignal_initial) / jours.
 *
 * Retourne la moyenne globale + distribution (min, max, médiane).
 */
export async function calculerVitesseApprentissage(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<VitesseApprentissage> {
  // On ne retient que les preuves rattachées à une compétence : sans elle,
  // la granularité est « matière » et la comparaison temporelle perd son sens.
  const evidences = await prisma.learningEvidence.findMany({
    where: {
      tenantId,
      competenceId: { not: null },
      ...siteFilterForModel("learningEvidence", claims),
    },
    select: {
      eleveId: true,
      competenceId: true,
      masterySignal: true,
      occurredAt: true,
    },
    orderBy: { occurredAt: "asc" },
  });

  // Regrouper par (élève, compétence) en conservant l'ordre chronologique.
  const groupes = new Map<string, { signal: number; date: Date }[]>();
  for (const e of evidences) {
    const cle = `${e.eleveId}|${e.competenceId}`;
    const liste = groupes.get(cle);
    if (liste) liste.push({ signal: e.masterySignal, date: e.occurredAt });
    else groupes.set(cle, [{ signal: e.masterySignal, date: e.occurredAt }]);
  }

  const vitesses: number[] = [];
  const MS_PAR_JOUR = 86_400_000;
  for (const liste of groupes.values()) {
    if (liste.length < 2) continue;
    const premiere = liste[0];
    const derniere = liste[liste.length - 1];
    const deltaJours =
      (derniere.date.getTime() - premiere.date.getTime()) / MS_PAR_JOUR;
    if (deltaJours <= 0) continue;
    const deltaMastery = derniere.signal - premiere.signal;
    vitesses.push(deltaMastery / deltaJours);
  }

  if (vitesses.length === 0) {
    return {
      moyenne: null,
      min: null,
      max: null,
      mediane: null,
      nbEchantillons: 0,
      donneesInsuffisantes: true,
    };
  }

  return {
    moyenne: vitesses.reduce((a, b) => a + b, 0) / vitesses.length,
    min: Math.min(...vitesses),
    max: Math.max(...vitesses),
    mediane: mediane(vitesses),
    nbEchantillons: vitesses.length,
    donneesInsuffisantes: false,
  };
}

// ------------------------------------------------------------
// 7. IRO — Indice de Résilience Opérationnelle
// ------------------------------------------------------------

/**
 * IRO = tauxCouvertureRemplacements × (1 - tauxCreneauxOrphelins)
 *
 *  - tauxCouvertureRemplacements : COUNT(RemplacementCours VALIDE/EFFECTUE)
 *                                  / COUNT(AbsencePersonnel).
 *  - tauxCreneauxOrphelins       : COUNT(absences sans remplacement couvert)
 *                                  / COUNT(AbsencePersonnel).
 *
 * Période : année scolaire en cours.
 */
export async function calculerIRO(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeId?: string,
  maintenant: Date = new Date()
): Promise<IndiceComposite> {
  const annee = await resoudreAnnee(tenantId, anneeId);
  const debut = annee?.dateDebut ?? new Date(0);
  // Période d'observation bornée à `maintenant` pour la machine à remonter
  // le temps : on ne compte que les événements déjà « arrivés » à la date
  // simulée.
  const periode = { date: { gte: debut, lte: maintenant } };

  const [absencesPersonnel, remplacementsCouverts, remplacementsTotal] =
    await Promise.all([
      prisma.absencePersonnel.count({
        where: {
          tenantId,
          ...periode,
          ...siteFilterForModel("absencePersonnel", claims),
        },
      }),
      prisma.remplacementCours.count({
        where: {
          tenantId,
          ...periode,
          statut: { in: ["VALIDE", "EFFECTUE"] },
          ...siteFilterForModel("remplacementCours", claims),
        },
      }),
      prisma.remplacementCours.count({
        where: {
          tenantId,
          ...periode,
          ...siteFilterForModel("remplacementCours", claims),
        },
      }),
    ]);

  if (absencesPersonnel === 0) {
    return {
      code: "IRO",
      nom: "learnos.direction.iro",
      valeur: 0,
      composantes: {},
      donneesInsuffisantes: true,
      explication: "Aucune absence de personnel enregistrée sur la période.",
    };
  }

  const tauxCouverture = clamp01(remplacementsCouverts / absencesPersonnel);
  const orphelins = Math.max(0, absencesPersonnel - remplacementsCouverts);
  const tauxCreneauxOrphelins = orphelins / absencesPersonnel;

  const valeur = clamp01(tauxCouverture * (1 - tauxCreneauxOrphelins));

  return {
    code: "IRO",
    nom: "learnos.direction.iro",
    valeur,
    composantes: {
      tauxCouvertureRemplacements: tauxCouverture,
      tauxCreneauxOrphelins,
      absencesPersonnel,
      remplacementsCouverts,
      remplacementsTotal,
    },
    donneesInsuffisantes: false,
    explication:
      `${remplacementsCouverts}/${absencesPersonnel} absences couvertes, ` +
      `${orphelins} créneaux orphelins.`,
  };
}

// ------------------------------------------------------------
// Agrégation — Tableau de bord du directeur
// ------------------------------------------------------------

/**
 * Calcule les sept indices en parallèle et renvoie le tableau complet.
 *
 * Le score `santeGlobale` est la moyenne des indices bornés disponibles
 * (ISP, IEIS, IVF, ICS, IRO, et ROI si présent — le ROI étant non borné,
 * il est borné à [0,1] pour cette agrégation afin de ne pas écraser les
 * autres). La vitesse d'apprentissage, qui est une distribution et non un
 * score de santé, n'entre pas dans la moyenne.
 */
export async function tableauIntelligenceDirecteur(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeId?: string,
  maintenant: Date = new Date()
): Promise<TableauIntelligence> {
  const [isp, ieis, ivf, ics, roi, vitesse, iro] = await Promise.all([
    calculerISP(tenantId, claims, anneeId, maintenant),
    calculerIEIS(tenantId, claims),
    calculerIVF(tenantId, claims),
    calculerICS(tenantId, claims, anneeId, maintenant),
    calculerROIPedagogique(tenantId, claims),
    calculerVitesseApprentissage(tenantId, claims),
    calculerIRO(tenantId, claims, anneeId, maintenant),
  ]);

  // Score global : moyenne des indices bornés. Le ROI est plafonné à 1 pour
  // l'agrégation (un ROI > 1 reste « excellent », donc 1 suffit ici).
  const indices = [isp, ieis, ivf, ics, iro];
  if (roi) indices.push({ ...roi, valeur: clamp01(roi.valeur) });
  const santeGlobale =
    indices.reduce((a, i) => a + i.valeur, 0) / indices.length;

  const annee = await resoudreAnnee(tenantId, anneeId);

  return {
    isp,
    ieis,
    ivf,
    ics,
    roiPedagogique: roi,
    vitesseApprentissage: vitesse,
    iro,
    santeGlobale: clamp01(santeGlobale),
    anneeId: annee?.id ?? null,
    // `calculeLe` reflète la date simulée pour que l'UI affiche l'instant
    // « logique » du calcul, pas l'horloge machine.
    calculeLe: maintenant.toISOString(),
  };
}
