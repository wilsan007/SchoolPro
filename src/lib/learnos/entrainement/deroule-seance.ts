import type { ErrorType } from "@prisma/client";

// ------------------------------------------------------------
// Déroulé d'une séance
// ------------------------------------------------------------

/** Ce qu'on retient d'une étape traitée. Stocké dans `ExerciceReponse.etapes`. */
export interface EtapeFaite {
  index: number;
  /** Dernière réponse soumise. */
  reponse: string;
  correcte: boolean;
  tentatives: number;
  /** Crédit obtenu, entre 0 et `points`. */
  credit: number;
  /** Erreur identifiée à la dernière tentative fausse, si le format la révèle. */
  erreur: ErrorType | null;
  /** Temps mesuré côté serveur. `null` sur la première étape (cf. `dureeEcoulee`). */
  dureeMs: number | null;
}

/**
 * Sous ce seuil, une étape n'a pas été lue : elle a été devinée ou recopiée.
 *
 * Généreux à dessein. Le seuil ne sert pas à accuser — il pondère la confiance
 * d'une séance, et un élève rapide ne doit pas être traité comme un tricheur.
 */
export const DUREE_MIN_ETAPE_MS = 3_000;

/** Nombre d'étapes en deçà duquel le rythme ne veut rien dire. */
const ETAPES_MIN_RYTHME = 3;

/**
 * Décote appliquée à une question générée que personne n'a relue.
 *
 * Le risque n'est pas que l'élève triche : c'est que l'énoncé soit faux. Une
 * réponse attendue erronée compte juste une copie fausse, et fausse une copie
 * juste — l'erreur va dans les deux sens, ce qui interdit de corriger le signal
 * dans un sens ou dans l'autre. Seule la confiance peut absorber ça.
 *
 * 0,7 et non 0,2 : une question générée reste, la plupart du temps, correcte.
 * La traiter comme du travail non surveillé confondrait deux doutes distincts
 * — celui sur l'élève et celui sur l'énoncé — qui se cumulent d'ailleurs très
 * bien (une séance autonome sur question non relue vaut 0,2 × 0,7).
 */
export const FACTEUR_QUESTION_NON_RELUE = 0.7;

export interface FiabiliteSeance {
  /** Multiplicateur appliqué à la confiance de la preuve. */
  facteur: number;
  /** Clé de traduction du motif, ou `null` si rien à signaler. */
  motif: string | null;
}

/**
 * Pondère la confiance d'une séance faite seul, d'après son déroulé.
 *
 * Un sans-faute obtenu en quelques secondes par étape est le seul signal de
 * copie disponible sans surveillance. On ne l'utilise **jamais** pour baisser
 * le score ni pour accuser : il divise la confiance, ce qui revient à dire
 * « cette séance nous apprend encore moins que d'habitude ». Un élève
 * réellement rapide n'y perd rien de réel — son niveau se confirmera en classe.
 */
export function fiabiliteSeance(etapes: EtapeFaite[]): FiabiliteSeance {
  const mesurees = etapes.filter((e) => e.dureeMs !== null);
  if (mesurees.length < ETAPES_MIN_RYTHME) return { facteur: 1, motif: null };

  const sansFaute = etapes.every((e) => e.correcte && e.tentatives === 1);
  if (!sansFaute) return { facteur: 1, motif: null };

  const durees = mesurees.map((e) => e.dureeMs as number).sort((a, b) => a - b);
  const mediane = durees[Math.floor(durees.length / 2)];
  if (mediane >= DUREE_MIN_ETAPE_MS) return { facteur: 1, motif: null };

  return { facteur: 0.4, motif: "seance_rythme_improbable" };
}

/** Erreur la plus fréquente parmi les étapes ratées, ou `null`. */
export function erreurDominante(etapes: EtapeFaite[]): ErrorType | null {
  const comptes = new Map<ErrorType, number>();
  for (const e of etapes) {
    if (e.erreur) comptes.set(e.erreur, (comptes.get(e.erreur) ?? 0) + 1);
  }
  if (comptes.size === 0) return null;
  // Tri total (compte, puis nom) : deux exécutions sur les mêmes données
  // doivent désigner la même erreur.
  return [...comptes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}
