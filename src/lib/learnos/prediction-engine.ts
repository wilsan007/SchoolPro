/**
 * EcolPro / LEARNOS — Moteur de prédiction des difficultés
 * ==========================================================
 *
 * CE QUE FAIT CE MODULE
 * ---------------------
 * Avant qu'un chapitre ne démarre, le système émet pour chaque élève une
 * prédiction : « cet élève a X% de chances de réussir cette compétence ».
 *
 * La prédiction combine :
 *   1. Le profil actuel de l'élève (masteryScore, confidence)
 *   2. Les prérequis manquants (plus il en manque, plus le risque est élevé)
 *   3. Les patterns historiques (les élèves de ce niveau ont en moyenne X
 *      sur cette compétence)
 *   4. La tendance de l'élève (son score monte-t-il ou baisse-t-il ?)
 *
 * LA BOUCLE D'APPRENTISSAGE
 * --------------------------
 * Une fois le chapitre traité et les résultats enregistrés, on compare la
 * prédiction à la réalité :
 *   - Si la prédiction était correcte (à ±0.15 près) → `predictionCorrecte = true`
 *   - Sinon → on enregistre l'écart, et le système sait qu'il doit ajuster
 *
 * C'est cette boucle qui permet au système de SAVOIR s'il prédit bien ou
 * mal, et de s'améliorer : les patterns historiques sont recalculés avec
 * les nouvelles données, et les seuils sont recalibrés.
 *
 * AUCUN LLM
 * ----------
 * La prédiction est un calcul déterministe : pondération de signaux. Un LLM
 * ne ferait qu'ajouter du bruit et de l'opacité sur une décision qui doit
 * être explicable.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

/** Seuil de tolérance pour qu'une prédiction soit considérée correcte. */
const TOLERANCE_PREDICTION = 0.15;

export type DifficultePredite = "FACILE" | "MODERE" | "DIFFICILE" | "CRITIQUE";

export interface PredictionEleve {
  eleveId: string;
  competenceId: string;
  chapitreId: string | null;
  anneeId: string;
  probaReussite: number;
  difficultePredite: DifficultePredite;
  masteryAvant: number | null;
  confidenceAvant: number | null;
  prerequisManquants: number;
  /** Facteurs qui ont influencé la prédiction — pour l'explicabilité. */
  facteurs: {
    profil: number;
    prerequis: number;
    patternHistorique: number | null;
    tendance: number;
  };
}

export interface ResultatPrediction {
  predictions: PredictionEleve[];
  predictionsEmises: number;
}

/**
 * Émet des prédictions pour tous les élèves d'un niveau, sur les compétences
 * d'un chapitre qui va démarrer.
 *
 * @param tenantId  Le tenant.
 * @param claims    Les claims de l'appelant (pour le périmètre site).
 * @param chapitreId  Le chapitre qui va démarrer.
 * @param anneeId   L'année scolaire courante.
 */
