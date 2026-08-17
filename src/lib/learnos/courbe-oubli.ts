/**
 * EcolPro / LEARNOS — Courbe d'oubli & alerte « vacances creuses »
 * ================================================================
 *
 * Deux analyses déterministes, sans aucun appel de modèle de langage :
 *
 *  1. DEMI-VIE D'UNE COMPÉTENCE (I4) — modélise la décroissance de la
 *     maîtrise entre deux preuves d'apprentissage consécutives. La courbe
 *     suit une exponentielle décroissante `mastery(t) = mastery(0) × e^(-λt)`
 *     où `t` est en jours. La demi-vie — durée pour que la maîtrise perde
 *     la moitié de sa valeur — vaut `ln(2) / λ`.
 *
 *     L'oubli n'est pas une fatalité abstraite : il dépend du temps écoulé
 *     sans pratique. En bucketant les écarts (0-7 j, 8-30 j, 31-90 j, 90+ j)
 *     puis en ajustant une exponentielle, on obtient un λ propre au tenant,
 *     utilisable pour anticiper l'impact des vacances sur les compétences
 *     fragiles.
 *
 *  2. ALERTE « VACANCES CREUSES » (I13) — projette la décroissance sur la
 *     durée des prochaines vacances scolaires pour identifier les élèves
 *     dont la maîtrise, aujourd'hui fragile (0,35-0,7), tombera sous le
 *     seuil d'échec (< 0,35) au retour. Recommande des révisions ciblées
 *     *avant* le départ, quand elles sont encore efficaces.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------

/** Nombre minimum de paires d'evidences pour produire un λ fiable. */
const SEUIL_PAIRES_MIN = 50;

/** Demi-vie par défaut (jours) quand les données sont insuffisantes. */
const DEMI_VIE_DEFAUT_JOURS = 30;

/** Seuil de maîtrise en deçà duquel la compétence est en échec. */
const SEUIL_ECHEC = 0.35;

/** Seuil supérieur de la zone « fragile » (maîtrise entre 0,35 et 0,7). */
const SEUIL_FRAGILE_HAUT = 0.7;

/** Borne inférieure de la zone fragile (égale au seuil d'échec). */
const SEUIL_FRAGILE_BAS = 0.35;

/** Type d'événement calendaire représentant des vacances scolaires. */
const TYPE_VACANCE_SCOLAIRE = "VACANCE_SCOLAIRE";

/** Millisecondes par jour — utilisé pour convertir les écarts de dates. */
const MS_PAR_JOUR = 86_400_000;

/** ln(2) — constante de la demi-vie exponentielle. */
const LN2 = Math.log(2);

/**
 * Tranches d'écarts temporels entre deux preuves consécutives.
 *
 * L'oubli n'est pas linéaire : il est rapide la première semaine puis
 * ralentit. Bucketer permet de capturer cette non-linéarité avant l'ajustement
 * exponentiel, plutôt que de supposer une décroissance uniforme.
 */
interface TrancheDef {
  libelle: string;
  gapMinJours: number;
  /** `null` = pas de borne supérieure (90+ jours). */
  gapMaxJours: number | null;
}

const TRANCHES: readonly TrancheDef[] = [
  { libelle: "0-7 j", gapMinJours: 0, gapMaxJours: 7 },
  { libelle: "8-30 j", gapMinJours: 8, gapMaxJours: 30 },
  { libelle: "31-90 j", gapMinJours: 31, gapMaxJours: 90 },
  { libelle: "90+ j", gapMinJours: 91, gapMaxJours: null },
];

// ------------------------------------------------------------
// Types publics
// ------------------------------------------------------------

/** Résultat de l'ajustement de la courbe d'oubli pour une compétence. */
export interface CourbeOubli {
  /** Compétence ciblée, ou `null` si l'analyse agrège toutes les compétences. */
  competenceId: string | null;
  /** Libellé de la compétence, ou `null` si agrégation. */
  competenceLibelle: string | null;
  /** Demi-vie en jours (`ln(2) / λ`). `Infinity` si aucun oubli observé. */
  demiVieJours: number;
  /** Taux de décroissance exponentielle λ (par jour). */
  lambda: number;
  /** Nombre de paires (evidence_n, evidence_n+1) exploitées. */
  pairesAnalysees: number;
  /** `true` si < SEUIL_PAIRES_MIN paires — la demi-vie est alors par défaut. */
  donneesInsuffisantes: boolean;
  /** Détail par tranche d'écart temporel. */
  tranches: TrancheOubli[];
}

