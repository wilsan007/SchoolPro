/**
 * EcolPro / LEARNOS — Copies papier : du scan à la preuve
 * =======================================================
 *
 * Ce module raccorde le travail sur papier — celui qui a réellement lieu dans
 * les classes visées — à tout ce que LEARNOS sait faire ensuite : jumeau
 * d'apprentissage, recommandations, parcours, alertes aux familles.
 *
 * LE PROBLÈME
 * -----------
 * Un enseignant fabrique ses exercices sur une feuille, la photocopie, la
 * distribue, corrige les copies au stylo rouge et note dans la marge. Rien de
 * cela n'existe pour le système : les compétences travaillées ne sont rattachées
 * à personne, la notation reste sur le papier, et le jumeau d'apprentissage
 * continue de dire « nous n'en savons pas assez » alors que l'enseignant, lui,
 * sait. Demander la double saisie de chaque note dans un formulaire serait la
 * réponse évidente — et personne ne le ferait au-delà de deux semaines.
 *
 * LES DEUX MOMENTS, ET LEUR ASYMÉTRIE
 * -----------------------------------
 *   1. **La feuille d'énoncés** est scannée une fois, avant distribution. On en
 *      tire les exercices, leur barème, et une proposition de rattachement aux
 *      compétences du curriculum. Chaque élève reçoit alors sa propre feuille
 *      dans le système : c'est ce qui rend la suite individuelle.
 *   2. **Les copies corrigées** sont scannées après correction. On en tire le
 *      nom de l'élève et les notes que l'enseignant a écrites. On ne corrige
 *      rien, on ne juge rien : on **récupère un jugement déjà porté**.
 *
 * CE QUE LE MODÈLE FAIT, ET CE QU'IL NE FAIT PAS
 * ----------------------------------------------
 * Le modèle de vision **transcrit** (voir `src/lib/ocr/vision.ts`). Tout le
 * reste — découper en exercices, retrouver les barèmes, rattacher aux
 * compétences, apparier l'élève, valider la cohérence des points — est fait ici
 * par des règles, sur le texte transcrit. Deux raisons, et la seconde est la
 * vraie :
 *
 *   - LEARNOS §38 : une tâche que des règles traitent ne se paie pas en appels
 *     de modèle ;
 *   - une note est un **fait**. Un modèle à qui l'on demande « quelle note a
 *     l'exercice 3 ? » répond toujours quelque chose, y compris quand la marge
 *     est vide. Une expression régulière qui ne trouve rien ne trouve rien, et
 *     c'est exactement ce qu'il faut afficher à l'enseignant.
 *
 * RIEN N'EST ÉCRIT SANS L'ENSEIGNANT
 * ----------------------------------
 * L'analyse ne touche pas la base. L'enseignant voit ce qui a été lu, chaque
 * anomalie relevée, corrige ce qui doit l'être, puis applique. C'est cette
 * confirmation — et non la qualité de l'OCR — qui autorise la preuve produite à
 * compter pour ce qu'elle est : une évaluation supervisée.
 */

import type { EvidenceType, PalierExercice, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  mergeFilters,
  personalScopeFilter,
  siteFilterForModel,
  type SessionSiteClaims,
} from "@/lib/site-scope";
import { calculerSignal, evidenceId } from "@/lib/learnos/evidence-engine";
import { recalculerProfil } from "@/lib/learnos/learning-twin";
import { recalculerRecommandation } from "@/lib/learnos/recommendation-engine";
import { evaluerBesoinDePlans, synchroniserEtapes } from "@/lib/learnos/plan-engine";
// Importé du module de conventions, pas de `@/lib/ocr` : le domaine n'a besoin
// que de cette constante, et charger l'aiguilleur amènerait Tesseract, sharp et
// pdf.js dans un fichier — et dans des tests — qui n'en font rien.
import { MARQUE_ILLISIBLE } from "@/lib/ocr/texte";

/**
 * Type de feuille des exercices sur papier.
 *
 * Valeur distincte de `entrainement` / `diagnostic` / `jalon` / `attestation`
 * (cf. `FeuilleExercices.type`) : une feuille papier est faite en classe, sous
 * les yeux de l'enseignant, et corrigée par lui. Elle produit donc une preuve
 * **supervisée** — c'est cette qualité qui la distingue de l'entraînement
 * autonome, et elle se perdrait si on réutilisait `entrainement`.
 */
export const TYPE_FEUILLE_PAPIER = "papier";

/** Nature de la preuve produite par une feuille papier. */
export const EVIDENCE_TYPE_PAPIER: EvidenceType = "EXERCICE";

/** Palier retenu faute d'indication de l'enseignant. */
export const PALIER_PAR_DEFAUT: PalierExercice = "APPLICATION";

/** Barème retenu quand la feuille n'en porte aucun pour un exercice. */
export const BAREME_PAR_DEFAUT = 1;

// ============================================================
// 1. Lecture des énoncés
// ============================================================

export interface ExerciceLu {
  /** Numéro porté par la feuille — celui que l'enseignant a écrit. */
  numero: number;
  enonce: string;
  bareme: number;
  /** `true` si le barème vient de la feuille, `false` s'il est supposé. */
  baremeLu: boolean;
}

