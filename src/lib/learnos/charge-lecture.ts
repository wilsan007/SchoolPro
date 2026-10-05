/**
 * EcolPro / LEARNOS — Charge de lecture d'un énoncé
 * =================================================
 *
 * Un exercice a deux difficultés que le palier confond : celle de la notion, et
 * celle du TEXTE qu'il faut lire pour savoir ce qu'on demande. Un élève dont la
 * langue d'enseignement est fragile peut échouer un problème de mathématiques
 * qu'il saurait résoudre, faute d'avoir compris la consigne — et le système en
 * conclurait à tort que ce sont les mathématiques qui manquent.
 *
 * Ce module mesure la seconde difficulté, et dit jusqu'où un élève peut aller.
 * Le sélecteur s'en sert pour choisir, À PALIER ÉGAL, l'énoncé le plus
 * accessible : on n'abaisse jamais le niveau de la notion pour compenser une
 * difficulté de lecture.
 *
 * POURQUOI PAS UN « NIVEAU GLOBAL » DE L'ÉLÈVE
 * -------------------------------------------
 * Une moyenne générale servirait des exercices plus faciles à un élève faible
 * en français mais solide en calcul : elle le pénaliserait là où il réussit. La
 * compréhension de l'énoncé est le seul facteur transversal qui joue réellement
 * sur toutes les matières, et il s'explique à un parent en une phrase.
 *
 * ENTIÈREMENT DÉTERMINISTE
 * ------------------------
 * La charge se calcule à partir du texte — nombre de mots, longueur des
 * phrases. Aucun modèle, aucune colonne en base : une question modifiée est
 * réévaluée au tirage suivant, sans rien à resynchroniser.
 */

import type { StructureQuestion } from "@/lib/learnos/entrainement/structure-question";

export type ChargeLecture = "FAIBLE" | "MOYENNE" | "FORTE";
export type NiveauComprehension = "FRAGILE" | "CORRECTE" | "SOLIDE";

const ORDRE: readonly ChargeLecture[] = ["FAIBLE", "MOYENNE", "FORTE"];

/** Au-delà, l'énoncé demande une lecture soutenue (un problème rédigé). */
const MOTS_CHARGE_FORTE = 90;
/** En deçà, l'énoncé se lit d'un trait (une consigne et ses propositions). */
const MOTS_CHARGE_FAIBLE = 40;
/** Une phrase plus longue impose de tenir plusieurs informations en tête. */
const PHRASE_LONGUE = 35;
const PHRASE_COURTE = 22;

/** Il faut au moins deux compétences mesurées pour parler d'un niveau. */
const MESURES_MINIMALES = 2;

function mots(texte: string): number {
  return texte.split(/\s+/).filter((m) => /[\p{L}\p{N}]/u.test(m)).length;
}

function phraseLaPlusLongue(texte: string): number {
  // Un point entre deux chiffres est une décimale, pas une fin de phrase.
  return Math.max(0, ...texte.split(/(?<!\d)[.!?…:;]+(?!\d)/).map(mots));
}

/**
 * Charge de lecture d'une question.
 *
 * Compte tout ce que l'élève doit lire pour répondre : la consigne de chaque
 * étape, et ses propositions ou paires — un QCM aux distracteurs rédigés pèse
 * autant qu'un énoncé long. L'indice n'est pas compté : il n'apparaît qu'après
 * un échec.
 */
export function chargeLecture(enonce: string, structure: StructureQuestion | null): ChargeLecture {
  const consignes = [enonce, ...(structure?.etapes.map((e) => e.enonce) ?? [])];
  const propositions = (structure?.etapes ?? []).flatMap((e) => [
    ...(e.options?.map((o) => o.texte) ?? []),
    ...(e.paires?.flatMap((p) => [p.gauche, p.droite]) ?? []),
  ]);

  const total = [...consignes, ...propositions].reduce((n, t) => n + mots(t), 0);
  const phrase = Math.max(0, ...[...consignes, ...propositions].map(phraseLaPlusLongue));

  if (total > MOTS_CHARGE_FORTE || phrase > PHRASE_LONGUE) return "FORTE";
  if (total <= MOTS_CHARGE_FAIBLE && phrase <= PHRASE_COURTE) return "FAIBLE";
  return "MOYENNE";
}

/**
 * Niveau de compréhension de la langue d'enseignement.
 *
 * @param scores Maîtrise des compétences MESURÉES dans la matière qui enseigne
 *   cette langue. Les compétences non mesurées n'y figurent pas.
 * @returns `null` tant qu'on n'en sait pas assez. L'absence de mesure n'est pas
 *   une difficulté : l'élève est alors servi sans restriction.
 */
export function niveauComprehension(
  scores: number[],
  seuils: { seuilFragile: number; seuilConsolide: number }
): NiveauComprehension | null {
  if (scores.length < MESURES_MINIMALES) return null;
  const moyenne = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (moyenne < seuils.seuilFragile) return "FRAGILE";
  return moyenne < seuils.seuilConsolide ? "CORRECTE" : "SOLIDE";
}

/** Charge de lecture au-delà de laquelle l'énoncé devient un obstacle. */
export function chargeAccessible(niveau: NiveauComprehension | null): ChargeLecture {
  if (niveau === "FRAGILE") return "FAIBLE";
  if (niveau === "CORRECTE") return "MOYENNE";
  return "FORTE";
}

/** De combien de crans un énoncé dépasse ce que l'élève lit sans peine. */
export function depassement(charge: ChargeLecture, accessible: ChargeLecture): number {
  return Math.max(0, ORDRE.indexOf(charge) - ORDRE.indexOf(accessible));
}

/**
 * Codes de la matière qui enseigne chaque langue d'énoncé.
 *
 * C'est elle qui renseigne sur la compréhension, et c'est aussi la seule où la
 * charge de lecture ne doit PAS être allégée : y lire un texte long est
 * précisément ce qu'on évalue.
 */
export const MATIERES_DE_LANGUE: Record<string, readonly string[]> = {
  fr: ["FR", "FRA", "FRANCAIS"],
  so: ["SO", "SOM", "SOMALI"],
  ar: ["AR", "ARA", "ARABE"],
  en: ["ANG", "EN", "ENG", "ANGLAIS"],
};