/** Statistiques d'oubli pour une tranche d'écart temporel. */
export interface TrancheOubli {
  libelle: string;
  gapMinJours: number;
  gapMaxJours: number | null;
  /** Nombre de paires dans la tranche. */
  paires: number;
  /** Ratio moyen `masterySignal_n+1 / masterySignal_n`, ou `null` si vide. */
  ratioMoyen: number | null;
  /** Écart moyen en jours dans la tranche, ou `null` si vide. */
  gapMoyenJours: number | null;
}

/** Alerte projetant l'oubli sur les prochaines vacances scolaires. */
export interface AlerteVacances {
  evenementId: string;
  libelle: string;
  dateDebut: Date;
  dateFin: Date;
  /** Durée des vacances en jours. */
  dureeJours: number;
  /** λ utilisé pour la projection (issu de la courbe d'oubli du tenant). */
  lambda: number;
  /** Demi-vie correspondante (jours). */
  demiVieJours: number;
  /** `true` si λ provient de la valeur par défaut (données insuffisantes). */
  donneesInsuffisantes: boolean;
  /** Nombre total de compétences fragiles identifiées. */
  totalFragiles: number;
  /** Nombre de compétences qui tomberont en échec au retour. */
  totalTombeEnEchec: number;
  /** Détail par élève × compétence. */
  eleves: AlerteVacancesEleve[];
}

/** Projection de l'oubli pour un élève sur une compétence fragile. */
export interface AlerteVacancesEleve {
  eleveId: string;
  nom: string;
  prenom: string;
  classeNom: string | null;
  competenceId: string;
  competenceLibelle: string;
  /** Maîtrise actuelle (0..1). */
  masteryAvant: number;
  /** Maîtrise projetée après les vacances. */
  masteryApres: number;
  /** `true` si `masteryApres` < SEUIL_ECHEC — l'élève tombe en échec. */
  tombeEnEchec: boolean;
  /** Recommandation de révision ciblée. */
  recommandation: string;
}

// ------------------------------------------------------------
// Utilitaires internes
// ------------------------------------------------------------

/**
 * Détermine la tranche d'appartenance d'un écart en jours.
 * Renvoie l'index dans `TRANCHES`, ou `-1` si aucun bucket ne correspond
 * (ne devrait pas arriver vu la couverture exhaustive des tranches).
 */
function indexTranche(gapJours: number): number {
  return TRANCHES.findIndex((t) => {
    const okMin = gapJours >= t.gapMinJours;
    const okMax = t.gapMaxJours === null || gapJours <= t.gapMaxJours;
    return okMin && okMax;
  });
}

// ------------------------------------------------------------
// 1. Demi-vie d'une compétence (I4)
// ------------------------------------------------------------

/**
 * Calcule la demi-vie d'oubli d'une compétence (ou de l'ensemble des
 * compétences du tenant) à partir des preuves d'apprentissage.
 *
 * Approche pragmatique :
 *  1. Récupère toutes les `LearningEvidence` (avec compétence rattachée).
 *  2. Groupe par (élève, compétence) et ordonne par `occurredAt`.
 *  3. Pour chaque paire consécutive : `gap_jours` et `ratio` du signal.
 *  4. Exclut les ratios > 1 (amélioration, pas d'oubli) et les signaux nuls.
 *  5. Moyenne des ratios par tranche d'écart.
 *  6. Ajuste `λ = -ln(ratio) / gap_moyen` par tranche, puis moyenne pondérée.
 *  7. `demi-vie = ln(2) / λ`.
 *
 * Si moins de `SEUIL_PAIRES_MIN` paires sont exploitables, on renvoie une
 * demi-vie par défaut (30 jours) avec `donneesInsuffisantes: true` — affirmer
 * une décroissance sur trop peu de données serait une conclusion abusive.
 */