/**
 * Repères de début d'exercice, du plus explicite au plus discret.
 *
 * L'ordre compte : « Exercice 3 » est un début d'exercice sans ambiguïté, alors
 * qu'un « 3) » en tête de ligne peut aussi être une sous-question. On accepte
 * les deux — un découpage trop fin se corrige en un clic dans l'écran de revue,
 * alors qu'un exercice manquant passe inaperçu.
 */
const DEBUT_EXERCICE = [
  /^\s*(?:exercice|exo|ex\.?|question|probl[eè]me)\s*(?:n[°o]?\s*)?(\d{1,2})\b/i,
  /^\s*(\d{1,2})\s*[).\-–:]\s+/,
];

/** Barème annoncé : « /5 », « (5 points) », « sur 5 pts », « barème : 5 ». */
const BAREME = [
  /\/\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:pts?|points?)?\s*\)?\s*$/i,
  /\(?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:pts?|points?)\s*\)?/i,
  /\bsur\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:pts?|points?)?/i,
  /\bbar[eè]me\s*:?\s*(\d{1,3}(?:[.,]\d{1,2})?)/i,
];

/** Convertit « 12,5 » comme « 12.5 » — les copies djiboutiennes usent des deux. */
export function nombreFr(brut: string): number {
  return Number.parseFloat(brut.replace(",", "."));
}

/**
 * Découpe une transcription d'énoncés en exercices.
 *
 * Purement textuel, donc testable sans OCR ni base : c'est la fonction qui porte
 * la garantie, et c'est elle qu'on teste sur de vraies transcriptions.
 */
export function extraireExercices(texte: string): ExerciceLu[] {
  const lignes = texte
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);

  const exercices: ExerciceLu[] = [];
  let courant: { numero: number; lignes: string[] } | null = null;

  const clore = () => {
    if (!courant) return;
    const bloc = courant.lignes.join(" ").trim();
    if (bloc.length > 0) {
      // Barème cherché ligne par ligne, et non sur le bloc recollé : un « /6 »
      // écrit en fin de ligne cesse d'être en fin de ligne dès qu'on colle la
      // ligne suivante derrière, et le motif le plus fiable ne matche plus.
      const bareme = courant.lignes.reduce<number | null>(
        (trouve, ligne) => trouve ?? baremeDeTexte(ligne),
        null
      );
      exercices.push({
        numero: courant.numero,
        enonce: bloc.slice(0, 2000),
        bareme: bareme ?? BAREME_PAR_DEFAUT,
        baremeLu: bareme !== null,
      });
    }
    courant = null;
  };

  for (const ligne of lignes) {
    const debut = DEBUT_EXERCICE.map((r) => ligne.match(r)).find(Boolean);
    if (debut) {
      clore();
      const numero = Number.parseInt(debut[1], 10);
      // Le reste de la ligne appartient déjà à l'exercice : sur une feuille
      // manuscrite, l'énoncé commence le plus souvent juste après le numéro.
      const reste = ligne.slice(debut[0].length).trim();
      courant = { numero, lignes: reste ? [reste] : [] };
      continue;
    }
    if (courant) courant.lignes.push(ligne);
    // Avant le premier exercice : en-tête de la feuille (classe, date, consigne
    // générale). Volontairement ignoré — ce n'est pas un exercice.
  }
  clore();

  // Numéros en double (un « 3) » pris pour un exercice alors qu'il s'agissait
  // d'une sous-question) : on garde le premier bloc et on renumérote les suivants
  // à la suite, plutôt que de produire deux exercices n° 3 indistinguables.
  const vus = new Set<number>();
  let prochain = 0;
  for (const exercice of exercices) {
    prochain = Math.max(prochain, exercice.numero);
    if (vus.has(exercice.numero)) exercice.numero = ++prochain;
    vus.add(exercice.numero);
  }

  return exercices.sort((a, b) => a.numero - b.numero);
}

/** Premier barème reconnu dans un texte, ou `null`. */
export function baremeDeTexte(texte: string): number | null {
  for (const motif of BAREME) {
    const trouve = texte.match(motif);
    if (!trouve) continue;
    const valeur = nombreFr(trouve[1]);
    // Un barème nul ou délirant n'est pas un barème : c'est une date, un
    // numéro de page ou une erreur de lecture.
    if (Number.isFinite(valeur) && valeur > 0 && valeur <= 100) return valeur;
  }
  return null;
}

// ============================================================
// 2. Rattachement aux compétences
// ============================================================

/** Forme comparable : sans casse, accents, ni ponctuation. */
export function forme(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Mots trop courants pour rapprocher quoi que ce soit.
 *
 * Sans cette liste, « calculer la somme » et « calculer le périmètre » se
 * ressemblent à cause de « calculer » — c'est-à-dire du verbe que partagent la
 * moitié des compétences d'un programme de mathématiques.
 */
const MOTS_VIDES = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "d", "l", "et", "ou", "a",
  "au", "aux", "en", "dans", "sur", "pour", "par", "avec", "que", "qui", "est",
  "son", "sa", "ses", "ce", "cet", "cette", "on", "il", "elle", "nous", "vous",
  "calculer", "calcule", "donner", "donne", "trouver", "trouve", "exercice",
  "question", "suivant", "suivante", "soit", "puis", "alors", "voici",
]);

