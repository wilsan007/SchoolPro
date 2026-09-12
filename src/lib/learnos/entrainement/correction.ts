import type { ErrorType } from "@prisma/client";
import { normalizeText } from "@/lib/text-match";
import { SEPARATEUR, type EtapeQuestion } from "./structure-question";

// ------------------------------------------------------------
// Correction — déterministe, sans base de données
// ------------------------------------------------------------

/**
 * Tentatives autorisées par étape.
 *
 * Trois, puis l'étape s'ouvre avec sa correction. Bloquer indéfiniment
 * arrêterait l'élève sur la première marche ; ouvrir au premier échec le
 * priverait de la seule chose qui fait progresser, la deuxième idée.
 */
export const TENTATIVES_MAX = 3;

/**
 * Crédit accordé selon la tentative qui a réussi (1 = première).
 *
 * Trouver du premier coup et trouver au troisième essai ne disent pas la même
 * chose de la maîtrise. Le barème dégressif rend aussi le forçage inopérant :
 * enchaîner les propositions d'un QCM à trois choix ne rapporte plus rien.
 */
export function creditTentative(tentative: number): number {
  if (tentative <= 1) return 1;
  if (tentative === 2) return 0.5;
  return 0;
}

/**
 * Lecture numérique tolérante : virgule décimale, espaces, signe.
 * `null` quand la saisie n'est pas un nombre — on retombe alors sur le texte.
 */
function nombre(valeur: string): number | null {
  const nettoye = valeur.trim().replace(/\s/g, "").replace(",", ".");
  if (nettoye === "" || !/^[+-]?\d*\.?\d+$/.test(nettoye)) return null;
  const n = Number(nettoye);
  return Number.isFinite(n) ? n : null;
}

export interface Correction {
  correcte: boolean;
  /**
   * Erreur identifiée, quand le distracteur choisi la désigne. `null` sur une
   * saisie libre fausse : on constate l'écart, on n'en devine pas la cause —
   * inventer un `ErrorType` fabriquerait un diagnostic.
   */
  erreur: ErrorType | null;
}

/**
 * Corrige une réponse d'étape.
 *
 * La comparaison numérique passe avant la textuelle : « 0,5 », « 0.50 » et
 * « .5 » sont la même réponse, et refuser l'une d'elles ferait porter à
 * l'élève le poids d'une convention d'écriture.
 */
export function corrigerEtape(etape: EtapeQuestion, brut: string): Correction {
  const saisie = (brut ?? "").trim();
  if (saisie === "") return { correcte: false, erreur: null };

  if (etape.format === "CHOIX_UNIQUE") {
    if (saisie === etape.reponse) return { correcte: true, erreur: null };
    const choisie = etape.options?.find((o) => o.id === saisie);
    return { correcte: false, erreur: choisie?.erreur ?? null };
  }

  // L'ordre EST la réponse : comparaison positionnelle, sans indulgence. Un
  // barème partiel (« trois éléments sur quatre bien placés ») donnerait des
  // points à une séquence qui, exécutée, ne mène à rien.
  if (etape.format === "REMISE_EN_ORDRE") {
    const correcte = saisie === etape.reponse;
    return {
      correcte,
      // Se tromper d'ordre, c'est se tromper de démarche, pas de calcul.
      erreur: correcte ? null : "PROCEDURAL_ERROR",
    };
  }

  // L'ordre dans lequel l'élève a formé ses paires ne veut rien dire : on
  // compare des ensembles. Sans normalisation, deux élèves ayant apparié la
  // même chose dans un ordre différent seraient notés différemment.
  if (etape.format === "APPARIEMENT") {
    const trier = (v: string) =>
      v
        .split(SEPARATEUR)
        .map((p) => p.trim())
        .filter(Boolean)
        .sort()
        .join(SEPARATEUR);
    const correcte = trier(saisie) === trier(etape.reponse);
    return { correcte, erreur: correcte ? null : "CONCEPTUAL_ERROR" };
  }

  const attendu = nombre(etape.reponse);
  const donne = nombre(saisie);
  if (attendu !== null && donne !== null) {
    const correcte = Math.abs(donne - attendu) <= (etape.tolerance ?? 0);
    // Un écart numérique sur une étape dont la valeur attendue est un nombre
    // est, par construction, une erreur de calcul : c'est la seule inférence
    // que la donnée autorise sans supposition.
    return { correcte, erreur: correcte ? null : "CALCULATION_ERROR" };
  }

  return {
    correcte: normalizeText(saisie) === normalizeText(etape.reponse),
    erreur: null,
  };
}
