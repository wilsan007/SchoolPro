/**
 * EcolPro / LEARNOS — Clustering d'élèves & Tutorat par les pairs
 * ===============================================================
 *
 * Ce module produit deux analyses déterministes sur les profils
 * d'apprentissage des élèves, sans aucun appel à un modèle de langage :
 *
 *  1. CLUSTERING PAR PROFIL D'APPRENTISSAGE (I7) — regroupe les élèves en
 *     4 groupes de besoin à partir de leur vecteur de maîtrise par
 *     compétence. Un K-means simplifié (K=4), initialisé par quantiles
 *     — donc reproductible — identifie :
 *       • « À l'aise »        — mastery moyenne élevée
 *       • « Fragile »          — mastery moyenne modérée
 *       • « En difficulté »   — mastery moyenne basse
 *       • « Hétérogène »       — fortes variations entre compétences
 *
 *  2. APPARIEMENT TUTORAT PAR LES PAIRS (I16) — identifie les élèves
 *     EXCELLENCE (mastery ≥ 0,8) et CRITIQUE (mastery < 0,35) sur une
 *     même compétence, puis apparie tuteur ↔ tutoré en privilégiant la
 *     même classe. Un score de compatibilité quantifie la qualité de
 *     chaque paire.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------

/** Nombre de clusters (groupes de besoin). */
const K_CLUSTERS = 4;

/** Nombre maximum d'itérations du K-means avant arrêt. */
const MAX_ITERATIONS = 10;

/** Nombre maximum d'élèves traités, pour préserver la performance. */
const LIMITE_ELEVES = 1000;

/** Nombre minimum de compétences évaluées pour qu'un élève entre dans le clustering. */
const MIN_COMPETENCES_EVALUEES = 3;

/** Seuil de mastery pour qu'un élève soit considéré EXCELLENCE (tuteur). */
const SEUIL_EXCELLENCE = 0.8;

/** Seuil de mastery en-deçà duquel un élève est considéré CRITIQUE (tutoré). */
const SEUIL_CRITIQUE = 0.35;

/** Noms des clusters, indexés par position après tri par mastery moyenne décroissante. */
const NOMS_CLUSTERS = ["À l'aise", "Fragile", "En difficulté", "Hétérogène"] as const;

// ------------------------------------------------------------
// Types — Analyse 1 : Clustering d'élèves (I7)
// ------------------------------------------------------------

export interface ClusterEleve {
  clusterId: number;
  nom: string; // "À l'aise", "Fragile", etc.
  effectif: number;
  masteryMoyenne: number;
  ecartType: number;
  caracteristique: string; // description textuelle
  eleveIds: string[];
}

export interface ResultatClustering {
  clusters: ClusterEleve[];
  totalEleves: number;
  iterations: number;
  converged: boolean;
}

// ------------------------------------------------------------
// Types — Analyse 2 : Tutorat par les pairs (I16)
// ------------------------------------------------------------

export interface PaireTutorat {
  tuteurId: string;
  tuteurNom: string;
  eleveId: string;
  eleveNom: string;
  competenceId: string;
  competenceLibelle: string;
  classeCommune: boolean;
  scoreCompatibilite: number;
}

export interface PotentielTutorat {
  paires: PaireTutorat[];
  parCompetence: { competenceId: string; libelle: string; pairesPossibles: number }[];
  totalPaires: number;
  elevesTuteurs: number;
  elevesTutores: number;
}

// ------------------------------------------------------------
// Types internes
// ------------------------------------------------------------

/** Vecteur de maîtrise d'un élève, aligné sur un index de compétences commun. */
interface VecteurEleve {
  eleveId: string;
  vecteur: number[];
  masteryMoyenne: number;
  ecartType: number;
}

// ------------------------------------------------------------
// Utilitaires mathématiques
// ------------------------------------------------------------

/** Moyenne d'un tableau de nombres (0 si vide). */
function moyenne(valeurs: number[]): number {
  if (valeurs.length === 0) return 0;
  return valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
}

