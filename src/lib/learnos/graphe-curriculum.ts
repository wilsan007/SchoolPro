/**
 * EcolPro / LEARNOS — Analyse du graphe de curriculum
 * ====================================================
 *
 * LE GRAPHE DE PRÉREQUIS COMME OUTIL DE DÉCISION
 * ----------------------------------------------
 * Le curriculum n'est pas une liste : c'est un graphe orienté dont les nœuds
 * sont les compétences et les arêtes les relations de prérequis
 * (`Competence.prerequis`, auto-relation many-to-many). Une compétence n'est
 * pas « difficile » dans l'absolu — elle l'est par sa POSITION : un nœud dont
 * dépendent beaucoup d'autres est un goulot d'étranglement. Si un élève
 * échoue dessus, il bloque tout le reste du programme.
 *
 * Trois analyses, purement déterministes, exploitent cette structure :
 *
 *  1. NŒUDS CRITIQUES (I6) — centralité de dépendance : quelles compétences
 *     sont les racines du graphe ? Leur échec contamine la chaîne entière.
 *  2. VALIDATION EMPIRIQUE DES PRÉREQUIS (I8) — les arêtes déclarées par le
 *     curriculum se vérifient-elles dans les données d'apprentissage ? Si
 *     échouer sur A n'entraîne pas échec sur B, l'arête A→B est suspecte.
 *  3. SIMULATION DE SUPPRESSION (I31) — que se passe-t-il si on retire une
 *     compétence du programme ? Combien de chemins cassés, combien
 *     d'orphelins ?
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

/**
 * Seuil de maîtrise en-dessous duquel un élève est considéré en échec sur une
 * compétence. Aligné sur `SEUILS_PAR_DEFAUT` du moteur de recommandation :
 * 0.35 sépare EMERGING/DEVELOPING (en difficulté) de PROFICIENT.
 */
const SEUIL_ECHEC_MASTERY = 0.35;

/** Nombre minimal d'élèves en échec sur le prérequis A pour qu'une paire soit
 * jugée statistiquement exploitable. En deçà, le ratio n'a aucun sens. */
const EFFECTIF_MIN_VALIDATION = 5;

/** Nombre de descendants à partir duquel un nœud est jugé CRITIQUE. */
const SEUIL_DESCENDANTS_CRITIQUE = 10;

/** Top-N des nœuds critiques retournés. */
const TOP_N_NOEUDS_CRITIQUES = 10;

// ------------------------------------------------------------
// Types exportés
// ------------------------------------------------------------

export interface NoeudCritique {
  competenceId: string;
  competenceLibelle: string;
  matiereNom: string;
  niveau: string;
  nbDescendants: number; // compétences qui dépendent de celle-ci (transitivité)
  centralite: number; // 0..1 — nbDescendants / (total - 1)
  elevesEnEchec: number; // mastery < 0.35
  impact: "CRITIQUE" | "ELEVE" | "MODERE"; // CRITIQUE si ≥10 descendants
}

export interface ValidationPrerequis {
  competenceAId: string;
  competenceALibelle: string;
  competenceBId: string;
  competenceBLibelle: string;
  elevesEchecA: number;
  elevesEchecAetB: number;
  ratioConformation: number; // P(échec B | échec A)
  verdict: "CONFIRME" | "A_REVISER" | "INUTILE";
}

export interface SimulationSuppression {
  competenceId: string;
  competenceLibelle: string;
  cheminsCasses: number;
  competencesOrphelines: number; // perdent leur seul prérequis
  impact: "FAIBLE" | "MODERE" | "MAJEUR";
}

// ------------------------------------------------------------
// Utilitaires de graphe
// ------------------------------------------------------------

/**
 * Construit la table de dépendance inversée : pour chaque compétence, l'ensemble
 * des compétences qui en dépendent directement (i.e. celles dont elle est
 * prérequis).
 *
 * Arête A → B signifie « A est prérequis de B ». On l'obtient en parcourant
 * `B.prerequis` : pour chaque B, chaque P ∈ B.prerequis crée l'arête P → B.
 * La table inverse `dependantsDe(P)` accumule donc B.
 */