export async function calculerCourbeOubli(
  tenantId: string,
  claims: SessionSiteClaims,
  competenceId?: string
): Promise<CourbeOubli> {
  // --- 1. Récupération des preuves ---
  // On ne conserve que les preuves rattachées à une compétence : la décroissance
  // se mesure par compétence, une preuve « matière » sans rattachement n'a pas
  // de dimension d'oubli exploitable ici.
  const evidences = await prisma.learningEvidence.findMany({
    where: {
      tenantId,
      competenceId: competenceId ?? { not: null },
      ...siteFilterForModel("learningEvidence", claims),
    },
    select: {
      eleveId: true,
      competenceId: true,
      occurredAt: true,
      masterySignal: true,
    },
    orderBy: { occurredAt: "asc" },
  });

  // Libellé de la compétence (si ciblée) pour le résultat.
  let competenceLibelle: string | null = null;
  if (competenceId) {
    const comp = await prisma.competence.findFirst({
      where: {
        id: competenceId,
        tenantId,
        ...siteFilterForModel("competence", claims),
      },
      select: { libelle: true },
    });
    competenceLibelle = comp?.libelle ?? null;
  }

  // --- 2. Groupage par (élève, compétence) ---
  const groupes = new Map<string, typeof evidences>();
  for (const ev of evidences) {
    if (!ev.competenceId) continue; // garde-fou (le filtre Prisma suffit normalement)
    const cle = `${ev.eleveId}|${ev.competenceId}`;
    const liste = groupes.get(cle);
    if (liste) {
      liste.push(ev);
    } else {
      groupes.set(cle, [ev]);
    }
  }

  // --- 3 & 4. Paires consécutives : gap + ratio ---
  // Accumulateurs par tranche : somme des ratios, somme des gaps, compte.
  const tranchesAccum = TRANCHES.map((t) => ({
    def: t,
    sommeRatio: 0,
    sommeGap: 0,
    paires: 0,
  }));

  let totalPaires = 0;

  for (const liste of groupes.values()) {
    // `findMany` ordonne globalement par occurredAt, mais deux élèves
    // différents sont intercalés : on retrie localement pour garantir
    // l'ordre chronologique au sein du groupe.
    liste.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    for (let i = 0; i < liste.length - 1; i++) {
      const courant = liste[i];
      const suivant = liste[i + 1];

      // Ne pas diviser par zéro : signal nul = pas d'information.
      if (courant.masterySignal <= 0) continue;

      const gapJours =
        (suivant.occurredAt.getTime() - courant.occurredAt.getTime()) /
        MS_PAR_JOUR;

      // Un écart négatif (dates incohérentes) est une donnée aberrante.
      if (gapJours < 0) continue;

      const ratio = suivant.masterySignal / courant.masterySignal;

      // Exclure les ratios > 1 : c'est une amélioration, pas de l'oubli.
      // Inclure ratio = 1 (stabilité) : c'est un signal utile (oubli nul).
      if (ratio > 1) continue;

      const idx = indexTranche(gapJours);
      if (idx < 0) continue;

      const tranche = tranchesAccum[idx];
      tranche.sommeRatio += ratio;
      tranche.sommeGap += gapJours;
      tranche.paires += 1;
      totalPaires += 1;
    }
  }

  // --- 5. Moyennes par tranche ---
  const tranchesResult: TrancheOubli[] = tranchesAccum.map((t) => ({
    libelle: t.def.libelle,
    gapMinJours: t.def.gapMinJours,
    gapMaxJours: t.def.gapMaxJours,
    paires: t.paires,
    ratioMoyen: t.paires > 0 ? t.sommeRatio / t.paires : null,
    gapMoyenJours: t.paires > 0 ? t.sommeGap / t.paires : null,
  }));

  // --- 6 & 7. Ajustement exponentiel + demi-vie ---
  const donneesInsuffisantes = totalPaires < SEUIL_PAIRES_MIN;

  let lambda: number;
  let demiVieJours: number;

  if (donneesInsuffisantes) {
    // Trop peu de paires : on ne peut pas prétendre mesurer l'oubli.
    // On renvoie la valeur par défaut, explicitement signalée.
    lambda = LN2 / DEMI_VIE_DEFAUT_JOURS;
    demiVieJours = DEMI_VIE_DEFAUT_JOURS;
  } else {
    // λ par tranche, pondéré par le nombre de paires de la tranche.
    // On ne retient que les tranches valides :
    //  - ratioMoyen ∈ ]0, 1] (ln défini et ≤ 0)
    //  - gapMoyenJours > 0 (pas de division par zéro)
    let sommeLambdaPonderee = 0;
    let sommePoids = 0;

    for (const t of tranchesResult) {
      if (t.paires === 0) continue;
      if (t.ratioMoyen === null || t.gapMoyenJours === null) continue;
      if (t.ratioMoyen <= 0 || t.ratioMoyen > 1) continue;
      if (t.gapMoyenJours <= 0) continue;

      // ratio = e^(-λ × gap)  →  λ = -ln(ratio) / gap
      const lambdaTranche = -Math.log(t.ratioMoyen) / t.gapMoyenJours;
      if (!Number.isFinite(lambdaTranche) || lambdaTranche < 0) continue;

      sommeLambdaPonderee += lambdaTranche * t.paires;
      sommePoids += t.paires;
    }

    if (sommePoids > 0) {
      lambda = sommeLambdaPonderee / sommePoids;
    } else {
      // Aucune tranche exploitable malgré un nombre de paires suffisant :
      // les ratios sont tous à 1 (stabilité parfaite) ou incohérents.
      // Pas d'oubli mesurable.
      lambda = 0;
    }

    if (lambda > 0) {
      demiVieJours = LN2 / lambda;
    } else {
      // λ = 0 : la maîtrise ne décroît pas (ou on ne peut pas le mesurer).
      // Demi-vie infinie — l'oubli n'est pas observable dans les données.
      demiVieJours = Number.POSITIVE_INFINITY;
    }
  }

  return {
    competenceId: competenceId ?? null,
    competenceLibelle,
    demiVieJours,
    lambda,
    pairesAnalysees: totalPaires,
    donneesInsuffisantes,
    tranches: tranchesResult,
  };
}