/** Écart-type empirique d'un tableau de nombres (0 si vide ou singleton). */
function ecartType(valeurs: number[]): number {
  if (valeurs.length === 0) return 0;
  if (valeurs.length === 1) return 0;
  const m = moyenne(valeurs);
  const variance = valeurs.reduce((s, v) => s + (v - m) ** 2, 0) / valeurs.length;
  return Math.sqrt(variance);
}

/** Distance euclidienne entre deux vecteurs de même dimension. */
function distanceEuclidienne(a: number[], b: number[]): number {
  let somme = 0;
  for (let i = 0; i < a.length; i++) {
    somme += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(somme);
}

/** Vecteur moyen (centroid) d'un ensemble de vecteurs de même dimension. */
function vecteurMoyen(vecteurs: number[][]): number[] {
  if (vecteurs.length === 0) return [];
  const dim = vecteurs[0].length;
  const resultat = new Array<number>(dim).fill(0);
  for (const v of vecteurs) {
    for (let i = 0; i < dim; i++) {
      resultat[i] += v[i];
    }
  }
  for (let i = 0; i < dim; i++) {
    resultat[i] /= vecteurs.length;
  }
  return resultat;
}

// ------------------------------------------------------------
// Analyse 1 : Clustering d'élèves par profil d'apprentissage (I7)
// ------------------------------------------------------------

/**
 * Charge les profils d'apprentissage des élèves actifs et construit un
 * vecteur de maîtrise par élève, aligné sur un index de compétences commun.
 *
 * Renvoie `null` si aucun élève n'a suffisamment de compétences évaluées.
 */
async function chargerVecteursEleves(
  tenantId: string,
  claims: SessionSiteClaims,
  classeId?: string
): Promise<{ vecteurs: VecteurEleve[]; competences: string[] } | null> {
  // --- 1. Sélection des élèves actifs (limités pour la performance) ---
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      deletedAt: null,
      statut: "ACTIF",
      ...(classeId ? { classeId } : {}),
      ...siteFilterForModel("eleve", claims),
    },
    select: { id: true },
    take: LIMITE_ELEVES,
  });

  if (eleves.length === 0) return null;
  const eleveIds = eleves.map((e) => e.id);

  // --- 2. Profils de maîtrise (batch) ---
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      eleveId: { in: eleveIds },
      // On n'écarte pas UNKNOWN : masteryScore=0 est une information exploitable.
      ...siteFilterForModel("studentLearningProfile", claims),
    },
    select: {
      eleveId: true,
      competenceId: true,
      masteryScore: true,
    },
  });

  // --- 3. Construction de l'index de compétences commun ---
  // Trier les competenceId pour garantir le déterminisme de l'ordre des dimensions.
  const competencesTriees = Array.from(
    new Set(profils.map((p) => p.competenceId))
  ).sort();
  const indexCompetence = new Map<string, number>();
  competencesTriees.forEach((cid, i) => indexCompetence.set(cid, i));

  // --- 4. Regroupement par élève ---
  const parEleve = new Map<string, number[]>();
  for (const p of profils) {
    const idx = indexCompetence.get(p.competenceId);
    if (idx === undefined) continue;
    let vec = parEleve.get(p.eleveId);
    if (!vec) {
      vec = new Array<number>(competencesTriees.length).fill(0);
      parEleve.set(p.eleveId, vec);
    }
    vec[idx] = p.masteryScore;
  }

  // --- 5. Filtrage : ≥ MIN_COMPETENCES_EVALUEES compétences non nulles ---
  // Une compétence « évaluée » correspond à une entrée de profil ; masteryScore=0
  // est compté car la ligne existe (l'élève a été évalué, même s'il a échoué).
  const vecteurs: VecteurEleve[] = [];
  for (const [eleveId, vec] of parEleve) {
    // Nombre de dimensions où une entrée de profil existe (toutes ici, puisque
    // le vecteur n'est construit qu'à partir des profils remontés).
    const nbEvalue = vec.length;
    if (nbEvalue < MIN_COMPETENCES_EVALUEES) continue;
    vecteurs.push({
      eleveId,
      vecteur: vec,
      masteryMoyenne: moyenne(vec),
      ecartType: ecartType(vec),
    });
  }

  if (vecteurs.length === 0) return null;

  return { vecteurs, competences: competencesTriees };
}