function construireDependants(
  competences: { id: string; prerequis: { id: string }[] }[],
  idsEnScope: Set<string>
): Map<string, Set<string>> {
  const dependants = new Map<string, Set<string>>();
  for (const c of competences) {
    for (const p of c.prerequis) {
      // On ne retient que les arêtes dont les deux extrémités sont dans le
      // périmètre (matière/site). Une arête pointant vers une compétence hors
      // scope n'a pas de sens pour l'analyse courante.
      if (!idsEnScope.has(p.id)) continue;
      if (!dependants.has(p.id)) dependants.set(p.id, new Set());
      dependants.get(p.id)!.add(c.id);
    }
  }
  return dependants;
}

/**
 * Compte les descendants d'une compétence : toutes les compétences atteignables
 * par transitivité en suivant les arêtes A → B (A est prérequis de B).
 *
 * Un BFS sur la table des dépendants directs. La compétence de départ n'est pas
 * comptée parmi ses propres descendants.
 */
function compterDescendants(
  depart: string,
  dependants: Map<string, Set<string>>
): number {
  const vus = new Set<string>();
  const file: string[] = [depart];
  while (file.length > 0) {
    const courant = file.shift()!;
    for (const d of dependants.get(courant) ?? []) {
      if (vus.has(d)) continue;
      vus.add(d);
      file.push(d);
    }
  }
  return vus.size;
}

/**
 * Ensemble des paires (X, Y) telles que X atteint Y par transitivité (X ≠ Y).
 * Sert de référence pour mesurer l'impact d'une suppression : on compare avant
 * et après retrait du nœud.
 */
function pairesAtteignables(
  ids: string[],
  dependants: Map<string, Set<string>>
): Set<string> {
  const paires = new Set<string>();
  for (const depart of ids) {
    const vus = new Set<string>();
    const file: string[] = [depart];
    while (file.length > 0) {
      const courant = file.shift()!;
      for (const d of dependants.get(courant) ?? []) {
        if (vus.has(d)) continue;
        vus.add(d);
        paires.add(`${depart}->${d}`);
        file.push(d);
      }
    }
  }
  return paires;
}

// ------------------------------------------------------------
// 1. NŒUDS CRITIQUES DU GRAPHE (I6)
// ------------------------------------------------------------

/**
 * Identifie les nœuds critiques du graphe de prérequis : les compétences dont
 * dépendent (directement ou indirectement) le plus d'autres compétences.
 *
 * Un élève qui échoue sur un nœud critique bloque toute la chaîne descendante.
 * Ces compétences méritent une vigilance et un étayage prioritaires.
 *
 * @param matiereId restreint l'analyse à une matière (graphe plus lisible).
 *                   Si absent, analyse tout le tenant.
 */
