/**
 * EcolPro / LEARNOS — Analyseur de patterns pédagogiques
 * ========================================================
 *
 * CE QUE FAIT CE MODULE
 * ---------------------
 * Analyse l'historique des résultats (LearningEvidence + StudentLearningProfile)
 * pour détecter des patterns récurrents :
 *
 *   - « En Terminale S, les élèves ont en moyenne 42% de maîtrise sur les
 *     fractions en semaine 12 »
 *   - « La compétence "Analyser un texte argumentatif" a un taux d'échec de
 *     35% en Première, contre 18% en Terminale »
 *   - « Les élèves qui échouent sur les fractions échouent aussi sur les
 *     équations dans 72% des cas »
 *
 * CE QU'IL NE FAIT PAS
 * --------------------
 * Il n'utilise AUCUN modèle de langage. C'est des statistiques pures :
 * moyennes, écarts-types, corrélations. La raison est simple : un modèle
 * statistique est reproductible, auditable, et fonctionne avec peu de
 * données. Un LLM sur 200 élèves produirait des hallucinations.
 *
 * QUAND L'ANALYSE EST DÉCLENCHÉE
 * ------------------------------
 *   - Manuellement, par le directeur depuis le tableau de bord
 *   - Automatiquement, à la fin de chaque année scolaire (via un cron ou
 *     une action manuelle de fin d'année)
 *
 * Le résultat est stocké dans `PatternPedagogique` et tracé dans
 * `JournalApprentissage`.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

/** Nombre minimum d'élèves pour qu'un pattern soit significatif. */
const EFFECTIF_MIN = 5;

/** Nombre minimum de données pour calibrer un seuil. */
const ECHANTILLON_CALIBRATION_MIN = 30;

export interface PatternDetecte {
  niveau: string;
  matiereId: string | null;
  competenceId: string | null;
  masteryMoyenne: number;
  confidenceMoyenne: number;
  effectif: number;
  ecartType: number;
  tauxEchec: number;
  periodeDebut: Date;
  periodeFin: Date;
  anneesCouvertes: number;
  semaineChapitre: number | null;
}

export interface ResultatAnalyse {
  patterns: PatternDetecte[];
  patternsCrees: number;
  patternsMisAJour: number;
  echantillonTotal: number;
}

/**
 * Analyse l'historique des preuves d'apprentissage pour un tenant.
 *
 * Charge toutes les `LearningEvidence` avec leur compétence et chapitre
 * associés, groupe par niveau × matière × compétence, et calcule les
 * statistiques. Les patterns significatifs (effectif ≥ 5) sont persistés.
 */