// ------------------------------------------------------------
// 2. Alerte « vacances creuses » (I13)
// ------------------------------------------------------------

/**
 * Génère une alerte projetant la décroissance de la maîtrise sur la durée des
 * prochaines vacances scolaires.
 *
 * Étapes :
 *  1. Récupère le prochain `EvenementCalendaire` de type VACANCE_SCOLAIRE
 *     (via `AnneesScolaires.evenements`, `dateDebut > now`, tri asc).
 *  2. Calcule la durée des vacances en jours.
 *  3. Récupère les `StudentLearningProfile` dont la maîtrise est fragile
 *     (0,35 ≤ masteryScore ≤ 0,7).
 *  4. Applique `mastery_apres = mastery_actuel × e^(-λ × durée_vacances)`.
 *  5. Identifie les élèves dont la maîtrise tombe sous 0,35 (échec).
 *  6. Recommande des révisions ciblées avant le départ.
 *
 * Le λ utilisé est issu de la courbe d'oubli agrégée du tenant (toutes
 * compétences confondues). Si les données sont insuffisantes, la demi-vie par
 * défaut (30 jours) s'applique — l'alerte reste prudente plutôt qu'aveugle.
 *
 * @param anneeId Année scolaire de référence. Si omis, cherche parmi toutes
 *   les années du tenant (la plus proche dans le futur l'emporte).
 */
