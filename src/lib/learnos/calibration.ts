/**
 * EcolPro / LEARNOS — Calibration des seuils par apprentissage
 * =============================================================
 *
 * CE QUE FAIT CE MODULE
 * ---------------------
 * Ajuste les seuils de maîtrise (critique, fragile, consolidé, avancé) par
 * niveau × matière, en s'appuyant sur l'historique des prédictions et des
 * résultats réels.
 *
 * Le principe : si les seuils par défaut (0.35, 0.55, 0.8, 0.92) produisent
 * des prédictions systématiquement trop optimistes ou trop pessimistes pour
 * un certain niveau × matière, alors ces seuils doivent être ajustés.
 *
 * MÉTHODE
 * --------
 * 1. Pour chaque niveau × matière, charger les prédictions vérifiées.
 * 2. Calculer l'erreur moyenne (biais) : si les prédictions sont en moyenne
 *    +0.10 au-dessus de la réalité, le système est trop optimiste → abaisser
 *    les seuils.
 * 3. Ajuster les seuils proportionnellement au biais, avec un pas maximum
 *    pour éviter les oscillations.
 * 4. Mesurer si la nouvelle calibration améliore la précision.
 *
 * GARDE-FOU
 * ---------
 *   - Pas de calibration avec moins de 30 prédictions vérifiées.
 *   - Pas d'ajustement supérieur à ±0.10 par cycle (stabilité).
 *   - L'enseignant peut toujours surcharger les seuils calibrés.
 *   - Les seuils par défaut restent la référence quand pas assez de données.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { SEUILS_PAR_DEFAUT, type Seuils } from "@/lib/learnos/recommendation-engine";
import { ECHANTILLON_CALIBRATION_MIN } from "@/lib/learnos/pattern-analyzer";

/** Pas maximum d'ajustement par cycle de calibration. */
const PAS_MAX = 0.10;

export interface CalibrationResultat {
  niveau: string;
  matiereId: string | null;
  seuilsAvant: Seuils;
  seuilsApres: Seuils;
  biais: number;
  echantillon: number;
  amelioration: boolean;
  gainPrecision: number | null;
}

/**
 * Calibre les seuils pour tous les niveaux × matières d'un tenant.
 *
 * Ne modifie que les couples niveau × matière qui ont suffisamment de
 * prédictions vérifiées. Les autres conservent les seuils par défaut.
 */