export async function identifierNoeudsCritiques(
  tenantId: string,
  claims: SessionSiteClaims,
  matiereId?: string
): Promise<NoeudCritique[]> {
  // 1. Récupérer toutes les compétences du périmètre avec leurs prérequis.
  const competences = await prisma.competence.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("competence", claims),
      ...(matiereId && { chapitre: { matiereId } }),
    },
    select: {
      id: true,
      libelle: true,
      prerequis: { select: { id: true } },
      chapitre: { select: { niveau: true, matiere: { select: { nom: true } } } },
    },
  });

  if (competences.length === 0) return [];

  const idsEnScope = new Set(competences.map((c) => c.id));
  const dependants = construireDependants(competences, idsEnScope);
  const total = competences.length;

  // 2. Nombre d'élèves en échec (mastery < 0.35) par compétence — un seul
  //    aller-retour pour tout le graphe, plutôt qu'un par compétence.
  const echecs = await prisma.studentLearningProfile.groupBy({
    by: ["competenceId"],
    where: {
      tenantId,
      competenceId: { in: [...idsEnScope] },
      masteryScore: { lt: SEUIL_ECHEC_MASTERY },
      ...siteFilterForModel("studentLearningProfile", claims),
    },
    _count: { competenceId: true },
  });
  const echecParCompetence = new Map(
    echecs.map((e) => [e.competenceId, e._count.competenceId])
  );

  // 3. Centralité et classement.
  const parId = new Map(competences.map((c) => [c.id, c]));
  const resultats: NoeudCritique[] = competences.map((c) => {
    const nbDescendants = compterDescendants(c.id, dependants);
    const centralite = total > 1 ? nbDescendants / (total - 1) : 0;
    const elevesEnEchec = echecParCompetence.get(c.id) ?? 0;
    const impact: NoeudCritique["impact"] =
      nbDescendants >= SEUIL_DESCENDANTS_CRITIQUE
        ? "CRITIQUE"
        : elevesEnEchec >= 5
          ? "ELEVE"
          : "MODERE";
    return {
      competenceId: c.id,
      competenceLibelle: c.libelle,
      matiereNom: c.chapitre.matiere.nom,
      niveau: c.chapitre.niveau,
      nbDescendants,
      centralite,
      elevesEnEchec,
      impact,
    };
  });

  // 4. Top-10 par centralité décroissante (puis par descendants, puis échec).
  resultats.sort(
    (a, b) =>
      b.centralite - a.centralite ||
      b.nbDescendants - a.nbDescendants ||
      b.elevesEnEchec - a.elevesEnEchec
  );

  // On ne retourne que les nœuds ayant au moins un descendant : un nœud isolé
  // n'est « critique » pour personne, quel que soit son rang.
  return resultats
    .filter((r) => r.nbDescendants > 0)
    .slice(0, TOP_N_NOEUDS_CRITIQUES);
}

// ------------------------------------------------------------
// 2. VALIDATION EMPIRIQUE DES PRÉREQUIS (I8)
// ------------------------------------------------------------

/**
 * Vérifie empiriquement les relations de prérequis déclarées dans le curriculum.
 *
 * Principe : si A est prérequis de B, alors un élève en échec sur A devrait
 * aussi être en échec sur B. On mesure P(échec B | échec A) :
 *  - ratio ≥ 0.5  → CONFIRME     (le prérequis se vérifie)
 *  - 0.3 ≤ ratio < 0.5 → A_REVISER (lien faible, à réexaminer)
 *  - ratio < 0.3 → INUTILE      (échec sur A n'entraîne pas échec sur B)
 *
 * Les paires avec moins de `EFFECTIF_MIN_VALIDATION` élèves en échec sur A sont
 * ignorées : l'échantillon est trop faible pour conclure.
 *
 * @param matiereId restreint l'analyse à une matière.
 */