/**
 * Initialise les centroids par quantiles : on trie les élèves par mastery
 * moyenne décroissante, on divise en K quantiles de taille égale, et on
 * prend le vecteur moyen de chaque quantile. Déterministe.
 */
function initialiserCentroids(vecteurs: VecteurEleve[]): number[][] {
  const tries = [...vecteurs].sort((a, b) => b.masteryMoyenne - a.masteryMoyenne);
  const n = tries.length;
  const dim = tries[0].vecteur.length;
  const centroids: number[][] = [];

  for (let k = 0; k < K_CLUSTERS; k++) {
    const debut = Math.floor((k * n) / K_CLUSTERS);
    const fin = Math.floor(((k + 1) * n) / K_CLUSTERS);
    const sousEnsemble = tries.slice(debut, fin);
    if (sousEnsemble.length === 0) {
      // Quantile vide (n < K) : centroid neutre au milieu de l'échelle.
      centroids.push(new Array<number>(dim).fill(0.5));
    } else {
      centroids.push(vecteurMoyen(sousEnsemble.map((v) => v.vecteur)));
    }
  }
  return centroids;
}

/**
 * Assigne chaque élève au centroid le plus proche (distance euclidienne).
 * Renvoie le tableau des indices de cluster et le nombre d'élèves par cluster.
 */
function assignerClusters(
  vecteurs: VecteurEleve[],
  centroids: number[][]
): { assignations: number[]; comptes: number[] } {
  const assignations = new Array<number>(vecteurs.length).fill(0);
  const comptes = new Array<number>(K_CLUSTERS).fill(0);

  for (let i = 0; i < vecteurs.length; i++) {
    let meilleureDistance = Infinity;
    let meilleurCluster = 0;
    for (let k = 0; k < K_CLUSTERS; k++) {
      const d = distanceEuclidienne(vecteurs[i].vecteur, centroids[k]);
      if (d < meilleureDistance) {
        meilleureDistance = d;
        meilleurCluster = k;
      }
    }
    assignations[i] = meilleurCluster;
    comptes[meilleurCluster]++;
  }
  return { assignations, comptes };
}

/**
 * Recalcule les centroids comme moyenne des vecteurs de chaque cluster.
 * Si un cluster est vide, on conserve l'ancien centroid.
 */
function recalculerCentroids(
  vecteurs: VecteurEleve[],
  assignations: number[],
  anciensCentroids: number[][]
): number[][] {
  const dim = vecteurs[0].vecteur.length;
  const nouveauxCentroids: number[][] = [];

  for (let k = 0; k < K_CLUSTERS; k++) {
    const membres = vecteurs
      .filter((_, i) => assignations[i] === k)
      .map((v) => v.vecteur);
    if (membres.length === 0) {
      // Cluster vide : on garde le centroid précédent pour éviter la divergence.
      nouveauxCentroids.push(anciensCentroids[k]);
    } else {
      nouveauxCentroids.push(vecteurMoyen(membres));
    }
  }
  return nouveauxCentroids;
}

/**
 * Détermine le nom et la caractéristique d'un cluster à partir de la
 * mastery moyenne et de l'écart-type de ses membres.
 *
 * L'ordre des clusters après convergence n'est pas garanti identique à
 * l'initialisation par quantiles : on nomme donc selon les caractéristiques
 * observées plutôt que par position.
 */