export async function genererAlerteVacances(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeId?: string,
  maintenant: Date = new Date()
): Promise<AlerteVacances | null> {
  // --- 1. Prochaines vacances scolaires ---
  // EvenementCalendaire est rattaché à AnneesScolaires (niveau tenant, pas de
  // siteId) : l'isolation passe par `annee.tenantId`. Le filtre de site ne
  // s'applique pas ici (cf. SITE_PATHS["evenementCalendaire"] = "tenant").
  const evenement = await prisma.evenementCalendaire.findFirst({
    where: {
      type: TYPE_VACANCE_SCOLAIRE,
      dateDebut: { gt: maintenant },
      annee: {
        tenantId,
        ...(anneeId ? { id: anneeId } : {}),
      },
    },
    orderBy: { dateDebut: "asc" },
  });

  if (!evenement) return null;

  // --- 2. Durée des vacances ---
  const dureeJours = Math.max(
    0,
    Math.round(
      (evenement.dateFin.getTime() - evenement.dateDebut.getTime()) / MS_PAR_JOUR
    )
  );

  // --- 3. Courbe d'oubli du tenant (λ agrégé) ---
  // On calcule la courbe sur toutes les compétences pour obtenir un λ
  // représentatif du tenant. L'alternative — un λ par compétence — serait
  // plus précise mais nécessiterait assez de données par compétence, ce qui
  // est rarement le cas. L'agrégation est le compromis pragmatique.
  const courbe = await calculerCourbeOubli(tenantId, claims);
  const lambda = courbe.lambda;
  const demiVieJours = courbe.demiVieJours;
  const donneesInsuffisantes = courbe.donneesInsuffisantes;

  // --- 4. Compétences fragiles ---
  // masteryScore ∈ [0,35 ; 0,7] : l'élève n'est pas en échec franc mais
  // n'a pas non plus consolidé. C'est cette zone qui est la plus sensible
  // à l'oubli : une compétence solidement acquise (> 0,7) résistera, une
  // compétence déjà en échec (< 0,35) ne tombera pas plus bas de manière
  // significative — l'alerte serait du bruit.
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      masteryScore: { gte: SEUIL_FRAGILE_BAS, lte: SEUIL_FRAGILE_HAUT },
      ...siteFilterForModel("studentLearningProfile", claims),
    },
    select: {
      eleveId: true,
      competenceId: true,
      masteryScore: true,
      eleve: {
        select: {
          nom: true,
          prenom: true,
          classe: { select: { nom: true } },
        },
      },
      competence: { select: { libelle: true } },
    },
  });

  // --- 5 & 6. Projection + recommandations ---
  const eleves: AlerteVacancesEleve[] = profils.map((p) => {
    const masteryAvant = p.masteryScore;
    const masteryApres = masteryAvant * Math.exp(-lambda * dureeJours);
    const tombeEnEchec = masteryApres < SEUIL_ECHEC;

    const nomComplet = `${p.eleve.prenom} ${p.eleve.nom}`.trim();
    const competenceLibelle = p.competence?.libelle ?? "Compétence";

    let recommandation: string;
    if (tombeEnEchec) {
      // La maîtrise va passer sous le seuil d'échec : révision prioritaire
      // avant le départ, quand la courbe de rappel est encore efficace.
      recommandation = `${nomComplet} — réviser « ${competenceLibelle} » avant les vacances : au retour, la maîtrise projetée (${masteryApres.toFixed(2)}) passe sous le seuil d'échec (${SEUIL_ECHEC}). Une séance de rappel courte cette semaine suffit à limiter la chute.`;
    } else {
      // La maîtrise reste au-dessus du seuil mais se dégrade : consolider
      // pour éviter que la prochaine vacation ne fasse basculer.
      recommandation = `${nomComplet} — consolider « ${competenceLibelle} » par un exercice court avant les vacances : la maîtrise projetée (${masteryApres.toFixed(2)}) reste au-dessus du seuil mais se rapproche du seuil d'échec.`;
    }

    return {
      eleveId: p.eleveId,
      nom: p.eleve.nom,
      prenom: p.eleve.prenom,
      classeNom: p.eleve.classe?.nom ?? null,
      competenceId: p.competenceId,
      competenceLibelle,
      masteryAvant,
      masteryApres,
      tombeEnEchec,
      recommandation,
    };
  });

  // Tri : les élèves qui tombent en échec d'abord (priorité d'action),
  // puis par maîtrise projetée croissante (les plus fragiles d'abord).
  eleves.sort((a, b) => {
    if (a.tombeEnEchec !== b.tombeEnEchec) {
      return a.tombeEnEchec ? -1 : 1;
    }
    return a.masteryApres - b.masteryApres;
  });

  return {
    evenementId: evenement.id,
    libelle: evenement.libelle,
    dateDebut: evenement.dateDebut,
    dateFin: evenement.dateFin,
    dureeJours,
    lambda,
    demiVieJours,
    donneesInsuffisantes,
    totalFragiles: eleves.length,
    totalTombeEnEchec: eleves.filter((e) => e.tombeEnEchec).length,
    eleves,
  };
}