export async function validerPrerequisEmpiriquement(
  tenantId: string,
  claims: SessionSiteClaims,
  matiereId?: string
): Promise<ValidationPrerequis[]> {
  // 1. Récupérer les compétences et leurs prérequis directs.
  const competences = await prisma.competence.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("competence", claims),
      ...(matiereId && { chapitre: { matiereId } }),
    },
    select: {
      id: true,
      libelle: true,
      prerequis: { select: { id: true } },
    },
  });

  if (competences.length === 0) return [];

  const idsEnScope = new Set(competences.map((c) => c.id));
  const libelleParId = new Map(competences.map((c) => [c.id, c.libelle]));

  // 2. Récupérer les profils d'apprentissage pour toutes ces compétences.
  //    On charge eleveId + competenceId + masteryScore, puis on indexe par
  //    compétence pour croiser efficacement chaque paire (A → B).
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      competenceId: { in: [...idsEnScope] },
      ...siteFilterForModel("studentLearningProfile", claims),
    },
    select: { eleveId: true, competenceId: true, masteryScore: true },
  });

  // Map<competenceId, Map<eleveId, masteryScore>> : pour chaque compétence, la
  // maîtrise de chaque élève qui a été évalué dessus.
  const masteryParCompetence = new Map<
    string,
    Map<string, number>
  >();
  for (const p of profils) {
    let parEleve = masteryParCompetence.get(p.competenceId);
    if (!parEleve) {
      parEleve = new Map();
      masteryParCompetence.set(p.competenceId, parEleve);
    }
    // @@unique([eleveId, competenceId]) garantit l'unicité : pas de doublon.
    parEleve.set(p.eleveId, p.masteryScore);
  }

  // 3. Pour chaque arête directe A → B (A est prérequis de B), calculer le
  //    ratio de conformation P(échec B | échec A).
  const resultats: ValidationPrerequis[] = [];
  const pairesVues = new Set<string>();

  for (const b of competences) {
    for (const a of b.prerequis) {
      // Arêtes hors scope ignorées (le prérequis pointe hors périmètre).
      if (!idsEnScope.has(a.id)) continue;
      // Une même arête peut apparaître deux fois (B.prerequis contient A, et
      // si on itère aussi sur A on la reverrait) ; on déduplique.
      const clef = `${a.id}->${b.id}`;
      if (pairesVues.has(clef)) continue;
      pairesVues.add(clef);

      const masteryA = masteryParCompetence.get(a.id);
      const masteryB = masteryParCompetence.get(b.id);
      if (!masteryA || !masteryB) continue;

      // Élèves évalués sur A ET B : intersection des deux maps.
      let elevesEchecA = 0;
      let elevesEchecAetB = 0;
      for (const [eleveId, scoreA] of masteryA) {
        if (scoreA >= SEUIL_ECHEC_MASTERY) continue;
        elevesEchecA += 1;
        const scoreB = masteryB.get(eleveId);
        if (scoreB !== undefined && scoreB < SEUIL_ECHEC_MASTERY) {
          elevesEchecAetB += 1;
        }
      }

      // Échantillon insuffisant : on ignore la paire (pas de verdict).
      if (elevesEchecA < EFFECTIF_MIN_VALIDATION) continue;

      const ratioConformation = elevesEchecAetB / elevesEchecA;
      const verdict: ValidationPrerequis["verdict"] =
        ratioConformation >= 0.5
          ? "CONFIRME"
          : ratioConformation >= 0.3
            ? "A_REVISER"
            : "INUTILE";

      resultats.push({
        competenceAId: a.id,
        competenceALibelle: libelleParId.get(a.id) ?? "—",
        competenceBId: b.id,
        competenceBLibelle: libelleParId.get(b.id) ?? "—",
        elevesEchecA,
        elevesEchecAetB,
        ratioConformation,
        verdict,
      });
    }
  }

  // 4. Tri : les prérequis les plus douteux d'abord (INUTILE, puis A_REVISER),
  //    puis par nombre d'élèves concernés décroissant.
  const prioriteVerdict: Record<ValidationPrerequis["verdict"], number> = {
    INUTILE: 0,
    A_REVISER: 1,
    CONFIRME: 2,
  };
  resultats.sort(
    (a, b) =>
      prioriteVerdict[a.verdict] - prioriteVerdict[b.verdict] ||
      b.elevesEchecA - a.elevesEchecA
  );

  return resultats;
}

// ------------------------------------------------------------
// 3. SIMULATION DE SUPPRESSION D'UN NŒUD (I31)
// ------------------------------------------------------------

/**
 * Simule la suppression d'une compétence du programme et mesure l'impact sur le
 * graphe de prérequis.
 *
 * Deux métriques :
 *  - `cheminsCasses` : nombre de paires (X, Y) qui étaient atteignables avant
 *    et ne le sont plus après retrait (X atteignait Y en passant par le nœud
 *    supprimé). C'est la « centralité d'intermédiarité » approchée du nœud.
 *  - `competencesOrphelines` : compétences qui avaient CE nœud pour seul
 *    prérequis et se retrouvent sans aucun prérequis — donc sans fondation
 *    déclarée.
 *
 * Utile pour évaluer les conséquences d'un changement de programme avant de
 * l'appliquer.
 */