function motsSignifiants(texte: string): Set<string> {
  return new Set(
    forme(texte)
      .split(" ")
      .filter((mot) => mot.length > 2 && !MOTS_VIDES.has(mot))
  );
}

/**
 * Proximité lexicale entre un énoncé et un libellé de compétence (0..1).
 *
 * Indice de Jaccard sur les mots signifiants, rapporté au libellé : c'est lui
 * qui est court et spécifique, alors que l'énoncé contient des données de
 * l'exercice sans rapport avec la compétence.
 */
export function proximite(enonce: string, libelle: string): number {
  const mots = motsSignifiants(libelle);
  if (mots.size === 0) return 0;
  const dansEnonce = motsSignifiants(enonce);
  let communs = 0;
  for (const mot of mots) if (dansEnonce.has(mot)) communs++;
  return communs / mots.size;
}

/**
 * Score en deçà duquel on ne propose rien.
 *
 * Proposer une compétence au hasard est pire que ne rien proposer : l'enseignant
 * qui applique sans relire rattacherait des preuves à la mauvaise compétence, et
 * le jumeau d'apprentissage deviendrait faux **avec** l'apparence du travail
 * bien fait. Un champ vide, lui, se voit.
 */
export const PROXIMITE_MINIMALE = 0.34;

export interface CompetenceCandidate {
  id: string;
  code: string;
  libelle: string;
}

export interface RattachementPropose {
  competenceId: string | null;
  /** Score de la proposition, 0 quand il n'y en a pas. */
  score: number;
  /** Autres compétences plausibles, pour l'écran de revue. */
  alternatives: { competenceId: string; score: number }[];
}

/**
 * Propose la compétence travaillée par un exercice.
 *
 * Déterministe : deux fois le même énoncé donne deux fois la même proposition, et
 * un enseignant peut comprendre pourquoi celle-là a été proposée.
 */
export function rattacherCompetence(
  enonce: string,
  competences: CompetenceCandidate[]
): RattachementPropose {
  const scores = competences
    .map((c) => ({ competenceId: c.id, score: proximite(enonce, c.libelle) }))
    .filter((s) => s.score >= PROXIMITE_MINIMALE)
    .sort((a, b) => b.score - a.score);

  if (scores.length === 0) return { competenceId: null, score: 0, alternatives: [] };

  // Deux compétences au même score : aucune n'est *la* réponse. On propose
  // quand même la première mais on remonte les autres — c'est le cas typique de
  // deux compétences voisines du même chapitre, que seul l'enseignant sépare.
  return {
    competenceId: scores[0].competenceId,
    score: scores[0].score,
    alternatives: scores.slice(1, 4),
  };
}

// ============================================================
// 3. Lecture d'une copie corrigée
// ============================================================