function nommerCluster(
  masteryMoy: number,
  ecart: number,
  effectif: number
): { nom: string; caracteristique: string } {
  // Un élève « hétérogène » présente de fortes variations : l'écart-type
  // domine sur la moyenne. On considère un écart-type ≥ 0,25 comme significatif
  // (les mastery vont de 0 à 1, un écart de 0,25 représente un quart de l'échelle).
  const HETEROGENE_SEUIL = 0.25;

  if (ecart >= HETEROGENE_SEUIL && effectif > 0) {
    return {
      nom: "Hétérogène",
      caracteristique:
        `Fortes variations entre compétences (écart-type ${ecart.toFixed(2)}), ` +
        `mastery moyenne ${masteryMoy.toFixed(2)} — l'élève excelle sur certaines ` +
        `competences et peine sur d'autres.`,
    };
  }

  if (masteryMoy >= 0.7) {
    return {
      nom: "À l'aise",
      caracteristique:
        `Mastery moyenne élevée (${masteryMoy.toFixed(2)}) — l'élève maîtrise ` +
        `globalement les compétences évaluées, peu de remédiation nécessaire.`,
    };
  }

  if (masteryMoy >= 0.45) {
    return {
      nom: "Fragile",
      caracteristique:
        `Mastery moyenne modérée (${masteryMoy.toFixed(2)}) — l'élève a des ` +
        `acquis partiels, des consolidations ciblées permettraient de gagner ` +
        `en assurance.`,
    };
  }

  return {
    nom: "En difficulté",
    caracteristique:
      `Mastery moyenne basse (${masteryMoy.toFixed(2)}) — l'élève présente ` +
      `des lacunes marquées sur la plupart des compétences, un plan de ` +
      `remédiation structuré est recommandé.`,
  };
}

/**
 * Clustering d'élèves par profil d'apprentissage (I7).
 *
 * Construit un vecteur de mastery par élève depuis `StudentLearningProfile`,
 * applique un K-means simplifié (K=4) initialisé par quantiles, et nomme
 * les clusters selon leurs caractéristiques observées.
 *
 * @param tenantId  Identifiant du tenant actif.
 * @param claims    Périmètre de site de la session.
 * @param classeId  Optionnel — restreint l'analyse à une classe.
 */
export async function clustererEleves(
  tenantId: string,
  claims: SessionSiteClaims,
  classeId?: string
): Promise<ResultatClustering> {
  const donnees = await chargerVecteursEleves(tenantId, claims, classeId);
  if (!donnees) {
    return {
      clusters: [],
      totalEleves: 0,
      iterations: 0,
      converged: true,
    };
  }

  const { vecteurs } = donnees;

  // --- 1. Initialisation déterministe par quantiles ---
  let centroids = initialiserCentroids(vecteurs);

  // --- 2. Itérations K-means ---
  let assignations = new Array<number>(vecteurs.length).fill(-1);
  let iterations = 0;
  let converged = false;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    iterations = iter + 1;
    const { assignations: nouvellesAssignations } = assignerClusters(vecteurs, centroids);

    // Convergence : aucune assignation n'a changé depuis l'itération précédente.
    const stable =
      assignations.length === nouvellesAssignations.length &&
      assignations.every((v, i) => v === nouvellesAssignations[i]);

    assignations = nouvellesAssignations;

    if (stable && iter > 0) {
      converged = true;
      break;
    }

    centroids = recalculerCentroids(vecteurs, assignations, centroids);
  }

  // --- 3. Construction des clusters finaux ---
  const clusters: ClusterEleve[] = [];
  for (let k = 0; k < K_CLUSTERS; k++) {
    const membres = vecteurs.filter((_, i) => assignations[i] === k);
    if (membres.length === 0) continue;

    const masterys = membres.map((m) => m.masteryMoyenne);
    const masteryMoy = moyenne(masterys);
    const ecart = ecartType(membres.flatMap((m) => m.vecteur));
    const { nom, caracteristique } = nommerCluster(masteryMoy, ecart, membres.length);

    clusters.push({
      clusterId: k,
      nom,
      effectif: membres.length,
      masteryMoyenne: Math.round(masteryMoy * 1000) / 1000,
      ecartType: Math.round(ecart * 1000) / 1000,
      caracteristique,
      eleveIds: membres.map((m) => m.eleveId),
    });
  }

  // Trier les clusters par mastery moyenne décroissante pour un affichage lisible.
  clusters.sort((a, b) => b.masteryMoyenne - a.masteryMoyenne);
  clusters.forEach((c, i) => (c.clusterId = i));

  return {
    clusters,
    totalEleves: vecteurs.length,
    iterations,
    converged,
  };
}

