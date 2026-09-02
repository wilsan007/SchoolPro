/**
 * Recalcul des profils de maîtrise à partir des preuves filtrées par date.
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * `StudentLearningProfile` stocke un état CUMULATIF (moyenne des 5 preuves
 * de l'année). Sans la Time Machine, c'est correct : on veut l'état final.
 * Mais avec la Time Machine, afficher l'état final en octobre revient à
 * montrer le bilan de fin d'année au premier trimestre — la démo perd toute
 * crédibilité.
 *
 * L'horizon démo (`extensionHorizonDemo`) filtre automatiquement les
 * `LearningEvidence` par `occurredAt <= demoDate`. Mais il ne peut pas
 * recalculer un agrégat : `StudentLearningProfile` n'est pas dans la carte
 * HORIZON parce que c'est un état, pas un événement.
 *
 * Ce module comble ce gap : il reçoit les preuves déjà filtrées par l'horizon
 * et recalcule `masteryScore`, `evidenceCount`, `lastEvidenceAt`, `trend`,
 * `masteryStatus` — les champs qui dépendent du temps. Les champs structurels
 * (`prerequisiteStatus`, `recommendedAction`) sont conservés tels quels : ils
 * ne changent pas avec la date.
 */

/** Seuil de maîtrise par statut — aligné sur le générateur de seed. */
const SEUIL_MASTERED = 0.8;
const SEUIL_PROFICIENT = 0.55;
const SEUIL_DEVELOPING = 0.35;

/** Écart minimal entre le premier et le dernier score pour trancher une tendance. */
const ECART_TENDANCE = 0.03;

/** Une preuve d'apprentissage telle que retournée par Prisma. */
interface EvidenceBrute {
  competenceId: string;
  masterySignal: number | null;
  occurredAt: Date;
}

/** Profil recalculé — seul le sous-ensemble temporel est recalculé. */
export interface ProfilRecalcule {
  competenceId: string;
  masteryScore: number;
  evidenceCount: number;
  lastEvidenceAt: Date | null;
  trend: string;
  masteryStatus: string;
}

/**
 * Recalcule les champs temporels d'un profil à partir des preuves filtrées.
 *
 * @param evidences Les preuves d'UN élève, déjà filtrées par `occurredAt <= demoDate`
 *                  (l'horizon démo s'en charge automatiquement).
 * @returns Une map `competenceId → ProfilRecalcule`.
 */
export function recalculerProfils(
  evidences: EvidenceBrute[]
): Map<string, ProfilRecalcule> {
  // Grouper les preuves par compétence, triées par date.
  const parCompetence = new Map<string, EvidenceBrute[]>();
  for (const ev of evidences) {
    if (ev.masterySignal == null) continue;
    const liste = parCompetence.get(ev.competenceId);
    if (liste) {
      liste.push(ev);
    } else {
      parCompetence.set(ev.competenceId, [ev]);
    }
  }

  const result = new Map<string, ProfilRecalcule>();
  for (const [competenceId, liste] of parCompetence) {
    // Trier par date croissante pour que trend = dernier - premier.
    liste.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    const scores = liste.map((e) => e.masterySignal as number);
    const avgScore =
      Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
    const lastEvidenceAt = liste[liste.length - 1].occurredAt;

    // Tendance : comparer le dernier au premier.
    const trendDelta = scores[scores.length - 1] - scores[0];
    const trend =
      scores.length < 2
        ? "indetermine"
        : trendDelta > ECART_TENDANCE
          ? "hausse"
          : trendDelta < -ECART_TENDANCE
            ? "baisse"
            : "stable";

    // Statut de maîtrise — aligné sur le générateur de seed.
    let status = "UNKNOWN";
    if (avgScore >= SEUIL_MASTERED) status = "MASTERED";
    else if (avgScore >= SEUIL_PROFICIENT) status = "PROFICIENT";
    else if (avgScore >= SEUIL_DEVELOPING) status = "DEVELOPING";
    else status = "EMERGING";

    result.set(competenceId, {
      competenceId,
      masteryScore: avgScore,
      evidenceCount: scores.length,
      lastEvidenceAt,
      trend,
      masteryStatus: status,
    });
  }

  return result;
}

/**
 * Fusionne un profil stocké avec sa version recalculée.
 *
 * Les champs temporels (`masteryScore`, `evidenceCount`, `lastEvidenceAt`,
 * `trend`, `masteryStatus`) sont remplacés par les valeurs recalculées.
 * Les champs structurels (`prerequisiteStatus`, `recommendedAction`,
 * `confidenceScore`) sont conservés du profil stocké.
 *
 * Si aucune preuve n'existe pour cette compétence (compétence non encore
 * évaluée à la date simulée), le profil est marqué `UNKNOWN` avec un score
 * de 0 et aucune preuve.
 */
export function fusionnerProfil<T extends { competenceId: string }>(
  profilStocke: T,
  recalcule: ProfilRecalcule | undefined
): T & {
  masteryScore: number;
  evidenceCount: number;
  lastEvidenceAt: Date | null;
  trend: string;
  masteryStatus: string;
} {
  if (!recalcule) {
    // Aucune preuve à la date simulée : la compétence est inconnue.
    return {
      ...profilStocke,
      masteryScore: 0,
      evidenceCount: 0,
      lastEvidenceAt: null,
      trend: "indetermine",
      masteryStatus: "UNKNOWN",
    };
  }

  return {
    ...profilStocke,
    masteryScore: recalcule.masteryScore,
    evidenceCount: recalcule.evidenceCount,
    lastEvidenceAt: recalcule.lastEvidenceAt,
    trend: recalcule.trend,
    masteryStatus: recalcule.masteryStatus,
  };
}