export async function predirePourChapitre(
  tenantId: string,
  claims: SessionSiteClaims,
  chapitreId: string,
  anneeId: string
): Promise<ResultatPrediction> {
  // 1. Charger le chapitre et ses compétences.
  const chapitre = await prisma.chapitre.findFirst({
    where: { id: chapitreId, tenantId, ...siteFilterForModel("chapitre", claims) },
    select: {
      id: true,
      niveau: true,
      matiereId: true,
      competences: {
        select: { id: true, code: true, libelle: true, prerequis: { select: { id: true } } },
      },
    },
  });
  if (!chapitre) return { predictions: [], predictionsEmises: 0 };

  // 2. Charger les élèves du niveau correspondant.
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      statut: "ACTIF",
      deletedAt: null,
      ...siteFilterForModel("eleve", claims),
      classe: { niveau: chapitre.niveau },
    },
    select: { id: true },
  });

  if (eleves.length === 0) return { predictions: [], predictionsEmises: 0 };

  // 3. Charger les profils d'apprentissage de ces élèves.
  const competenceIds = chapitre.competences.map((c) => c.id);
  const prereqIds = new Set(
    chapitre.competences.flatMap((c) => c.prerequis.map((p) => p.id))
  );
  const tousIds = new Set([...competenceIds, ...prereqIds]);

  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("studentLearningProfile", claims),
      eleveId: { in: eleves.map((e) => e.id) },
      competenceId: { in: [...tousIds] },
    },
    select: {
      eleveId: true,
      competenceId: true,
      masteryScore: true,
      confidenceScore: true,
      trend: true,
    },
  });

  // Index : eleveId → competenceId → profil
  const profilIndex = new Map<string, Map<string, (typeof profils)[number]>>();
  for (const p of profils) {
    let m = profilIndex.get(p.eleveId);
    if (!m) {
      m = new Map();
      profilIndex.set(p.eleveId, m);
    }
    m.set(p.competenceId, p);
  }

  // 4. Charger les patterns historiques pour ce niveau × matière.
  const patterns = await prisma.patternPedagogique.findMany({
    where: {
      tenantId,
      niveau: chapitre.niveau,
      matiereId: chapitre.matiereId,
      competenceId: { in: competenceIds },
    },
    select: {
      competenceId: true,
      masteryMoyenne: true,
      tauxEchec: true,
      effectif: true,
    },
  });
  const patternIndex = new Map(patterns.map((p) => [p.competenceId, p]));

  // 5. Émettre une prédiction par élève × compétence.
  const predictions: PredictionEleve[] = [];

  for (const eleve of eleves) {
    const profilsEleve = profilIndex.get(eleve.id) ?? new Map();

    for (const comp of chapitre.competences) {
      const profil = profilsEleve.get(comp.id);
      const masteryAvant = profil?.masteryScore ?? null;
      const confidenceAvant = profil?.confidenceScore ?? null;
      const tendance = profil?.trend ?? "STABLE";

      // Compter les prérequis manquants.
      let prerequisManquants = 0;
      for (const prereq of comp.prerequis) {
        const p = profilsEleve.get(prereq.id);
        if (!p || p.masteryScore < 0.35) prerequisManquants++;
      }

      // Calculer la probabilité de réussite.
      const facteurs = {
        profil: masteryAvant ?? 0.5, // Inconnu → neutre
        prerequis: 1 - Math.min(prerequisManquants / Math.max(comp.prerequis.length, 1), 1) * 0.4,
        patternHistorique: patternIndex.get(comp.id)?.masteryMoyenne ?? null,
        tendance: tendance === "UP" ? 0.05 : tendance === "DOWN" ? -0.05 : 0,
      };

      // Pondération : profil (40%) + prérequis (30%) + pattern (20%) + tendance (10%)
      let proba = facteurs.profil * 0.4 + facteurs.prerequis * 0.3;
      if (facteurs.patternHistorique !== null) {
        proba += facteurs.patternHistorique * 0.2;
      } else {
        proba += facteurs.profil * 0.2; // Sans historique, le profil pèse plus
      }
      proba += facteurs.tendance;
      proba = Math.max(0, Math.min(1, proba));

      const difficultePredite = classifierDifficulte(proba, prerequisManquants);

      predictions.push({
        eleveId: eleve.id,
        competenceId: comp.id,
        chapitreId: chapitre.id,
        anneeId,
        probaReussite: proba,
        difficultePredite,
        masteryAvant,
        confidenceAvant,
        prerequisManquants,
        facteurs,
      });
    }
  }

  // 6. Persister les prédictions.
  if (predictions.length > 0) {
    await prisma.predictionDifficulte.createMany({
      data: predictions.map((p) => ({
        tenantId,
        siteId: claims.siteId ?? null,
        eleveId: p.eleveId,
        competenceId: p.competenceId,
        chapitreId: p.chapitreId,
        anneeId: p.anneeId,
        probaReussite: p.probaReussite,
        difficultePredite: p.difficultePredite,
        masteryAvant: p.masteryAvant,
        confidenceAvant: p.confidenceAvant,
        prerequisManquants: p.prerequisManquants,
      })),
    });
  }

  // 7. Tracer dans le journal.
  await prisma.journalApprentissage.create({
    data: {
      tenantId,
      siteId: claims.siteId ?? null,
      typeAnalyse: "prediction",
      resume: `${predictions.length} prédiction(s) émise(s) pour ${eleves.length} élève(s) sur ${competenceIds.length} compétence(s).`,
      detail: JSON.stringify({
        chapitre: chapitreId,
        distribution: compterParDifficulte(predictions),
      }),
      echantillon: predictions.length,
      perimetre: `chapitre=${chapitreId}`,
    },
  });

  return { predictions, predictionsEmises: predictions.length };
}