// ------------------------------------------------------------
// Analyse 2 : Appariement tutorat par les pairs (I16)
// ------------------------------------------------------------

/**
 * Apparie les élèves EXCELLENCE (mastery ≥ 0,8) avec les élèves CRITIQUE
 * (mastery < 0,35) sur une même compétence, en privilégiant la même classe.
 *
 * Le score de compatibilité est calculé ainsi :
 *   • même classe  : +3
 *   • même régime  : +1
 *   • proximité de mastery (écart tuteur-tutoré) : plus l'écart est grand,
 *     plus le tutorat est pertinent → score proportionnel à l'écart (max +6).
 *
 * @param tenantId  Identifiant du tenant actif.
 * @param claims    Périmètre de site de la session.
 * @param classeId  Optionnel — restreint l'analyse à une classe.
 */
export async function apparierTutorat(
  tenantId: string,
  claims: SessionSiteClaims,
  classeId?: string
): Promise<PotentielTutorat> {
  // --- 1. Sélection des élèves actifs ---
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      deletedAt: null,
      statut: "ACTIF",
      ...(classeId ? { classeId } : {}),
      ...siteFilterForModel("eleve", claims),
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      regime: true,
      classeId: true,
    },
    take: LIMITE_ELEVES,
  });

  if (eleves.length === 0) {
    return {
      paires: [],
      parCompetence: [],
      totalPaires: 0,
      elevesTuteurs: 0,
      elevesTutores: 0,
    };
  }

  const eleveIds = eleves.map((e) => e.id);
  const elevesParId = new Map(eleves.map((e) => [e.id, e]));

  // --- 2. Profils de maîtrise (batch) ---
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      eleveId: { in: eleveIds },
      ...siteFilterForModel("studentLearningProfile", claims),
    },
    select: {
      eleveId: true,
      competenceId: true,
      masteryScore: true,
    },
  });

  // --- 3. Index des compétences (pour le libellé) ---
  const competenceIds = Array.from(new Set(profils.map((p) => p.competenceId)));
  const competences = await prisma.competence.findMany({
    where: { id: { in: competenceIds }, tenantId, ...siteFilterForModel("competence", claims) },
    select: { id: true, libelle: true },
  });
  const libelleParCompetence = new Map(competences.map((c) => [c.id, c.libelle]));

  // --- 4. Partition EXCELLENCE / CRITIQUE par compétence ---
  const excellentsParCompetence = new Map<string, { eleveId: string; mastery: number }[]>();
  const critiquesParCompetence = new Map<string, { eleveId: string; mastery: number }[]>();

  for (const p of profils) {
    if (p.masteryScore >= SEUIL_EXCELLENCE) {
      let liste = excellentsParCompetence.get(p.competenceId);
      if (!liste) {
        liste = [];
        excellentsParCompetence.set(p.competenceId, liste);
      }
      liste.push({ eleveId: p.eleveId, mastery: p.masteryScore });
    } else if (p.masteryScore < SEUIL_CRITIQUE) {
      let liste = critiquesParCompetence.get(p.competenceId);
      if (!liste) {
        liste = [];
        critiquesParCompetence.set(p.competenceId, liste);
      }
      liste.push({ eleveId: p.eleveId, mastery: p.masteryScore });
    }
  }

  // --- 5. Construction des paires ---
  // Pour chaque compétence où l'on a au moins un excellent et un critique,
  // on apparie en privilégiant la même classe. On évite qu'un tuteur soit
  // assigné plusieurs fois au même tutoré sur la même compétence.
  const paires: PaireTutorat[] = [];
  const parCompetence: { competenceId: string; libelle: string; pairesPossibles: number }[] = [];
  const tuteursUtilises = new Set<string>();
  const tutoresUtilises = new Set<string>();

  // Trier les competenceId pour garantir le déterminisme de l'ordre des paires.
  const competenceIdsTriees = Array.from(excellentsParCompetence.keys()).sort();

  for (const competenceId of competenceIdsTriees) {
    const excellents = excellentsParCompetence.get(competenceId) ?? [];
    const critiques = critiquesParCompetence.get(competenceId) ?? [];
    const libelle = libelleParCompetence.get(competenceId) ?? competenceId;

    if (excellents.length === 0 || critiques.length === 0) continue;

    // Tri interne déterministe : par mastery décroissante pour les tuteurs
    // (les plus forts d'abord), par mastery croissante pour les tutorés
    // (les plus en difficulté d'abord).
    excellents.sort((a, b) => b.mastery - a.mastery);
    critiques.sort((a, b) => a.mastery - b.mastery);

    // Nombre de paires possibles = min(tuteurs, tutorés) sur cette compétence.
    const pairesPossibles = Math.min(excellents.length, critiques.length);
    parCompetence.push({ competenceId, libelle, pairesPossibles });

    // Appariement glouton : on associe chaque tuteur à un tutoré en
    // privilégiant la même classe. On marque les paires formées pour
    // éviter qu'un tuteur soit assigné deux fois au même tutoré.
    const tutorésAssignés = new Set<string>();

    for (const tuteur of excellents) {
      const eleveTuteur = elevesParId.get(tuteur.eleveId);
      if (!eleveTuteur) continue;

      // Recherche du meilleur tutoré : même classe en priorité.
      let meilleurTutoré: { eleveId: string; mastery: number } | null = null;
      let meilleurScore = -1;

      for (const critique of critiques) {
        if (tutorésAssignés.has(critique.eleveId)) continue;
        if (critique.eleveId === tuteur.eleveId) continue;

        const eleveTutoré = elevesParId.get(critique.eleveId);
        if (!eleveTutoré) continue;

        const classeCommune =
          eleveTuteur.classeId !== null &&
          eleveTuteur.classeId !== undefined &&
          eleveTuteur.classeId === eleveTutoré.classeId;

        const memeRegime =
          eleveTuteur.regime !== null &&
          eleveTuteur.regime !== undefined &&
          eleveTuteur.regime === eleveTutoré.regime;

        // Proximité de mastery : l'écart entre tuteur et tutoré (plus c'est
        // élevé, plus le tutorat est pertinent → on normalise sur [0, 1]).
        const ecartMastery = tuteur.mastery - critique.mastery;
        const scoreProximite = Math.min(ecartMastery, 1) * 6;

        const score = (classeCommune ? 3 : 0) + (memeRegime ? 1 : 0) + scoreProximite;

        if (score > meilleurScore) {
          meilleurScore = score;
          meilleurTutoré = critique;
        }
      }

      if (meilleurTutoré) {
        tutorésAssignés.add(meilleurTutoré.eleveId);
        tuteursUtilises.add(tuteur.eleveId);
        tutoresUtilises.add(meilleurTutoré.eleveId);

        const eleveTutoré = elevesParId.get(meilleurTutoré.eleveId)!;
        const classeCommune =
          eleveTuteur.classeId !== null &&
          eleveTuteur.classeId !== undefined &&
          eleveTuteur.classeId === eleveTutoré.classeId;

        paires.push({
          tuteurId: tuteur.eleveId,
          tuteurNom: `${eleveTuteur.prenom} ${eleveTuteur.nom}`,
          eleveId: meilleurTutoré.eleveId,
          eleveNom: `${eleveTutoré.prenom} ${eleveTutoré.nom}`,
          competenceId,
          competenceLibelle: libelle,
          classeCommune,
          scoreCompatibilite: Math.round(meilleurScore * 100) / 100,
        });
      }
    }
  }

  // Trier les paires par score de compatibilité décroissant.
  paires.sort((a, b) => b.scoreCompatibilite - a.scoreCompatibilite);

  // Trier parCompetence par nombre de paires possibles décroissant.
  parCompetence.sort((a, b) => b.pairesPossibles - a.pairesPossibles);

  return {
    paires,
    parCompetence,
    totalPaires: paires.length,
    elevesTuteurs: tuteursUtilises.size,
    elevesTutores: tutoresUtilises.size,
  };
}