export async function analyserPatterns(
  tenantId: string,
  claims: SessionSiteClaims,
  options?: { matiereId?: string; niveau?: string }
): Promise<ResultatAnalyse> {
  // 1. Charger toutes les preuves avec les relations nécessaires.
  const evidences = await prisma.learningEvidence.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("learningEvidence", claims),
      ...(options?.matiereId ? { competence: { chapitre: { matiereId: options.matiereId } } } : {}),
    },
    include: {
      competence: {
        select: {
          id: true,
          code: true,
          libelle: true,
          chapitre: { select: { id: true, nom: true, niveau: true, matiereId: true, ordre: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (evidences.length === 0) {
    return { patterns: [], patternsCrees: 0, patternsMisAJour: 0, echantillonTotal: 0 };
  }

  // 2. Grouper par niveau × matière × compétence.
  type Cle = string;
  const groupes = new Map<
    Cle,
    {
      niveau: string;
      matiereId: string;
      competenceId: string;
      scores: number[];
      confidences: number[];
      dates: Date[];
      annees: Set<string>;
    }
  >();

  for (const ev of evidences) {
    const comp = ev.competence;
    if (!comp?.chapitre) continue;
    const niveau = comp.chapitre.niveau;
    if (options?.niveau && niveau !== options.niveau) continue;

    const cle = `${niveau}|${comp.chapitre.matiereId}|${comp.id}`;
    let g = groupes.get(cle);
    if (!g) {
      g = {
        niveau,
        matiereId: comp.chapitre.matiereId,
        competenceId: comp.id,
        scores: [],
        confidences: [],
        dates: [],
        annees: new Set(),
      };
      groupes.set(cle, g);
    }
    if (ev.masterySignal !== null) g.scores.push(ev.masterySignal);
    if (ev.confidence !== null) g.confidences.push(ev.confidence);
    g.dates.push(ev.createdAt);
    g.annees.add(ev.createdAt.getFullYear().toString());
  }

  // 3. Calculer les statistiques par groupe.
  const patterns: PatternDetecte[] = [];
  for (const g of groupes.values()) {
    if (g.scores.length < EFFECTIF_MIN) continue;

    const masteryMoyenne = moyenne(g.scores);
    const confidenceMoyenne = g.confidences.length > 0 ? moyenne(g.confidences) : 0;
    const ecartType = ecartTypeCalc(g.scores);
    const tauxEchec = g.scores.filter((s) => s < 0.35).length / g.scores.length;

    patterns.push({
      niveau: g.niveau,
      matiereId: g.matiereId,
      competenceId: g.competenceId,
      masteryMoyenne,
      confidenceMoyenne,
      effectif: g.scores.length,
      ecartType,
      tauxEchec,
      periodeDebut: g.dates[0],
      periodeFin: g.dates[g.dates.length - 1],
      anneesCouvertes: g.annees.size,
      semaineChapitre: null, // TODO: corréler avec planification
    });
  }

  // 4. Persister les patterns (upsert).
  let patternsCrees = 0;
  let patternsMisAJour = 0;

  for (const p of patterns) {
    const existant = await prisma.patternPedagogique.findFirst({
      where: {
        tenantId,
        niveau: p.niveau,
        matiereId: p.matiereId,
        competenceId: p.competenceId,
        periodeDebut: p.periodeDebut,
      },
      select: { id: true },
    });

    if (existant) {
      await prisma.patternPedagogique.update({
        where: { id: existant.id },
        data: {
          masteryMoyenne: p.masteryMoyenne,
          confidenceMoyenne: p.confidenceMoyenne,
          effectif: p.effectif,
          ecartType: p.ecartType,
          tauxEchec: p.tauxEchec,
          periodeFin: p.periodeFin,
          anneesCouvertes: p.anneesCouvertes,
          semaineChapitre: p.semaineChapitre,
        },
      });
      patternsMisAJour++;
    } else {
      await prisma.patternPedagogique.create({
        data: {
          tenantId,
          siteId: claims.siteId ?? null,
          niveau: p.niveau,
          matiereId: p.matiereId,
          competenceId: p.competenceId,
          masteryMoyenne: p.masteryMoyenne,
          confidenceMoyenne: p.confidenceMoyenne,
          effectif: p.effectif,
          ecartType: p.ecartType,
          tauxEchec: p.tauxEchec,
          periodeDebut: p.periodeDebut,
          periodeFin: p.periodeFin,
          anneesCouvertes: p.anneesCouvertes,
          semaineChapitre: p.semaineChapitre,
        },
      });
      patternsCrees++;
    }
  }

  // 5. Tracer dans le journal d'apprentissage.
  await prisma.journalApprentissage.create({
    data: {
      tenantId,
      siteId: claims.siteId ?? null,
      typeAnalyse: "pattern_detection",
      resume: `${patterns.length} pattern(s) détecté(s) sur ${evidences.length} preuve(s). ${patternsCrees} nouveau(x), ${patternsMisAJour} mis à jour.`,
      detail: JSON.stringify({
        patterns: patterns.map((p) => ({
          niveau: p.niveau,
          competenceId: p.competenceId,
          masteryMoyenne: p.masteryMoyenne,
          tauxEchec: p.tauxEchec,
          effectif: p.effectif,
        })),
      }),
      echantillon: evidences.length,
      perimetre: options?.niveau
        ? `niveau=${options.niveau}`
        : options?.matiereId
          ? `matiere=${options.matiereId}`
          : "global",
    },
  });

  return {
    patterns,
    patternsCrees,
    patternsMisAJour,
    echantillonTotal: evidences.length,
  };
}

/**
 * Détecte les corrélations entre compétences : « les élèves qui échouent
 * sur A échouent aussi sur B ».
 *
 * Cette analyse utilise le graphe de prérequis : si A est prérequis de B,
 * on vérifie si les échecs sur A corrèlent avec les échecs sur B. Si oui,
 * c'est une confirmation que le prérequis est pertinent. Si non, c'est un
 * signal que le lien prérequis est peut-être faux.
 */
export async function detecterCorrelations(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<{ correlations: CorrelationCompetence[]; correlationsCrees: number }> {
  // Charger les profils par élève et par compétence.
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("studentLearningProfile", claims),
    },
    select: {
      eleveId: true,
      competenceId: true,
      masteryScore: true,
      competence: {
        select: {
          id: true,
          code: true,
          libelle: true,
          prerequis: { select: { id: true, code: true, libelle: true } },
        },
      },
    },
  });

  // Index : eleveId → Map<competenceId, masteryScore>
  const parEleve = new Map<string, Map<string, number>>();
  for (const p of profils) {
    let m = parEleve.get(p.eleveId);
    if (!m) {
      m = new Map();
      parEleve.set(p.eleveId, m);
    }
    m.set(p.competenceId, p.masteryScore);
  }

  // Pour chaque paire prérequis → dépendant, calculer la corrélation.
  const correlations: CorrelationCompetence[] = [];
  const pairesVues = new Set<string>();

  for (const p of profils) {
    for (const prereq of p.competence.prerequis) {
      const cle = `${prereq.id}|${p.competenceId}`;
      if (pairesVues.has(cle)) continue;
      pairesVues.add(cle);

      let lesDeux = 0;
      let prereqEchecDependantReussit = 0;
      let prereqReussitDependantEchec = 0;
      let lesDeuxReussissent = 0;
      let total = 0;

      for (const scores of parEleve.values()) {
        const scorePrereq = scores.get(prereq.id);
        const scoreDependant = scores.get(p.competenceId);
        if (scorePrereq === undefined || scoreDependant === undefined) continue;
        total++;
        const prereqEchec = scorePrereq < 0.35;
        const dependantReussit = scoreDependant >= 0.55;
        if (prereqEchec && !dependantReussit) lesDeux++;
        else if (prereqEchec && dependantReussit) prereqEchecDependantReussit++;
        else if (!prereqEchec && !dependantReussit) prereqReussitDependantEchec++;
        else lesDeuxReussissent++;
      }

      if (total < EFFECTIF_MIN) continue;

      // Taux de corrélation : parmi les élèves qui échouent sur le prérequis,
      // quelle proportion échoue aussi sur le dépendant ?
      const echecPrereq = lesDeux + prereqEchecDependantReussit;
      const tauxCorrelation = echecPrereq > 0 ? lesDeux / echecPrereq : 0;

      correlations.push({
        prereqId: prereq.id,
        prereqCode: prereq.code,
        prereqLibelle: prereq.libelle,
        dependantId: p.competenceId,
        dependantCode: p.competence.code,
        dependantLibelle: p.competence.libelle,
        tauxCorrelation,
        effectif: total,
        lesDeux,
        prereqReussitDependantEchec,
      });
    }
  }

  // Tracer dans le journal.
  if (correlations.length > 0) {
    await prisma.journalApprentissage.create({
      data: {
        tenantId,
        siteId: claims.siteId ?? null,
        typeAnalyse: "correlation_detection",
        resume: `${correlations.length} corrélation(s) analysée(s) sur ${profils.length} profil(s).`,
        detail: JSON.stringify(correlations.slice(0, 50)),
        echantillon: profils.length,
        perimetre: "global",
      },
    });
  }

  return { correlations, correlationsCrees: correlations.length };
}

export interface CorrelationCompetence {
  prereqId: string;
  prereqCode: string;
  prereqLibelle: string;
  dependantId: string;
  dependantCode: string;
  dependantLibelle: string;
  /** Parmi les élèves qui échouent sur le prérequis, % qui échouent aussi sur le dépendant. */
  tauxCorrelation: number;
  effectif: number;
  lesDeux: number;
  prereqReussitDependantEchec: number;
}

// --- Utilitaires statistiques ---

function moyenne(valeurs: number[]): number {
  if (valeurs.length === 0) return 0;
  return valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
}

function ecartTypeCalc(valeurs: number[]): number {
  if (valeurs.length < 2) return 0;
  const m = moyenne(valeurs);
  const variance = valeurs.reduce((s, v) => s + (v - m) ** 2, 0) / valeurs.length;
  return Math.sqrt(variance);
}

export { EFFECTIF_MIN, ECHANTILLON_CALIBRATION_MIN };