/**
 * Vérifie les prédictions passées contre les résultats réels.
 *
 * C'est la boucle d'apprentissage : on regarde les prédictions émises avant
 * un chapitre, on compare avec le masteryScore final, et on enregistre si
 * la prédiction était correcte. Cette donnée alimente ensuite la calibration
 * des seuils.
 */
export async function verifierPredictions(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeId: string
): Promise<{ verifiees: number; correctes: number; tauxPrecision: number }> {
  // Charger les prédictions non vérifiées.
  const predictions = await prisma.predictionDifficulte.findMany({
    where: {
      tenantId,
      anneeId,
      verifieeLe: null,
      ...siteFilterForModel("predictionDifficulte", claims),
    },
    select: { id: true, eleveId: true, competenceId: true, probaReussite: true },
  });

  if (predictions.length === 0) {
    return { verifiees: 0, correctes: 0, tauxPrecision: 0 };
  }

  // Charger les profils actuels (qui incluent les résultats du chapitre).
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("studentLearningProfile", claims),
      eleveId: { in: predictions.map((p) => p.eleveId) },
      competenceId: { in: predictions.map((p) => p.competenceId) },
    },
    select: { eleveId: true, competenceId: true, masteryScore: true },
  });

  const profilIndex = new Map(
    profils.map((p) => [`${p.eleveId}|${p.competenceId}`, p.masteryScore])
  );

  let verifiees = 0;
  let correctes = 0;

  for (const pred of predictions) {
    const masteryApres = profilIndex.get(`${pred.eleveId}|${pred.competenceId}`);
    if (masteryApres === undefined) continue; // Pas encore de résultat

    const ecart = Math.abs(masteryApres - pred.probaReussite);
    const estCorrecte = ecart <= TOLERANCE_PREDICTION;

    await prisma.predictionDifficulte.update({
      where: { id: pred.id },
      data: {
        masteryApres,
        predictionCorrecte: estCorrecte,
        ecart,
        verifieeLe: new Date(),
      },
    });

    verifiees++;
    if (estCorrecte) correctes++;
  }

  const tauxPrecision = verifiees > 0 ? correctes / verifiees : 0;

  // Tracer dans le journal.
  if (verifiees > 0) {
    await prisma.journalApprentissage.create({
      data: {
        tenantId,
        siteId: claims.siteId ?? null,
        typeAnalyse: "verification_predictions",
        resume: `${verifiees} prédiction(s) vérifiée(s). Précision : ${(tauxPrecision * 100).toFixed(1)}%.`,
        detail: JSON.stringify({ verifiees, correctes, tauxPrecision }),
        echantillon: verifiees,
        perimetre: `annee=${anneeId}`,
      },
    });
  }

  return { verifiees, correctes, tauxPrecision };
}

/**
 * Classe une probabilité de réussite en niveau de difficulté.
 *
 * La classification tient compte des prérequis manquants : un élève avec
 * 60% de probabilité mais 3 prérequis manquants est plus à risque que
 * un élève avec 60% et 0 prérequis manquant.
 */
function classifierDifficulte(proba: number, prerequisManquants: number): DifficultePredite {
  // Ajustement : chaque prérequis manquant baisse la probabilité effective.
  const probaAjustee = proba - prerequisManquants * 0.05;

  if (probaAjustee >= 0.75) return "FACILE";
  if (probaAjustee >= 0.55) return "MODERE";
  if (probaAjustee >= 0.35) return "DIFFICILE";
  return "CRITIQUE";
}

function compterParDifficulte(predictions: PredictionEleve[]): Record<DifficultePredite, number> {
  return predictions.reduce(
    (acc, p) => {
      acc[p.difficultePredite]++;
      return acc;
    },
    { FACILE: 0, MODERE: 0, DIFFICILE: 0, CRITIQUE: 0 } as Record<DifficultePredite, number>
  );
}