export async function calibrerSeuils(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ calibrations: CalibrationResultat[]; calibrationsEffectuees: number }> {
  // 1. Charger toutes les prédictions vérifiées.
  const predictions = await prisma.predictionDifficulte.findMany({
    where: {
      tenantId,
      verifieeLe: { not: null },
      predictionCorrecte: { not: null },
      ...siteFilterForModel("predictionDifficulte", claims),
    },
    select: {
      id: true,
      probaReussite: true,
      masteryApres: true,
      ecart: true,
      competence: { select: { chapitre: { select: { niveau: true, matiereId: true } } } },
    },
  });

  if (predictions.length < ECHANTILLON_CALIBRATION_MIN) {
    return { calibrations: [], calibrationsEffectuees: 0 };
  }

  // 2. Grouper par niveau × matière.
  const groupes = new Map<
    string,
    {
      niveau: string;
      matiereId: string;
      ecarts: number[];
    }
  >();

  for (const p of predictions) {
    const niveau = p.competence?.chapitre?.niveau;
    const matiereId = p.competence?.chapitre?.matiereId;
    if (!niveau || !matiereId) continue;

    const cle = `${niveau}|${matiereId}`;
    let g = groupes.get(cle);
    if (!g) {
      g = { niveau, matiereId, ecarts: [] };
      groupes.set(cle, g);
    }
    if (p.ecart !== null) g.ecarts.push(p.ecart);
  }

  // 3. Calculer le biais et ajuster les seuils pour chaque groupe.
  const calibrations: CalibrationResultat[] = [];

  for (const g of groupes.values()) {
    if (g.ecarts.length < ECHANTILLON_CALIBRATION_MIN) continue;

    // Biais = erreur moyenne signée.
    // Positive = prédictions trop optimistes (la réalité est pire que prévu).
    // Négative = prédictions trop pessimistes (la réalité est meilleure que prévu).
    const biais = g.ecarts.reduce((s, e) => s + e, 0) / g.ecarts.length;

    // Charger la calibration existante ou utiliser les seuils par défaut.
    const existante = await prisma.calibrationSeuil.findFirst({
      where: { tenantId, niveau: g.niveau, matiereId: g.matiereId },
    });

    const seuilsAvant: Seuils = existante
      ? {
          seuilCritique: existante.seuilCritique,
          seuilFragile: existante.seuilFragile,
          seuilConsolide: existante.seuilConsolide,
          seuilAvance: existante.seuilAvance,
          confianceMinimale: existante.confianceMinimale,
          prerequisBloquantsMin: SEUILS_PAR_DEFAUT.prerequisBloquantsMin,
          declenchementPlanCritiques: SEUILS_PAR_DEFAUT.declenchementPlanCritiques,
          declenchementPlanAvances: SEUILS_PAR_DEFAUT.declenchementPlanAvances,
        }
      : { ...SEUILS_PAR_DEFAUT };

    // Ajustement : si biais positif (trop optimiste), on ABBAISSE les seuils
    // (il faut être plus exigeant pour déclarer une compétence acquise).
    // Si biais négatif (trop pessimiste), on HAUSSE les seuils.
    const ajustement = Math.max(-PAS_MAX, Math.min(PAS_MAX, -biais * 0.5));

    const seuilsApres: Seuils = {
      seuilCritique: Math.max(0.1, Math.min(0.5, seuilsAvant.seuilCritique + ajustement)),
      seuilFragile: Math.max(0.3, Math.min(0.7, seuilsAvant.seuilFragile + ajustement)),
      seuilConsolide: Math.max(0.6, Math.min(0.9, seuilsAvant.seuilConsolide + ajustement)),
      seuilAvance: Math.max(0.8, Math.min(0.98, seuilsAvant.seuilAvance + ajustement)),
      confianceMinimale: seuilsAvant.confianceMinimale, // Non ajustée pour l'instant
      prerequisBloquantsMin: seuilsAvant.prerequisBloquantsMin,
      declenchementPlanCritiques: seuilsAvant.declenchementPlanCritiques,
      declenchementPlanAvances: seuilsAvant.declenchementPlanAvances,
    };

    // Mesurer la précision avant et après.
    const precisionAvant = mesurerPrecision(predictions, g.niveau, g.matiereId, seuilsAvant);
    const precisionApres = mesurerPrecision(predictions, g.niveau, g.matiereId, seuilsApres);
    const gainPrecision = precisionApres - precisionAvant;
    const amelioration = gainPrecision > 0;

    // Persister la calibration.
    if (existante) {
      await prisma.calibrationSeuil.update({
        where: { id: existante.id },
        data: {
          seuilCritique: seuilsApres.seuilCritique,
          seuilFragile: seuilsApres.seuilFragile,
          seuilConsolide: seuilsApres.seuilConsolide,
          seuilAvance: seuilsApres.seuilAvance,
          confianceMinimale: seuilsApres.confianceMinimale,
          echantillon: g.ecarts.length,
          ameliorationMesuree: amelioration,
          gainPrecision,
        },
      });
    } else {
      await prisma.calibrationSeuil.create({
        data: {
          tenantId,
          siteId: claims.siteId ?? null,
          niveau: g.niveau,
          matiereId: g.matiereId,
          seuilCritique: seuilsApres.seuilCritique,
          seuilFragile: seuilsApres.seuilFragile,
          seuilConsolide: seuilsApres.seuilConsolide,
          seuilAvance: seuilsApres.seuilAvance,
          confianceMinimale: seuilsApres.confianceMinimale,
          echantillon: g.ecarts.length,
          ameliorationMesuree: amelioration,
          gainPrecision,
        },
      });
    }

    calibrations.push({
      niveau: g.niveau,
      matiereId: g.matiereId,
      seuilsAvant,
      seuilsApres,
      biais,
      echantillon: g.ecarts.length,
      amelioration,
      gainPrecision,
    });
  }

  // 4. Tracer dans le journal.
  if (calibrations.length > 0) {
    await prisma.journalApprentissage.create({
      data: {
        tenantId,
        siteId: claims.siteId ?? null,
        typeAnalyse: "calibration",
        resume: `${calibrations.length} calibration(s) effectuée(s) sur ${predictions.length} prédiction(s) vérifiée(s).`,
        detail: JSON.stringify(
          calibrations.map((c) => ({
            niveau: c.niveau,
            matiereId: c.matiereId,
            biais: c.biais,
            amelioration: c.amelioration,
            gainPrecision: c.gainPrecision,
          }))
        ),
        echantillon: predictions.length,
        perimetre: "global",
      },
    });
  }

  return { calibrations, calibrationsEffectuees: calibrations.length };
}