/** Nom de l'élève, tel qu'écrit sur la copie. */
export function extraireNom(texte: string): string {
  const lignes = texte.split("\n").slice(0, 12);
  for (const ligne of lignes) {
    // Pas de `\b` en tête : la limite de mot ASCII ne reconnaît pas un « É », et
    // « Élève : … » en début de ligne — la forme la plus courante — n'aurait
    // jamais été reconnu.
    const trouve = ligne.match(
      /(?:nom(?:\s*(?:et|&)\s*pr[eé]nom)?|pr[eé]nom|[eé]l[eè]ve|candidat)\s*:?\s*(.{2,60})$/i
    );
    if (!trouve) continue;

    // Marque d'illisibilité cherchée sur la valeur BRUTE : le nettoyage qui suit
    // retire les crochets, et « [illisible] » deviendrait le nom « illisible ».
    if (trouve[1].includes(MARQUE_ILLISIBLE)) continue;

    const nom = trouve[1]
      .replace(/\b(?:classe|date|matiere|matière|note)\b.*$/i, "")
      .replace(/[^\p{L}\s'\-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (nom.length >= 2) return nom.slice(0, 60);
  }
  return "";
}

export interface EleveCandidat {
  id: string;
  nom: string;
  prenom: string;
}

export interface AppariementEleve {
  eleveId: string | null;
  /** 1 = les deux noms coïncident mot pour mot ; 0 = rien trouvé. */
  confiance: number;
  /** Élèves également plausibles. Non vide ⇒ l'enseignant doit trancher. */
  candidats: { eleveId: string; confiance: number }[];
}

/**
 * Retrouve l'élève d'une copie à partir du nom lu.
 *
 * POURQUOI L'AMBIGUÏTÉ N'EST PAS TRANCHÉE ICI
 * Deux frères dans la même classe, un nom de famille répandu, un prénom omis :
 * l'homonymie est la règle, pas l'exception. Attribuer d'office la copie au
 * premier candidat écrirait la note d'un élève sur le dossier d'un autre — une
 * erreur qui ne se voit pas et ne se répare pas. En cas de doute, on rend la
 * liste et personne ne décide à la place de l'enseignant.
 */
export function apparierEleve(
  nomLu: string,
  eleves: EleveCandidat[]
): AppariementEleve {
  const lu = new Set(forme(nomLu).split(" ").filter((m) => m.length > 1));
  if (lu.size === 0) return { eleveId: null, confiance: 0, candidats: [] };

  const scores = eleves
    .map((eleve) => {
      const attendu = new Set(
        forme(`${eleve.prenom} ${eleve.nom}`)
          .split(" ")
          .filter((m) => m.length > 1)
      );
      if (attendu.size === 0) return { eleveId: eleve.id, confiance: 0 };
      let communs = 0;
      for (const mot of attendu) if (lu.has(mot)) communs++;
      // Rapporté au nom attendu : « Ali » seul face à « Ali Hassan » donne 0,5,
      // ce qui est exactement le degré de certitude qu'on a.
      return { eleveId: eleve.id, confiance: communs / attendu.size };
    })
    .filter((s) => s.confiance >= 0.5)
    .sort((a, b) => b.confiance - a.confiance);

  if (scores.length === 0) return { eleveId: null, confiance: 0, candidats: [] };

  const meilleur = scores[0];
  const exAequo = scores.filter((s) => s.confiance === meilleur.confiance);
  if (exAequo.length > 1) {
    return { eleveId: null, confiance: meilleur.confiance, candidats: exAequo.slice(0, 5) };
  }
  return {
    eleveId: meilleur.eleveId,
    confiance: meilleur.confiance,
    candidats: scores.slice(1, 5),
  };
}

export interface NoteLue {
  /** Numéro d'exercice, `null` quand la marge ne le précise pas. */
  numero: number | null;
  points: number;
  /** Barème écrit à côté de la note (le « 5 » de « 3/5 »), si présent. */
  sur: number | null;
  /** Ligne d'origine — c'est elle qui rend la lecture vérifiable. */
  extrait: string;
}

/** Fraction d'une notation : « 3/5 », « 4,5 / 5 ». */
const FRACTION = /(\d{1,3}(?:[.,]\d{1,2})?)\s*\/\s*(\d{1,3}(?:[.,]\d{1,2})?)/;

/** Note globale : « Total : 14/20 », « Note : 12,5/20 ». */
const LIGNE_TOTAL = /\b(?:total|note|moyenne|r[eé]sultat)\b/i;

export interface NotationLue {
  notes: NoteLue[];
  /** Note d'ensemble écrite par l'enseignant, si elle figure sur la copie. */
  total: { points: number; sur: number } | null;
}

/**
 * Récupère la notation portée sur une copie.
 *
 * Le numéro d'exercice se déduit du contexte quand la marge ne le répète pas :
 * un enseignant écrit « 3/5 » en face de l'exercice, pas « exercice 2 : 3/5 ».
 * L'appariement définitif reste fait par `alignerNotes`, qui connaît, lui, la
 * liste réelle des exercices de la feuille.
 */
export function extraireNotes(texte: string): NotationLue {
  const lignes = texte
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);

  const notes: NoteLue[] = [];
  let total: { points: number; sur: number } | null = null;
  let dernierNumero: number | null = null;

  for (const ligne of lignes) {
    const debut = DEBUT_EXERCICE.map((r) => ligne.match(r)).find(Boolean);
    if (debut) dernierNumero = Number.parseInt(debut[1], 10);

    const fraction = ligne.match(FRACTION);
    if (!fraction) continue;

    const points = nombreFr(fraction[1]);
    const sur = nombreFr(fraction[2]);
    if (!Number.isFinite(points) || !Number.isFinite(sur) || sur <= 0) continue;

    // Une ligne « Total : 14/20 » n'est pas la note d'un exercice : la compter
    // comme telle ajouterait une note fantôme et ferait échouer la vérification
    // du nombre de notes.
    if (LIGNE_TOTAL.test(ligne) && !debut) {
      total = { points, sur };
      continue;
    }

    notes.push({
      numero: debut ? Number.parseInt(debut[1], 10) : dernierNumero,
      points,
      sur,
      extrait: ligne.slice(0, 200),
    });
  }

  return { notes, total };
}

// ============================================================
// 4. Validation
// ============================================================

export type MotifAnomalie =
  /** Le nombre de notes lues ne correspond pas au nombre d'exercices. */
  | "nombre_de_notes"
  /** Aucune note trouvée pour cet exercice. */
  | "note_manquante"
  /** Points supérieurs au barème de l'exercice. */
  | "points_hors_bareme"
  /** Le barème écrit à côté de la note diffère de celui de l'exercice. */
  | "bareme_different"
  /** La somme des points ne correspond pas au total écrit sur la copie. */
  | "total_incoherent"
  /** Le modèle a signalé une zone illisible. */
  | "illisible";

export interface Anomalie {
  motif: MotifAnomalie;
  /** Exercice concerné, quand l'anomalie est locale. */
  numero?: number;
  /** Valeurs en cause, destinées à l'affichage. */
  params?: Record<string, string | number>;
}

export interface ExerciceDeFeuille {
  exerciceId: string;
  numero: number;
  bareme: number;
}

export interface NoteRetenue {
  exerciceId: string;
  numero: number;
  points: number;
  bareme: number;
  extrait: string;
}

/** Écart toléré entre la somme des points et le total écrit sur la copie. */
const TOLERANCE_TOTAL = 0.01;

/**
 * Confronte la notation lue aux exercices réellement assignés.
 *
 * Ne corrige rien d'elle-même. Une note hors barème n'est pas ramenée au
 * barème : elle est **écartée** et signalée. Ramener silencieusement 7/5 à 5/5
 * inventerait la décision d'un enseignant, alors que c'est presque toujours une
 * erreur de lecture (« 1/5 » lu « 7/5 ») que lui seul peut trancher.
 */
export function alignerNotes(
  exercices: ExerciceDeFeuille[],
  lecture: NotationLue,
  texteBrut = ""
): { retenues: NoteRetenue[]; anomalies: Anomalie[] } {
  const anomalies: Anomalie[] = [];
  const parNumero = new Map(exercices.map((e) => [e.numero, e]));

  // Notes sans numéro : appariées dans l'ordre aux exercices encore sans note.
  // C'est le cas d'une copie où l'enseignant a aligné ses notes dans la marge
  // sans les renuméroter.
  const nommees = lecture.notes.filter((n) => n.numero !== null);
  const anonymes = lecture.notes.filter((n) => n.numero === null);

  const retenues = new Map<string, NoteRetenue>();

  const retenir = (exercice: ExerciceDeFeuille, note: NoteLue) => {
    if (note.points < 0 || note.points > exercice.bareme) {
      anomalies.push({
        motif: "points_hors_bareme",
        numero: exercice.numero,
        params: { points: note.points, bareme: exercice.bareme },
      });
      return;
    }
    if (note.sur !== null && Math.abs(note.sur - exercice.bareme) > TOLERANCE_TOTAL) {
      // La note reste retenue : le barème écrit sur la copie fait foi pour
      // l'enseignant, mais c'est celui de l'exercice qui structure la preuve.
      // On signale la divergence pour qu'il tranche.
      anomalies.push({
        motif: "bareme_different",
        numero: exercice.numero,
        params: { copie: note.sur, feuille: exercice.bareme },
      });
    }
    retenues.set(exercice.exerciceId, {
      exerciceId: exercice.exerciceId,
      numero: exercice.numero,
      points: note.points,
      bareme: exercice.bareme,
      extrait: note.extrait,
    });
  };

  for (const note of nommees) {
    const exercice = parNumero.get(note.numero as number);
    if (!exercice) {
      anomalies.push({
        motif: "nombre_de_notes",
        numero: note.numero as number,
        params: { lues: lecture.notes.length, attendues: exercices.length },
      });
      continue;
    }
    retenir(exercice, note);
  }

  for (const note of anonymes) {
    const libre = exercices.find((e) => !retenues.has(e.exerciceId));
    if (!libre) break;
    retenir(libre, note);
  }

  for (const exercice of exercices) {
    if (!retenues.has(exercice.exerciceId)) {
      anomalies.push({ motif: "note_manquante", numero: exercice.numero });
    }
  }

  if (lecture.total) {
    const somme = [...retenues.values()].reduce((n, r) => n + r.points, 0);
    if (Math.abs(somme - lecture.total.points) > TOLERANCE_TOTAL) {
      // Le meilleur contrôle disponible : l'enseignant a fait l'addition, et
      // elle contredit la lecture. Une note a été mal lue, ou il en manque une.
      anomalies.push({
        motif: "total_incoherent",
        params: { somme, total: lecture.total.points },
      });
    }
  }

  if (texteBrut.includes(MARQUE_ILLISIBLE)) {
    anomalies.push({ motif: "illisible" });
  }

  return {
    retenues: [...retenues.values()].sort((a, b) => a.numero - b.numero),
    anomalies,
  };
}

// ============================================================
// 5. Écritures — feuilles individuelles
// ============================================================

export class ErreurCopie extends Error {
  constructor(
    message: string,
    readonly code:
      | "feuille_introuvable"
      | "competence_hors_matiere"
      | "eleve_hors_perimetre"
      | "points_hors_bareme"
  ) {
    super(message);
    this.name = "ErreurCopie";
  }
}

export interface ExerciceAEcrire {
  numero: number;
  enonce: string;
  bareme: number;
  competenceId: string;
  palier?: PalierExercice;
}

export interface ResultatFeuilles {
  questionsCreees: number;
  feuilles: { feuilleId: string; eleveId: string }[];
  /** Élèves écartés, avec leur motif — jamais silencieusement. */
  ignores: { eleveId: string; motif: "hors_perimetre" }[];
}

/**
 * Crée la banque de questions correspondant à la feuille papier, puis une
 * feuille par élève.
 *
 * DEUX DÉCISIONS À CONNAÎTRE
 * --------------------------
 * **Une question par exercice, partagée par tous les élèves.** L'énoncé est le
 * même pour toute la classe ; le dupliquer par élève gonflerait la banque et
 * empêcherait de voir, plus tard, que trente élèves ont buté sur *le même*
 * exercice.
 *
 * **Les questions naissent au format `SAISIE_LIBRE`.** Ce format n'est pas
 * auto-corrigeable (cf. `FORMATS_AUTO_CORRIGEABLES`), donc jamais servi en
 * entraînement autonome : un exercice conçu pour le papier ne se retrouvera pas
 * proposé en ligne à un élève, où il serait incorrigible. La contrainte
 * existante fait exactement ce qu'il faut ici, sans réglage supplémentaire.
 */
export async function creerFeuillesPapier(
  tenantId: string,
  claims: SessionSiteClaims,
  input: {
    matiereId: string;
    eleveIds: string[];
    exercices: ExerciceAEcrire[];
  },
  maintenant: Date = new Date()
): Promise<ResultatFeuilles> {
  const competenceIds = [...new Set(input.exercices.map((e) => e.competenceId))];

  // Compétences vérifiées comme un tout : la matière ET le périmètre de
  // l'appelant. Un identifiant venu d'ailleurs ne doit pas permettre de
  // rattacher des preuves à une compétence d'un autre site.
  const competences = await prisma.competence.findMany({
    where: {
      id: { in: competenceIds },
      tenantId,
      chapitre: { matiereId: input.matiereId },
      ...siteFilterForModel("competence", claims),
    },
    select: { id: true },
  });
  if (competences.length !== competenceIds.length) {
    throw new ErreurCopie(
      "Une ou plusieurs compétences sont hors de la matière ou du périmètre.",
      "competence_hors_matiere"
    );
  }

  const eleves = await prisma.eleve.findMany({
    where: mergeFilters(
      { id: { in: input.eleveIds }, tenantId },
      siteFilterForModel("eleve", claims)
    ),
    select: { id: true, siteId: true },
  });
  if (eleves.length === 0) {
    throw new ErreurCopie("Aucun élève accessible dans cette liste.", "eleve_hors_perimetre");
  }
  const accessibles = new Set(eleves.map((e) => e.id));
  const ignores = input.eleveIds
    .filter((id) => !accessibles.has(id))
    .map((eleveId) => ({ eleveId, motif: "hors_perimetre" as const }));

  // `siteId` des questions : celui de la matière, pas celui du premier élève —
  // une question appartient au curriculum, pas à l'enfant qui la reçoit.
  const matiere = await prisma.matiere.findFirst({
    where: { id: input.matiereId, tenantId, ...siteFilterForModel("matiere", claims) },
    select: { siteId: true },
  });

  const questions = await Promise.all(
    input.exercices.map((exercice) =>
      prisma.question.create({
        data: {
          tenantId,
          siteId: matiere?.siteId ?? null,
          competenceId: exercice.competenceId,
          palier: exercice.palier ?? PALIER_PAR_DEFAUT,
          enonce: exercice.enonce,
          format: "SAISIE_LIBRE",
          // `structure` volontairement absent : un énoncé en rédaction libre n'a
          // ni étapes ni réponses attendues à décrire.
          bareme: exercice.bareme,
          // « humain » : l'énoncé a été écrit par l'enseignant. L'OCR ne l'a pas
          // inventé, il l'a recopié — et l'enseignant a relu cette
          // transcription avant d'appliquer. Le marquer « ia » ferait peser sur
          // les preuves un doute qui ne porte pas sur l'énoncé.
          origine: "humain",
          createdAt: maintenant,
        },
        select: { id: true, competenceId: true, palier: true },
      })
    )
  );

  const feuilles: { feuilleId: string; eleveId: string }[] = [];
  for (const eleve of eleves) {
    const feuille = await prisma.feuilleExercices.create({
      data: {
        tenantId,
        siteId: eleve.siteId,
        eleveId: eleve.id,
        matiereId: input.matiereId,
        type: TYPE_FEUILLE_PAPIER,
        // Distribuée sur papier : la feuille est assignée de fait. `assigneeLe`
        // est renseigné pour la même raison — la date de distribution est celle
        // de l'import, et c'est elle qui datera la preuve.
        statut: "ASSIGNEE",
        assigneeLe: maintenant,
        exercices: {
          create: input.exercices.map((exercice, i) => ({
            questionId: questions[i].id,
            competenceId: exercice.competenceId,
            ordre: exercice.numero,
            palier: exercice.palier ?? PALIER_PAR_DEFAUT,
            regleDeclenchee: "exercice_papier",
            motifParams: {
              numero: exercice.numero,
              source: "scan",
            } as unknown as Prisma.InputJsonValue,
            priorite: 1,
          })),
        },
        createdAt: maintenant,
      },
      select: { id: true },
    });
    feuilles.push({ feuilleId: feuille.id, eleveId: eleve.id });
  }

  return { questionsCreees: questions.length, feuilles, ignores };
}

// ============================================================
// 6. Écritures — notation récupérée
// ============================================================

export interface ExercicePourNotation extends ExerciceDeFeuille {
  competenceId: string;
  palier: PalierExercice;
  questionId: string;
}

export interface FeuillePapier {
  feuilleId: string;
  eleveId: string;
  eleveNom: string;
  elevePrenom: string;
  siteId: string | null;
  matiereId: string | null;
  exercices: ExercicePourNotation[];
}

/**
 * Feuilles papier en attente de notation, pour une classe.
 *
 * Sert à l'appariement d'une copie scannée : on ne cherche pas l'élève dans tout
 * l'établissement, mais parmi ceux qui ont effectivement reçu cette feuille.
 * C'est ce qui rend l'appariement par nom tenable — une classe compte trente
 * élèves, un établissement mille.
 */
export async function feuillesPapierEnAttente(
  tenantId: string,
  claims: SessionSiteClaims,
  filtre: { classeId?: string; matiereId?: string; feuilleId?: string }
): Promise<FeuillePapier[]> {
  const feuilles = await prisma.feuilleExercices.findMany({
    where: mergeFilters(
      {
        tenantId,
        type: TYPE_FEUILLE_PAPIER,
        statut: { in: ["ASSIGNEE", "EN_COURS"] },
        ...(filtre.feuilleId ? { id: filtre.feuilleId } : {}),
        ...(filtre.matiereId ? { matiereId: filtre.matiereId } : {}),
        ...(filtre.classeId ? { eleve: { classeId: filtre.classeId } } : {}),
      },
      siteFilterForModel("feuilleExercices", claims)
    ),
    select: {
      id: true,
      siteId: true,
      matiereId: true,
      eleve: { select: { id: true, nom: true, prenom: true } },
      exercices: {
        select: {
          id: true,
          ordre: true,
          competenceId: true,
          palier: true,
          questionId: true,
          question: { select: { bareme: true } },
        },
        orderBy: { ordre: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return feuilles.map((f) => ({
    feuilleId: f.id,
    eleveId: f.eleve.id,
    eleveNom: f.eleve.nom,
    elevePrenom: f.eleve.prenom,
    siteId: f.siteId,
    matiereId: f.matiereId,
    exercices: f.exercices.map((e) => ({
      exerciceId: e.id,
      numero: e.ordre,
      bareme: e.question.bareme,
      competenceId: e.competenceId,
      palier: e.palier,
      questionId: e.questionId,
    })),
  }));
}

export interface ResultatNotation {
  exercicesNotes: number;
  competences: string[];
  feuilleTerminee: boolean;
  score: number;
  maxScore: number;
}

/**
 * Enregistre la notation d'une copie, et produit les preuves correspondantes.
 *
 * POURQUOI LA PREUVE VAUT SON PLEIN POIDS
 * ---------------------------------------
 * La note vient d'un enseignant qui a lu la copie, en classe, et l'a confirmée à
 * l'écran après lecture de la transcription. Rien dans cette chaîne ne relève de
 * la conjecture : l'OCR n'a pas noté, il a recopié une note. Lui appliquer une
 * décote « parce que c'est passé par une IA » reviendrait à pénaliser
 * l'enseignant d'avoir gagné du temps — et à sous-estimer durablement des élèves
 * évalués sur papier, qui sont la majorité.
 *
 * Ce qui reste vrai, en revanche, c'est la fiabilité ordinaire du type de
 * production : `EXERCICE` (0,6), la même que pour un exercice fait en classe.
 */
export async function appliquerNotesCopie(
  tenantId: string,
  claims: SessionSiteClaims,
  input: {
    feuilleId: string;
    notes: { exerciceId: string; points: number }[];
    corrigeParId: string;
  },
  maintenant: Date = new Date()
): Promise<ResultatNotation> {
  const [feuille] = await feuillesPapierEnAttente(tenantId, claims, {
    feuilleId: input.feuilleId,
  });
  if (!feuille) {
    throw new ErreurCopie("Feuille papier introuvable ou déjà close.", "feuille_introuvable");
  }

  const parId = new Map(feuille.exercices.map((e) => [e.exerciceId, e]));
  const aEcrire: { exercice: ExercicePourNotation; points: number }[] = [];

  for (const note of input.notes) {
    const exercice = parId.get(note.exerciceId);
    // Un exercice inconnu de la feuille est écarté, pas ignoré en silence : il
    // signale un client désynchronisé, pas une situation métier.
    if (!exercice) {
      throw new ErreurCopie("Exercice absent de cette feuille.", "feuille_introuvable");
    }
    if (!Number.isFinite(note.points) || note.points < 0 || note.points > exercice.bareme) {
      throw new ErreurCopie(
        `Points hors barème pour l'exercice ${exercice.numero} : ${note.points}/${exercice.bareme}.`,
        "points_hors_bareme"
      );
    }
    aEcrire.push({ exercice, points: note.points });
  }

  const competencesTouchees = new Set<string>();
  let score = 0;
  let maxScore = 0;

  for (const { exercice, points } of aEcrire) {
    const donnees = {
      // Aucune réponse d'élève n'est saisie : elle est sur le papier. Ce champ
      // resté vide est la marque honnête de ce que le système ne détient pas.
      reponse: null,
      score: points,
      maxScore: exercice.bareme,
      corrigeParId: input.corrigeParId,
      corrigeeLe: maintenant,
    };

    await prisma.exerciceReponse.upsert({
      where: { exerciceAssigneId: exercice.exerciceId },
      create: { exerciceAssigneId: exercice.exerciceId, ...donnees },
      update: donnees,
    });

    await produirePreuveCopie(tenantId, feuille, exercice, points, maintenant);
    competencesTouchees.add(exercice.competenceId);
    score += points;
    maxScore += exercice.bareme;
  }

  await prisma.feuilleExercices.updateMany({
    where: { id: feuille.feuilleId, tenantId, statut: "ASSIGNEE" },
    data: { statut: "EN_COURS" },
  });

  // Recalculs après **toutes** les écritures, une fois par compétence : les
  // faire dans la boucle rejouerait l'agrégation à chaque exercice et
  // produirait des états intermédiaires visibles par un autre lecteur.
  for (const competenceId of competencesTouchees) {
    await recalculerProfil(tenantId, feuille.eleveId, competenceId, maintenant);
    await recalculerRecommandation(tenantId, feuille.eleveId, competenceId, maintenant);
    await synchroniserEtapes(tenantId, feuille.eleveId, competenceId, maintenant);
  }

  const feuilleTerminee = await cloturerSiComplete(
    tenantId,
    feuille.feuilleId,
    feuille.eleveId,
    maintenant
  );

  return {
    exercicesNotes: aEcrire.length,
    competences: [...competencesTouchees],
    feuilleTerminee,
    score,
    maxScore,
  };
}

/**
 * Transforme une note de copie en preuve d'apprentissage.
 *
 * Même patron que la voie « exercice en ligne » (cf. `produirePreuve` dans
 * `entrainement.ts`) : identifiant dérivé de la source, donc rejouer la même
 * correction met à jour la même ligne au lieu d'empiler les preuves. C'est ce
 * qui rend une correction rescannée — parce qu'une note avait été mal lue —
 * inoffensive.
 */
async function produirePreuveCopie(
  tenantId: string,
  feuille: FeuillePapier,
  exercice: ExercicePourNotation,
  points: number,
  maintenant: Date
): Promise<void> {
  const signal = calculerSignal({
    valeur: points,
    noteMax: exercice.bareme,
    // Aucun coefficient déclaré pour une feuille d'exercices : le poids neutre
    // est le seul honnête, comme pour l'entraînement.
    coefficient: 1,
    evidenceType: EVIDENCE_TYPE_PAPIER,
  });

  const id = evidenceId("exercice", exercice.exerciceId, exercice.competenceId);

  const donnees = {
    tenantId,
    siteId: feuille.siteId,
    eleveId: feuille.eleveId,
    competenceId: exercice.competenceId,
    matiereId: feuille.matiereId,
    sourceType: "exercice",
    sourceId: exercice.exerciceId,
    noteId: null,
    evaluationId: null,
    evidenceType: EVIDENCE_TYPE_PAPIER,
    rawScore: points,
    maxScore: exercice.bareme,
    occurredAt: maintenant,
    masterySignal: signal.masterySignal,
    confidence: signal.confidence,
    weight: signal.weight,
    // Rien n'est observé du raisonnement : la copie est sur le papier, et
    // deviner le type d'erreur à partir d'un score serait une invention.
    errorType: null,
    errorConfidence: null,
    metadata: {
      palier: exercice.palier,
      questionId: exercice.questionId,
      typeFeuille: TYPE_FEUILLE_PAPIER,
      regleDeclenchee: "exercice_papier",
      numero: exercice.numero,
      // Trace de la provenance : la note a été lue sur un scan puis confirmée.
      // Un doute soulevé plus tard sur une notation doit pouvoir remonter à ce
      // fait, sans quoi la preuve devient inexplicable.
      provenance: "copie_scannee",
    },
  };

  const preuve = await prisma.learningEvidence.upsert({
    where: { id },
    create: { id, ...donnees },
    update: donnees,
  });

  await prisma.exerciceReponse.update({
    where: { exerciceAssigneId: exercice.exerciceId },
    data: { evidenceId: preuve.id },
  });
}

/** Ferme la feuille quand tous ses exercices portent une note. */
async function cloturerSiComplete(
  tenantId: string,
  feuilleId: string,
  eleveId: string,
  maintenant: Date
): Promise<boolean> {
  // eslint-disable-next-line ecolpro/require-site-filter
  const sansReponse = await prisma.exerciceAssigne.count({
    where: { feuille: { id: feuilleId, tenantId }, reponse: { is: null } },
  });
  const sansScore = await prisma.exerciceReponse.count({
    where: { exercice: { feuille: { id: feuilleId, tenantId } }, score: null },
  });
  if (sansReponse + sansScore > 0) return false;

  await prisma.feuilleExercices.updateMany({
    where: { id: feuilleId, tenantId, statut: { in: ["ASSIGNEE", "EN_COURS"] } },
    data: { statut: "TERMINEE", termineeLe: maintenant },
  });

  // Même geste qu'à la clôture d'une séance en ligne : un parcours se propose
  // sur une situation d'ensemble, pas exercice par exercice. Proposé seulement —
  // la validation reste humaine.
  await evaluerBesoinDePlans(tenantId, eleveId, maintenant);

  // Volontairement PAS d'attestation en classe ici : l'attestation existe pour
  // lever le doute sur du travail fait sans témoin. Une copie corrigée par
  // l'enseignant est déjà une preuve supervisée — en demander la vérification
  // reviendrait à lui demander de contrôler son propre travail.
  return true;
}

/** Élèves d'une classe, pour l'appariement d'une copie. */
export async function elevesDeClasse(
  tenantId: string,
  claims: SessionSiteClaims,
  classeId: string
): Promise<EleveCandidat[]> {
  return prisma.eleve.findMany({
    where: mergeFilters(
      { tenantId, classeId, statut: "ACTIF" },
      siteFilterForModel("eleve", claims),
      personalScopeFilter(claims, null)
    ),
    select: { id: true, nom: true, prenom: true },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });
}