export async function simulerSuppressionCompetence(
  tenantId: string,
  claims: SessionSiteClaims,
  competenceId: string
): Promise<SimulationSuppression> {
  // 1. Récupérer la compétence ciblée (vérification d'appartenance au tenant).
  const cible = await prisma.competence.findFirst({
    where: {
      id: competenceId,
      tenantId,
      ...siteFilterForModel("competence", claims),
    },
    select: { id: true, libelle: true, chapitre: { select: { matiereId: true } } },
  });
  if (!cible) {
    return {
      competenceId,
      competenceLibelle: "—",
      cheminsCasses: 0,
      competencesOrphelines: 0,
      impact: "FAIBLE",
    };
  }

  // 2. Charger tout le graphe de la matière de la compétence ciblée. On borne
  //    à la matière : supprimer une compétence de maths n'a pas d'impact sur
  //    le graphe de français, et l'analyse reste lisible.
  const matiereId = cible.chapitre.matiereId;
  const competences = await prisma.competence.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("competence", claims),
      chapitre: { matiereId },
    },
    select: {
      id: true,
      libelle: true,
      prerequis: { select: { id: true } },
    },
  });

  if (competences.length === 0 || !competences.some((c) => c.id === competenceId)) {
    return {
      competenceId,
      competenceLibelle: cible.libelle,
      cheminsCasses: 0,
      competencesOrphelines: 0,
      impact: "FAIBLE",
    };
  }

  const idsEnScope = new Set(competences.map((c) => c.id));

  // 3. Graphe original : table des dépendants et paires atteignables.
  const dependantsAvant = construireDependants(competences, idsEnScope);
  const idsAvant = [...idsEnScope];
  const pairesAvant = pairesAtteignables(idsAvant, dependantsAvant);

  // 4. Graphe après suppression : on retire le nœud et toutes les arêtes
  //    incidentes (qu'il soit prérequis ou dépendant).
  const idsApres = idsAvant.filter((id) => id !== competenceId);
  const competencesApres = competences.filter((c) => c.id !== competenceId);
  const dependantsApres = construireDependants(competencesApres, new Set(idsApres));
  const pairesApres = pairesAtteignables(idsApres, dependantsApres);

  // 5. Chemins cassés : paires atteignables avant mais plus après.
  let cheminsCasses = 0;
  for (const paire of pairesAvant) {
    if (!pairesApres.has(paire)) cheminsCasses += 1;
  }

  // 6. Compétences orphelines : celles dont le seul prérequis était le nœud
  //    supprimé. On parcourt les dépendants directs du nœud supprimé et l'on
  //    vérifie qu'ils n'avaient QUE lui comme prérequis.
  const dependantsDirects = dependantsAvant.get(competenceId) ?? new Set<string>();
  let competencesOrphelines = 0;
  const parId = new Map(competences.map((c) => [c.id, c]));
  for (const depId of dependantsDirects) {
    const dep = parId.get(depId);
    if (!dep) continue;
    const prerequisIds = dep.prerequis.filter((p) => idsEnScope.has(p.id));
    if (prerequisIds.length === 1 && prerequisIds[0].id === competenceId) {
      competencesOrphelines += 1;
    }
  }

  // 7. Niveau d'impact.
  const impact: SimulationSuppression["impact"] =
    cheminsCasses >= 20 || competencesOrphelines >= 5
      ? "MAJEUR"
      : cheminsCasses >= 5 || competencesOrphelines >= 1
        ? "MODERE"
        : "FAIBLE";

  return {
    competenceId,
    competenceLibelle: cible.libelle,
    cheminsCasses,
    competencesOrphelines,
    impact,
  };
}