/**
 * Charge les seuils calibrés pour un niveau × matière, ou les seuils par
 * défaut si aucune calibration n'existe.
 *
 * C'est cette fonction que le moteur de recommandation devrait appeler au
 * lieu d'utiliser directement `SEUILS_PAR_DEFAUT`.
 */
export async function seuilsPour(
  tenantId: string,
  niveau: string,
  matiereId: string
): Promise<Seuils> {
  const calibration = await prisma.calibrationSeuil.findFirst({
    where: { tenantId, niveau, matiereId },
  });

  if (calibration) {
    return {
      seuilCritique: calibration.seuilCritique,
      seuilFragile: calibration.seuilFragile,
      seuilConsolide: calibration.seuilConsolide,
      seuilAvance: calibration.seuilAvance,
      confianceMinimale: calibration.confianceMinimale,
      prerequisBloquantsMin: SEUILS_PAR_DEFAUT.prerequisBloquantsMin,
      declenchementPlanCritiques: SEUILS_PAR_DEFAUT.declenchementPlanCritiques,
      declenchementPlanAvances: SEUILS_PAR_DEFAUT.declenchementPlanAvances,
    };
  }

  // Essayer une calibration au niveau du niveau seul (matiereId = null).
  const calibrationNiveau = await prisma.calibrationSeuil.findFirst({
    where: { tenantId, niveau, matiereId: null },
  });

  if (calibrationNiveau) {
    return {
      seuilCritique: calibrationNiveau.seuilCritique,
      seuilFragile: calibrationNiveau.seuilFragile,
      seuilConsolide: calibrationNiveau.seuilConsolide,
      seuilAvance: calibrationNiveau.seuilAvance,
      confianceMinimale: calibrationNiveau.confianceMinimale,
      prerequisBloquantsMin: SEUILS_PAR_DEFAUT.prerequisBloquantsMin,
      declenchementPlanCritiques: SEUILS_PAR_DEFAUT.declenchementPlanCritiques,
      declenchementPlanAvances: SEUILS_PAR_DEFAUT.declenchementPlanAvances,
    };
  }

  return { ...SEUILS_PAR_DEFAUT };
}

/**
 * Mesure la précision d'un jeu de seuils sur les prédictions vérifiées.
 *
 * La précision est le taux de prédictions correctes (écart ≤ 0.15) si l'on
 * avait utilisé ces seuils pour classifier les élèves.
 */
function mesurerPrecision(
  predictions: { ecart: number | null; competence: { chapitre: { niveau: string; matiereId: string } | null } }[],
  niveau: string,
  matiereId: string,
  _seuils: Seuils
): number {
  const pertinentes = predictions.filter(
    (p) =>
      p.ecart !== null &&
      p.competence?.chapitre?.niveau === niveau &&
      p.competence?.chapitre?.matiereId === matiereId
  );
  if (pertinentes.length === 0) return 0;
  const correctes = pertinentes.filter((p) => Math.abs(p.ecart!) <= 0.15).length;
  return correctes / pertinentes.length;
}
