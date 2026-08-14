/**
 * EcolPro / LEARNOS — Entraînement autonome
 * =========================================
 *
 * L'élève travaille seul, sur des exercices choisis par le sélecteur, corrigés
 * immédiatement, sans qu'un enseignant n'intervienne. Ce module tient la
 * séance : il révèle les étapes une à une, corrige chaque réponse, et convertit
 * la séance terminée en preuve d'apprentissage.
 *
 * AUCUN APPEL DE MODÈLE PENDANT LA SÉANCE
 * ---------------------------------------
 * La correction est une comparaison — égalité numérique à tolérance près, ou
 * identifiant de proposition. Trois raisons, dans cet ordre :
 *
 *  1. **Le retour doit être instantané.** Un élève qui attend deux secondes
 *     après chaque étape abandonne avant la fin de l'exercice.
 *  2. **Le coût suit les clics.** Un LLM par réponse, c'est un appel toutes les
 *     dix secondes et par élève : le dispositif ne survit pas au trimestre.
 *  3. **La même copie doit valoir la même chose deux fois.** Un modèle qui
 *     corrige diverge d'une exécution à l'autre, et une contestation devient
 *     indéfendable.
 *
 * L'IA rédige les énoncés **en amont**, dans la banque (`Question.origine`).
 * Rien ici n'en dépend : sans banque générée, l'entraînement tourne sur les
 * questions saisies à la main.
 *
 * CE QUE L'ÉLÈVE NE DOIT JAMAIS RECEVOIR
 * --------------------------------------
 * `Question.structure` contient les réponses attendues. Il ne sort d'ici que
 * par `vueEleve`, qui les retire et ne révèle que les étapes déjà atteintes.
 * Envoyer l'exercice entier au client pour économiser des allers-retours
 * reviendrait à publier le corrigé dans l'onglet réseau.
 *
 * LA TRICHE EST UN PROBLÈME DE CONFIANCE, PAS DE NOTE
 * ---------------------------------------------------
 * Un élève qui copie ne produit pas un score *faux*, il produit un score *dont
 * on ne sait pas ce qu'il vaut*. On ne rabote donc jamais `masterySignal` : on
 * baisse `confidence` (cf. `AUTO_ENTRAINEMENT` dans `FIABILITE_PAR_TYPE`), et
 * le jumeau d'apprentissage refuse de conclure « acquis » sur ces seules
 * preuves. Ni surveillance, ni suspicion : la triche reste possible et sans
 * effet mesurable, ce qui la rend inutile.
 *
 * RIEN N'EST ÉCRIT EN CLAIR
 * -------------------------
 * Comme le sélecteur et les recommandations, les motifs voyagent en clés de
 * traduction (`learnos.regles.exercice_*`) et non en phrases françaises.
 */

import { createHash } from "node:crypto";
import type { ErrorType, EvidenceType, FormatQuestion, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { normalizeText } from "@/lib/text-match";
import {
  type SessionSiteClaims,
  mergeFilters,
  personalScopeFilter,
  siteFilterForModel,
} from "@/lib/site-scope";
import { calculerSignal, evidenceId } from "@/lib/learnos/evidence-engine";
import { recalculerProfil } from "@/lib/learnos/learning-twin";
import { recalculerRecommandation } from "@/lib/learnos/recommendation-engine";
import { synchroniserEtapes, evaluerBesoinDePlans } from "@/lib/learnos/plan-engine";
import { composerFeuille, type OptionsSelection } from "@/lib/learnos/exercice-selector";
import { proposerAttestationsApresSeance } from "@/lib/learnos/attestation";

// ------------------------------------------------------------
// Structure d'une question — schéma et lecture défensive
// ------------------------------------------------------------

/**
 * Format d'une étape — les quatre corrigeables sans enseignant.
 *
 * Tous partagent la même propriété : la réponse de l'élève se ramène à une
 * chaîne courte et comparable. C'est ce qui les distingue d'une rédaction, et
 * ce qui permet à `corrigerEtape` de rester une fonction pure sans modèle.
 */
export type FormatEtape =
  | "SAISIE_COURTE"
  | "CHOIX_UNIQUE"
  | "REMISE_EN_ORDRE"
  | "APPARIEMENT";

/** Séparateur des réponses composées (ordre, appariements). */
export const SEPARATEUR = "|";

export interface OptionEtape {
  id: string;
  texte: string;
  /**
   * Erreur que révèle ce distracteur — absent sur la bonne réponse.
   *
   * C'est ce qui sépare un QCM d'un diagnostic : sans annotation, une réponse
   * fausse dit seulement « raté » ; annotée, elle dit *pourquoi*, et alimente
   * `LearningEvidence.errorType` que la voie « note » laisse toujours vide.
   */
  erreur?: ErrorType;
}

/** Une paire à reconstituer, pour `APPARIEMENT`. */
export interface PaireEtape {
  id: string;
  gauche: string;
  droite: string;
}

export interface EtapeQuestion {
  enonce: string;
  format: FormatEtape;
  /** Propositions — `CHOIX_UNIQUE` et `REMISE_EN_ORDRE`. */
  options?: OptionEtape[];
  /** Paires attendues — `APPARIEMENT` uniquement. */
  paires?: PaireEtape[];
  /**
   * Réponse attendue, sous une forme qui dépend du format :
   *  - `SAISIE_COURTE`   : la valeur elle-même ;
   *  - `CHOIX_UNIQUE`    : l'identifiant de la bonne proposition ;
   *  - `REMISE_EN_ORDRE` : les identifiants dans l'ordre, séparés par `|` ;
   *  - `APPARIEMENT`     : `gauche:droite` par paire, séparés par `|`.
   *
   * Une seule colonne pour les quatre : les stocker séparément multiplierait
   * les chemins de correction, et c'est exactement là que deux implémentations
   * de la même règle finissent par diverger.
   */
  reponse: string;
  /** Tolérance absolue pour une comparaison numérique. Défaut : égalité. */
  tolerance?: number;
  /** Révélé seulement après un premier échec — jamais avant. */
  indice?: string;
  /** Part de l'exercice portée par cette étape. */
  points: number;
}

/**
 * Une question, ramenée à une suite d'étapes.
 *
 * `SAISIE_COURTE` et `CHOIX_UNIQUE` sont représentés comme des suites d'UNE
 * étape : le reste du module n'a alors qu'un seul cas à traiter. Deux chemins
 * de correction pour la même opération finiraient par diverger.
 */
export interface StructureQuestion {
  etapes: EtapeQuestion[];
}

const FORMATS_ETAPE: readonly FormatEtape[] = [
  "SAISIE_COURTE",
  "CHOIX_UNIQUE",
  "REMISE_EN_ORDRE",
  "APPARIEMENT",
];

/**
 * Lit et valide une structure venue de la base.
 *
 * Le JSON n'est pas typé par PostgreSQL : une structure écrite à la main, ou
 * générée par un modèle, peut être incomplète. On refuse ici plutôt que de
 * laisser un élève découvrir l'anomalie au milieu d'un exercice — et l'appelant
 * traite l'exercice comme non servable.
 *
 * @returns `null` si la structure est inexploitable.
 */
export function parseStructure(brut: unknown): StructureQuestion | null {
  if (!brut || typeof brut !== "object") return null;
  const source = brut as { etapes?: unknown };
  if (!Array.isArray(source.etapes) || source.etapes.length === 0) return null;

  const etapes: EtapeQuestion[] = [];
  for (const item of source.etapes) {
    if (!item || typeof item !== "object") return null;
    const e = item as Record<string, unknown>;

    const format = e.format as FormatEtape;
    if (!FORMATS_ETAPE.includes(format)) return null;
    if (typeof e.enonce !== "string" || e.enonce.trim() === "") return null;

    // `APPARIEMENT` fait exception : sa réponse attendue se DÉDUIT des paires
    // (voir plus bas). L'exiger en plus n'ajouterait qu'une occasion de la
    // contredire.
    let reponse = typeof e.reponse === "string" ? e.reponse : "";
    if (format !== "APPARIEMENT" && reponse === "") return null;

    let options: OptionEtape[] | undefined;
    if (format === "CHOIX_UNIQUE" || format === "REMISE_EN_ORDRE") {
      if (!Array.isArray(e.options) || e.options.length < 2) return null;
      options = [];
      for (const o of e.options) {
        if (!o || typeof o !== "object") return null;
        const opt = o as Record<string, unknown>;
        if (typeof opt.id !== "string" || typeof opt.texte !== "string") return null;
        options.push({
          id: opt.id,
          texte: opt.texte,
          erreur: typeof opt.erreur === "string" ? (opt.erreur as ErrorType) : undefined,
        });
      }
      // Des identifiants en double rendraient la correction ambiguë.
      if (new Set(options.map((o) => o.id)).size !== options.length) return null;

      if (format === "CHOIX_UNIQUE") {
        // Une bonne réponse qui ne figure pas dans les propositions rendrait
        // l'étape impossible : c'est une erreur de saisie, pas un exercice dur.
        if (!options.some((o) => o.id === reponse)) return null;
      } else {
        // L'ordre attendu doit être une permutation EXACTE des propositions :
        // ni oubli, ni élément étranger. Sans ce contrôle, une étape resterait
        // insoluble quoi que l'élève propose.
        const attendu = reponse.split(SEPARATEUR);
        const ids = options.map((o) => o.id);
        if (attendu.length !== ids.length) return null;
        if ([...attendu].sort().join() !== [...ids].sort().join()) return null;
      }
    }

    let paires: PaireEtape[] | undefined;
    if (format === "APPARIEMENT") {
      if (!Array.isArray(e.paires) || e.paires.length < 2) return null;
      paires = [];
      for (const p of e.paires) {
        if (!p || typeof p !== "object") return null;
        const paire = p as Record<string, unknown>;
        if (
          typeof paire.id !== "string" ||
          typeof paire.gauche !== "string" ||
          typeof paire.droite !== "string"
        ) {
          return null;
        }
        paires.push({ id: paire.id, gauche: paire.gauche, droite: paire.droite });
      }
      if (new Set(paires.map((p) => p.id)).size !== paires.length) return null;

      // Deux éléments de droite identiques rendraient deux appariements
      // également défendables : l'exercice n'aurait plus de bonne réponse.
      if (new Set(paires.map((p) => normalizeText(p.droite))).size !== paires.length) {
        return null;
      }

      // Chaque élément de gauche va avec l'élément de droite de la MÊME paire :
      // l'appariement correct est l'identité.
      reponse = paires.map((p) => `${p.id}:${p.id}`).join(SEPARATEUR);
    }

    const points = typeof e.points === "number" && e.points > 0 ? e.points : 1;

    etapes.push({
      enonce: e.enonce,
      format,
      options,
      paires,
      reponse,
      tolerance: typeof e.tolerance === "number" ? e.tolerance : undefined,
      indice: typeof e.indice === "string" ? e.indice : undefined,
      points,
    });
  }

  return { etapes };
}

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

// ------------------------------------------------------------
// Projection destinée à l'élève
// ------------------------------------------------------------

export interface EtapeVue {
  index: number;
  enonce: string;
  format: FormatEtape;
  /** Propositions sans leur annotation d'erreur, dans l'ordre de la banque. */
  options?: { id: string; texte: string }[];
  /**
   * Colonnes d'un appariement, **séparées et mélangées**.
   *
   * Envoyer les paires telles quelles donnerait la solution : c'est
   * l'appartenance d'un `gauche` et d'un `droite` à la même paire qui EST la
   * réponse. On envoie donc deux listes indépendantes, celle de droite dans un
   * ordre stable mais décorrélé de celle de gauche.
   */
  gauche?: { id: string; texte: string }[];
  droite?: { id: string; texte: string }[];
  /** Révélé seulement après un échec. */
  indice: string | null;
  /** Tentatives déjà consommées sur cette étape. */
  tentatives: number;
  /** `null` tant que l'étape est ouverte. */
  correcte: boolean | null;
  reponse: string | null;
  /** Réponse attendue, révélée UNIQUEMENT une fois l'étape close. */
  corrige: string | null;
}

export interface ExerciceVue {
  id: string;
  ordre: number;
  palier: string;
  format: FormatQuestion;
  enonce: string;
  competenceLibelle: string;
  /** Clé de traduction du motif + ses paramètres. Jamais une phrase figée. */
  regleDeclenchee: string;
  motifParams: Record<string, unknown> | null;
  nbEtapes: number;
  /** Index de l'étape à traiter ; égal à `nbEtapes` quand l'exercice est fini. */
  etapeCourante: number;
  termine: boolean;
  /** Étapes atteintes, closes ou en cours. Jamais les suivantes. */
  etapes: EtapeVue[];
}

export interface SeanceVue {
  feuilleId: string;
  statut: string;
  termine: boolean;
  exercices: ExerciceVue[];
  /**
   * Compétences que le sélecteur a retenues mais pour lesquelles la banque
   * n'avait aucune question. Remonté jusqu'à l'UI pour que l'élève sache
   * pourquoi sa séance est plus courte, et que l'enseignant/directeur soit
   * alerté du trou de couverture.
   */
  ciblesSansQuestion: { competenceId: string; palier: string }[];
}

/**
 * Mélange **déterministe**, dérivé d'une graine textuelle.
 *
 * Le déterminisme n'est pas un confort : la vue est relue après chaque réponse,
 * et un ordre tiré au hasard à chaque lecture ferait sauter les éléments sous
 * la main de l'élève en plein exercice. Un tri par empreinte donne un ordre
 * stable, décorrélé de celui de la banque, et reproductible lors d'une
 * contestation.
 *
 * Ce n'est pas — et n'a pas à être — cryptographique : il s'agit de casser une
 * corrélation d'affichage, pas de résister à un adversaire. Quelqu'un capable
 * de recalculer ce tri aurait de toute façon obtenu la réponse plus vite
 * autrement.
 */
function melangeStable<T extends { id: string }>(items: T[], graine: string): T[] {
  return [...items]
    .map((item) => ({
      item,
      rang: createHash("sha256").update(`${graine}|${item.id}`).digest("hex"),
    }))
    .sort((a, b) => a.rang.localeCompare(b.rang))
    .map(({ item }) => item);
}

/**
 * Identifiant opaque servi à la place de celui de la banque.
 *
 * POURQUOI LE MÉLANGE NE SUFFIT PAS
 * ---------------------------------
 * Les identifiants de la banque sont ordonnés et parlants — `o1, o2, o3`,
 * `a, b, c`, `p1, p2, p3` — parce que c'est ainsi qu'un enseignant ou un modèle
 * les écrit naturellement. Trois conséquences, toutes exploitables depuis
 * l'onglet réseau du navigateur, quel que soit l'ordre d'affichage :
 *
 *  - une remise en ordre se résout en triant les identifiants ;
 *  - un appariement se résout en reliant les identifiants identiques des deux
 *    colonnes, qui sont ceux de la même paire ;
 *  - un QCM dont la bonne réponse est systématiquement écrite en premier se
 *    résout en prenant `a`.
 *
 * Le jeton casse les trois : il ne porte aucun ordre, aucune correspondance, et
 * ne se calcule pas sans la graine — qui, elle, ne quitte jamais le serveur.
 * Il reste déterministe, pour que deux lectures de la même séance renvoient les
 * mêmes jetons et qu'une réponse en cours de saisie reste valide.
 */
function jeton(graine: string, id: string): string {
  return createHash("sha256").update(`${graine}>${id}`).digest("hex").slice(0, 12);
}

/** Graine propre à un exercice ET à une étape. Ne sort jamais du serveur. */
function graineEtape(exerciceId: string, index: number): string {
  return `${exerciceId}#${index}`;
}

/**
 * Les deux colonnes d'un appariement sont jetonnées dans des espaces DISTINCTS.
 *
 * Sinon la même paire porterait le même jeton à gauche et à droite, et
 * l'appariement se résoudrait en reliant les valeurs identiques — le jeton
 * n'aurait fait que remplacer un identifiant lisible par un autre.
 */
const ESPACE_GAUCHE = "<";
const ESPACE_DROITE = ">";

/** Correspondance jeton → identifiant réel, pour un espace donné. */
function table(ids: string[], graine: string, espace = ""): Map<string, string> {
  return new Map(ids.map((id) => [jeton(graine + espace, id), id]));
}

/**
 * Retraduit une réponse reçue du client en identifiants de la banque.
 *
 * Sans cette étape, `corrigerEtape` comparerait des jetons à des identifiants
 * réels et déclarerait tout faux. Un jeton inconnu est laissé tel quel : la
 * correction le rejettera, ce qui est exactement le traitement dû à une réponse
 * fabriquée à la main.
 */
export function detokeniser(etape: EtapeQuestion, graine: string, brut: string): string {
  if (etape.format === "SAISIE_COURTE") return brut;

  if (etape.format === "APPARIEMENT") {
    const ids = etape.paires?.map((p) => p.id) ?? [];
    const gauche = table(ids, graine, ESPACE_GAUCHE);
    const droite = table(ids, graine, ESPACE_DROITE);
    return brut
      .split(SEPARATEUR)
      .map((couple) => {
        const [g, d] = couple.split(":");
        return `${gauche.get((g ?? "").trim()) ?? ""}:${droite.get((d ?? "").trim()) ?? ""}`;
      })
      .join(SEPARATEUR);
  }

  const reels = table(etape.options?.map((o) => o.id) ?? [], graine);
  const rendre = (v: string) => reels.get(v.trim()) ?? v.trim();

  if (etape.format === "CHOIX_UNIQUE") return rendre(brut);
  return brut.split(SEPARATEUR).map(rendre).join(SEPARATEUR);
}

/**
 * Corrigé rendu lisible.
 *
 * Les formats composés stockent leur réponse en identifiants (`p1:p1|p2:p2`) :
 * les afficher tels quels apprendrait à l'élève qu'il s'est trompé sans jamais
 * lui dire de quoi — c'est-à-dire tout ce qu'une correction ne doit pas être.
 */
function corrigeLisible(etape: EtapeQuestion): string {
  if (etape.format === "REMISE_EN_ORDRE" && etape.options) {
    const parId = new Map(etape.options.map((o) => [o.id, o.texte]));
    return etape.reponse
      .split(SEPARATEUR)
      .map((id, i) => `${i + 1}. ${parId.get(id) ?? id}`)
      .join("   ");
  }
  if (etape.format === "APPARIEMENT" && etape.paires) {
    return etape.paires.map((p) => `${p.gauche} → ${p.droite}`).join("   ·   ");
  }
  if (etape.format === "CHOIX_UNIQUE" && etape.options) {
    return etape.options.find((o) => o.id === etape.reponse)?.texte ?? etape.reponse;
  }
  return etape.reponse;
}

/**
 * Construit la vue élève d'un exercice : retire les réponses attendues et
 * n'expose que les étapes déjà atteintes.
 *
 * Seul chemin de sortie de `Question.structure`. Toute route qui sérialiserait
 * la structure directement publierait le corrigé.
 */
export function vueEleve(
  exercice: {
    id: string;
    ordre: number;
    palier: string;
    regleDeclenchee: string;
    motifParams: unknown;
    competence: { libelle: string };
    question: { enonce: string; format: FormatQuestion };
  },
  structure: StructureQuestion,
  faites: EtapeFaite[]
): ExerciceVue {
  const parIndex = new Map(faites.map((e) => [e.index, e]));

  // L'étape courante est la première non close. Une étape est close quand elle
  // est réussie ou que les tentatives sont épuisées.
  let etapeCourante = structure.etapes.length;
  for (let i = 0; i < structure.etapes.length; i++) {
    const faite = parIndex.get(i);
    if (!faite || (!faite.correcte && faite.tentatives < TENTATIVES_MAX)) {
      etapeCourante = i;
      break;
    }
  }

  const etapes: EtapeVue[] = [];
  for (let i = 0; i <= Math.min(etapeCourante, structure.etapes.length - 1); i++) {
    const etape = structure.etapes[i];
    const faite = parIndex.get(i);
    const close = !!faite && (faite.correcte || faite.tentatives >= TENTATIVES_MAX);

    // Graine propre à CET exercice et à CETTE étape. Une graine partagée
    // produirait les mêmes jetons et le même ordre sur toutes les questions
    // bâties sur le même gabarit — et les deux redeviendraient une information.
    const graine = graineEtape(exercice.id, i);

    // Les propositions d'une remise en ordre sont mélangées : la banque les
    // stocke naturellement dans l'ordre correct, et les servir telles quelles
    // donnerait la solution au premier coup d'œil.
    const options =
      etape.format === "REMISE_EN_ORDRE" && etape.options
        ? melangeStable(etape.options, graine)
        : etape.options;

    etapes.push({
      index: i,
      enonce: etape.enonce,
      format: etape.format,
      // Jetons, jamais les identifiants de la banque : ceux-ci sont ordonnés et
      // parlants, donc lisibles depuis l'onglet réseau (cf. `jeton`).
      options: options?.map((o) => ({ id: jeton(graine, o.id), texte: o.texte })),
      gauche: etape.paires?.map((p) => ({
        id: jeton(graine + ESPACE_GAUCHE, p.id),
        texte: p.gauche,
      })),
      // La colonne de droite est mélangée ET jetonnée dans un autre espace :
      // sans le mélange, la réponse se lirait en diagonale ; sans les espaces
      // distincts, elle se lirait en reliant les jetons identiques.
      droite: etape.paires
        ? melangeStable(etape.paires, graine).map((p) => ({
            id: jeton(graine + ESPACE_DROITE, p.id),
            texte: p.droite,
          }))
        : undefined,
      // L'indice est une aide, pas une donnée de l'énoncé : le donner d'emblée
      // supprimerait l'étape qu'il est censé débloquer.
      indice: faite && faite.tentatives > 0 && !faite.correcte ? (etape.indice ?? null) : null,
      tentatives: faite?.tentatives ?? 0,
      correcte: close ? faite!.correcte : null,
      reponse: faite?.reponse ?? null,
      corrige: close ? corrigeLisible(etape) : null,
    });
  }

  return {
    id: exercice.id,
    ordre: exercice.ordre,
    palier: exercice.palier,
    format: exercice.question.format,
    enonce: exercice.question.enonce,
    competenceLibelle: exercice.competence.libelle,
    regleDeclenchee: exercice.regleDeclenchee,
    motifParams: (exercice.motifParams as Record<string, unknown> | null) ?? null,
    nbEtapes: structure.etapes.length,
    etapeCourante,
    termine: etapeCourante >= structure.etapes.length,
    etapes,
  };
}

// ------------------------------------------------------------
// Accès base — périmètre
// ------------------------------------------------------------

/**
 * Prédicat de feuille : tenant, site, ET périmètre personnel.
 *
 * Les trois, toujours. `STUDENT` et `PARENT` échappent au filtrage par site
 * (leur périmètre est relationnel) : sans `personalScopeFilter`, une route
 * ouverte aux élèves exposerait les feuilles de tout l'établissement.
 */
function filtreFeuille(tenantId: string, claims: SessionSiteClaims) {
  return mergeFilters(
    { tenantId },
    siteFilterForModel("feuilleExercices", claims),
    personalScopeFilter(claims, "eleve")
  );
}

/**
 * Élève sur lequel porte la séance.
 *
 * Un `STUDENT` ne travaille que pour lui-même, quel que soit l'identifiant
 * qu'il envoie : accepter un `eleveId` de requête pour ce rôle laisserait un
 * élève ouvrir la séance d'un camarade. Les autres rôles (enseignant qui
 * prépare, parent qui consulte) doivent le désigner, et le filtre de périmètre
 * appliqué ensuite tranche s'ils en ont le droit.
 */
export async function eleveDeSeance(
  tenantId: string,
  claims: SessionSiteClaims & { userId?: string; id?: string },
  eleveIdDemande?: string | null
): Promise<string | null> {
  if (claims.role === "STUDENT") {
    const userId = claims.userId ?? claims.id;
    if (!userId) return null;
    // eslint-disable-next-line ecolpro/require-site-filter
    const eleve = await prisma.eleve.findFirst({
      where: { tenantId, userId },
      select: { id: true },
    });
    return eleve?.id ?? null;
  }
  if (!eleveIdDemande) return null;
  const eleve = await prisma.eleve.findFirst({
    where: mergeFilters(
      { id: eleveIdDemande, tenantId },
      siteFilterForModel("eleve", claims),
      personalScopeFilter(claims, null)
    ),
    select: { id: true },
  });
  return eleve?.id ?? null;
}

const SELECT_EXERCICE = {
  id: true,
  ordre: true,
  palier: true,
  competenceId: true,
  regleDeclenchee: true,
  motifParams: true,
  competence: { select: { libelle: true } },
  question: {
    select: {
      id: true, enonce: true, format: true, structure: true, bareme: true,
      // Servent à pondérer la preuve, pas à décider quoi servir : une question
      // générée non relue est servie comme les autres, elle vaut simplement
      // moins (cf. `FACTEUR_QUESTION_NON_RELUE`).
      origine: true, relueLe: true,
    },
  },
  reponse: {
    select: {
      id: true,
      etapes: true,
      tentatives: true,
      dureeMs: true,
      score: true,
      updatedAt: true,
    },
  },
} as const;

type ExerciceCharge = Prisma.ExerciceAssigneGetPayload<{ select: typeof SELECT_EXERCICE }>;

function etapesFaites(reponse: { etapes: unknown } | null | undefined): EtapeFaite[] {
  const brut = reponse?.etapes;
  return Array.isArray(brut) ? (brut as unknown as EtapeFaite[]) : [];
}

/**
 * Assemble la vue d'une feuille. Les exercices dont la structure est
 * inexploitable sont **omis** : mieux vaut une feuille plus courte qu'un
 * exercice sur lequel l'élève ne peut rien faire.
 */
function assembler(
  feuille: { id: string; statut: string },
  exercices: ExerciceCharge[]
): SeanceVue {
  const vues: ExerciceVue[] = [];
  for (const ex of exercices) {
    const structure = parseStructure(ex.question.structure);
    if (!structure) continue;
    vues.push(vueEleve(ex, structure, etapesFaites(ex.reponse)));
  }
  return {
    feuilleId: feuille.id,
    statut: feuille.statut,
    termine: vues.length > 0 && vues.every((v) => v.termine),
    exercices: vues,
    // Une feuille reprise n'a pas de cibles sans question : elles ont été
    // résolues à la composition, et le tirage est figé.
    ciblesSansQuestion: [],
  };
}

/**
 * Charge une séance existante, dans le périmètre de l'appelant.
 */
export async function chargerSeance(
  tenantId: string,
  feuilleId: string,
  claims: SessionSiteClaims
): Promise<SeanceVue | null> {
  const feuille = await prisma.feuilleExercices.findFirst({
    where: { id: feuilleId, ...filtreFeuille(tenantId, claims) },
    select: {
      id: true,
      statut: true,
      assigneeLe: true,
      exercices: { select: SELECT_EXERCICE, orderBy: { ordre: "asc" } },
    },
  });
  if (!feuille) return null;

  // Une feuille-jalon non signée n'atteint pas l'élève : c'est toute la raison
  // d'être du statut `PROPOSEE`.
  if (feuille.statut === "PROPOSEE" || feuille.statut === "REFUSEE") return null;

  // `assigneeLe` est LA marque de mise à disposition, et le statut ne suffit
  // pas à la remplacer : une attestation acceptée par l'enseignant est déjà
  // `ASSIGNEE` alors qu'elle attend encore d'être lancée en classe. Ne pas la
  // lister ne protège de rien — il faut qu'elle soit inouvrable, sinon un élève
  // qui connaît l'identifiant de la feuille la passe chez lui et en tire une
  // preuve estampillée « supervisée » qui ne l'a pas été.
  //
  // La règle vaut pour tous les types : entraînement et diagnostic reçoivent
  // leur date à la composition, jalon et attestation à l'ouverture par un
  // adulte. Aucune feuille légitimement accessible n'a ce champ vide.
  if (feuille.assigneeLe === null) return null;

  return assembler(feuille, feuille.exercices);
}

/**
 * Ouvre une séance d'entraînement : reprend celle qui est en cours, ou en
 * compose une nouvelle.
 *
 * La reprise passe avant la composition, et ce n'est pas un détail : sans elle,
 * un élève qui recharge sa page repartirait de zéro sur une feuille différente,
 * et la précédente resterait éternellement inachevée dans son historique.
 *
 * @returns `null` quand il n'y a rien à travailler — bande consolidée, ou
 *   banque vide sur les compétences visées. Le silence est un résultat.
 */
export async function ouvrirSeance(
  tenantId: string,
  eleveId: string,
  claims: SessionSiteClaims,
  options: OptionsSelection & { nombre?: number }
): Promise<SeanceVue | null> {
  const enCours = await prisma.feuilleExercices.findFirst({
    where: {
      ...filtreFeuille(tenantId, claims),
      eleveId,
      type: "entrainement",
      statut: { in: ["ASSIGNEE", "EN_COURS"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      statut: true,
      exercices: { select: SELECT_EXERCICE, orderBy: { ordre: "asc" } },
    },
  });

  if (enCours) {
    const vue = assembler(enCours, enCours.exercices);
    // Une feuille dont tous les exercices sont faits mais restée ouverte
    // (interruption avant la clôture) ne doit pas être resservie.
    if (vue.exercices.length > 0 && !vue.termine) return vue;
  }

  const composee = await composerFeuille(tenantId, eleveId, claims, {
    ...options,
    type: "entrainement",
    autoCorrigeableUniquement: true,
  });
  if (!composee || !composee.feuilleId) return null;

  const seance = await chargerSeance(tenantId, composee.feuilleId, claims);
  if (!seance) return null;
  // Les cibles sans question sont perdues par `chargerSeance` (qui relit la
  // feuille en base) : on les reinjecte depuis la composition, seul moment
  // qui les calcule.
  return { ...seance, ciblesSansQuestion: composee.ciblesSansQuestion };
}

// ------------------------------------------------------------
// Soumission d'une étape
// ------------------------------------------------------------

export interface ResultatEtape {
  correcte: boolean;
  /** Tentatives consommées après celle-ci. */
  tentatives: number;
  /** L'étape est-elle close (réussie, ou tentatives épuisées) ? */
  close: boolean;
  /** Réponse attendue — présente uniquement si l'étape est close. */
  corrige: string | null;
  /** Indice, si un essai a échoué et que l'étape en propose un. */
  indice: string | null;
  /** L'exercice entier est-il terminé ? */
  exerciceTermine: boolean;
  /** La feuille entière est-elle terminée ? */
  seanceTerminee: boolean;
  /**
   * Attestations en classe demandées à l'issue de la séance.
   *
   * Remonté jusqu'à l'élève : c'est la contrepartie visible de son travail, et
   * la seule chose qui donne un sens au plafond posé sur l'entraînement seul.
   */
  attestationsProposees: number;
  /** Score de l'exercice, une fois celui-ci terminé. */
  score: number | null;
  maxScore: number | null;
}

export class ErreurSeance extends Error {
  constructor(
    message: string,
    readonly code:
      | "introuvable"
      | "structure_invalide"
      | "etape_hors_sequence"
      | "etape_close"
  ) {
    super(message);
    this.name = "ErreurSeance";
  }
}

/**
 * Temps écoulé depuis la dernière écriture sur cet exercice.
 *
 * Mesuré **serveur**, jamais annoncé par le client : c'est précisément la
 * valeur qu'un élève pressé aurait intérêt à falsifier. Conséquence assumée :
 * la première étape d'un exercice n'a pas de repère antérieur et reste non
 * mesurée (`null`). Créer la ligne de réponse à l'affichage pour gagner cette
 * mesure la fabriquerait pour des exercices jamais commencés.
 */
function dureeEcoulee(precedente: Date | null | undefined, maintenant: Date): number | null {
  if (!precedente) return null;
  const ms = maintenant.getTime() - precedente.getTime();
  // Une pause de plus d'une heure n'est pas du temps de travail : la compter
  // ferait passer un élève parti dîner pour un élève appliqué.
  if (ms < 0 || ms > 3_600_000) return null;
  return ms;
}

/**
 * Enregistre et corrige une réponse d'étape.
 *
 * Séquentiel par construction : on ne peut soumettre que l'étape courante. Sans
 * cette contrainte, un client modifié sauterait les étapes intermédiaires pour
 * ne répondre qu'à la dernière — et le découpage, qui existe pour localiser la
 * difficulté, ne mesurerait plus rien.
 */
export async function soumettreEtape(
  tenantId: string,
  claims: SessionSiteClaims,
  input: { feuilleId: string; exerciceId: string; index: number; reponse: string },
  maintenant: Date = new Date()
): Promise<ResultatEtape> {
  const exercice = await prisma.exerciceAssigne.findFirst({
    where: {
      id: input.exerciceId,
      feuille: {
        id: input.feuilleId,
        ...filtreFeuille(tenantId, claims),
        statut: { in: ["ASSIGNEE", "EN_COURS"] },
        // Même exigence qu'à la lecture : une feuille non mise à disposition
        // ne se répond pas non plus. Sans cette ligne, le verrou de
        // `chargerSeance` se contournerait en postant directement.
        assigneeLe: { not: null },
      },
    },
    select: {
      ...SELECT_EXERCICE,
      competenceId: true,
      feuille: {
        select: { id: true, eleveId: true, siteId: true, type: true, matiereId: true },
      },
    },
  });
  if (!exercice) throw new ErreurSeance("Exercice introuvable.", "introuvable");

  const structure = parseStructure(exercice.question.structure);
  if (!structure) {
    throw new ErreurSeance("Structure d'exercice inexploitable.", "structure_invalide");
  }

  const faites = etapesFaites(exercice.reponse);
  const parIndex = new Map(faites.map((e) => [e.index, e]));

  let courante = structure.etapes.length;
  for (let i = 0; i < structure.etapes.length; i++) {
    const f = parIndex.get(i);
    if (!f || (!f.correcte && f.tentatives < TENTATIVES_MAX)) {
      courante = i;
      break;
    }
  }
  if (courante >= structure.etapes.length) {
    throw new ErreurSeance("Exercice déjà terminé.", "etape_close");
  }
  if (input.index !== courante) {
    throw new ErreurSeance(
      `Étape ${input.index} soumise alors que l'étape ${courante} est attendue.`,
      "etape_hors_sequence"
    );
  }

  const etape = structure.etapes[courante];

  // Le client répond en jetons ; on les retraduit avant de corriger, et on
  // enregistre la forme retraduite. Stocker les jetons rendrait l'historique
  // illisible et le lierait à un algorithme de dérivation qui peut changer.
  const reponse = detokeniser(etape, graineEtape(exercice.id, courante), input.reponse);

  const correction = corrigerEtape(etape, reponse);
  const precedente = parIndex.get(courante);
  const tentatives = (precedente?.tentatives ?? 0) + 1;
  const close = correction.correcte || tentatives >= TENTATIVES_MAX;

  const faite: EtapeFaite = {
    index: courante,
    reponse,
    correcte: correction.correcte,
    tentatives,
    credit: correction.correcte ? creditTentative(tentatives) * etape.points : 0,
    erreur: correction.erreur,
    dureeMs: dureeEcoulee(exercice.reponse?.updatedAt, maintenant),
  };

  const misesAJour = [...faites.filter((e) => e.index !== courante), faite].sort(
    (a, b) => a.index - b.index
  );

  // Terminé seulement quand la DERNIÈRE étape se referme. Une étape ratée trois
  // fois n'interrompt pas l'exercice : elle s'ouvre avec sa correction et la
  // suite continue — c'est là que l'élève apprend quelque chose.
  const exerciceTermine = close && courante === structure.etapes.length - 1;

  const maxScore = structure.etapes.reduce((s, e) => s + e.points, 0);
  const score = misesAJour.reduce((s, e) => s + e.credit, 0);
  const dureeMs = misesAJour.reduce((s, e) => s + (e.dureeMs ?? 0), 0) || null;
  const tentativesTotal = misesAJour.reduce((s, e) => s + e.tentatives, 0);

  const donnees = {
    reponse: misesAJour.map((e) => e.reponse).join(" | "),
    etapes: misesAJour as unknown as Prisma.InputJsonValue,
    tentatives: tentativesTotal,
    dureeMs,
    // Le score n'est écrit qu'une fois l'exercice fini : un score partiel
    // deviendrait une preuve fausse si l'élève s'interrompait au milieu.
    score: exerciceTermine ? score : null,
    maxScore: exerciceTermine ? maxScore : null,
    corrigeeLe: exerciceTermine ? maintenant : null,
  };

  await prisma.exerciceReponse.upsert({
    where: { exerciceAssigneId: exercice.id },
    create: { exerciceAssigneId: exercice.id, ...donnees },
    update: donnees,
  });

  // Première réponse sur la feuille : elle passe en cours.
  await prisma.feuilleExercices.updateMany({
    where: { id: exercice.feuille.id, tenantId, statut: "ASSIGNEE" },
    data: { statut: "EN_COURS" },
  });

  let seanceTerminee = false;
  let attestationsProposees = 0;
  if (exerciceTermine) {
    await produirePreuve(tenantId, exercice, {
      score,
      maxScore,
      etapes: misesAJour,
      maintenant,
    });
    seanceTerminee = await cloturerSiTerminee(
      tenantId,
      exercice.feuille.id,
      exercice.feuille.eleveId,
      maintenant
    );

    // La boucle se referme ici : quand l'entraînement finit par dire « cet
    // élève sait faire », le système ne conclut pas — il demande à un adulte
    // de vérifier. C'est le seul chemin vers `MASTERED`, et c'est ce qui
    // empêche le plafond posé sur le travail autonome d'être une impasse.
    //
    // Déclenché à la clôture de la feuille, et non après chaque exercice : la
    // dernière preuve de la séance peut à elle seule franchir le seuil, mais
    // rien n'oblige à interroger la base trois fois pour s'en apercevoir.
    if (seanceTerminee) {
      const feuilles = await proposerAttestationsApresSeance(
        tenantId,
        exercice.feuille.eleveId,
        claims,
        maintenant
      );
      attestationsProposees = feuilles.length;
    }
  }

  return {
    correcte: correction.correcte,
    attestationsProposees,
    tentatives,
    close,
    corrige: close ? corrigeLisible(etape) : null,
    indice: !correction.correcte && !close ? (etape.indice ?? null) : null,
    exerciceTermine,
    seanceTerminee,
    score: exerciceTermine ? score : null,
    maxScore: exerciceTermine ? maxScore : null,
  };
}

// ------------------------------------------------------------
// Conversion en preuve d'apprentissage
// ------------------------------------------------------------

/** Nature de la preuve, déduite du type de feuille. */
export function evidenceTypeDeFeuille(typeFeuille: string): EvidenceType {
  // Seul l'entraînement est fait sans témoin. Un diagnostic ou un jalon sont
  // passés en classe : ils valent un exercice ordinaire.
  return typeFeuille === "entrainement" ? "AUTO_ENTRAINEMENT" : "EXERCICE";
}

/**
 * Transforme un exercice terminé en preuve, puis recalcule le profil.
 *
 * Appel direct plutôt que passage par le bus d'événements : celui-ci existe
 * pour observer l'ERP sans le ralentir ni le casser. Ici la source est LEARNOS
 * lui-même — un détour par l'outbox n'ajouterait qu'une latence et un état
 * intermédiaire, sans rien découpler.
 *
 * L'identifiant est dérivé de la source (cf. `evidenceId`) : rejouer la même
 * correction met à jour la même ligne au lieu d'empiler des preuves.
 */
async function produirePreuve(
  tenantId: string,
  exercice: ExerciceCharge & {
    competenceId: string;
    feuille: { id: string; eleveId: string; siteId: string | null; type: string; matiereId: string | null };
  },
  resultat: { score: number; maxScore: number; etapes: EtapeFaite[]; maintenant: Date }
): Promise<void> {
  const evidenceType = evidenceTypeDeFeuille(exercice.feuille.type);

  const signal = calculerSignal({
    valeur: resultat.score,
    noteMax: resultat.maxScore,
    // Aucun enseignant n'a déclaré d'importance pour cet exercice : le poids
    // neutre est le seul honnête. Le tri entre séances se fait par la
    // confiance, pas par un coefficient inventé.
    coefficient: 1,
    evidenceType,
  });

  const fiabilite =
    evidenceType === "AUTO_ENTRAINEMENT"
      ? fiabiliteSeance(resultat.etapes)
      : { facteur: 1, motif: null };

  // Doute sur l'énoncé, distinct du doute sur l'élève — et cumulatif avec lui.
  const relue = exercice.question.origine !== "ia" || exercice.question.relueLe !== null;
  const facteurQuestion = relue ? 1 : FACTEUR_QUESTION_NON_RELUE;

  const id = evidenceId("exercice", exercice.id, exercice.competenceId);

  const donnees = {
    tenantId,
    siteId: exercice.feuille.siteId,
    eleveId: exercice.feuille.eleveId,
    competenceId: exercice.competenceId,
    matiereId: exercice.feuille.matiereId,
    sourceType: "exercice",
    sourceId: exercice.id,
    noteId: null,
    evaluationId: null,
    evidenceType,
    rawScore: resultat.score,
    maxScore: resultat.maxScore,
    occurredAt: resultat.maintenant,
    masterySignal: signal.masterySignal,
    confidence: signal.confidence * fiabilite.facteur * facteurQuestion,
    weight: signal.weight,
    // Renseigné ici, contrairement à la voie « note » : le découpage en étapes
    // et les distracteurs annotés disent *où* ça a cassé. C'est le seul endroit
    // du système où l'erreur est observée plutôt que supposée.
    errorType: erreurDominante(resultat.etapes),
    errorConfidence: erreurDominante(resultat.etapes) ? 0.6 : null,
    metadata: {
      palier: exercice.palier,
      questionId: exercice.question.id,
      typeFeuille: exercice.feuille.type,
      regleDeclenchee: exercice.regleDeclenchee,
      tentatives: resultat.etapes.reduce((s, e) => s + e.tentatives, 0),
      dureeMs: resultat.etapes.reduce((s, e) => s + (e.dureeMs ?? 0), 0),
      // Motifs conservés même quand il ne s'est rien passé d'anormal : c'est ce
      // qui rend la pondération explicable à une famille.
      fiabiliteSeance: fiabilite.facteur,
      motifFiabilite: fiabilite.motif,
      origineQuestion: exercice.question.origine,
      questionRelue: relue,
      facteurQuestion,
    },
  };

  const preuve = await prisma.learningEvidence.upsert({
    where: { id },
    create: { id, ...donnees },
    update: donnees,
  });

  await prisma.exerciceReponse.update({
    where: { exerciceAssigneId: exercice.id },
    data: { evidenceId: preuve.id },
  });

  await recalculerProfil(
    tenantId,
    exercice.feuille.eleveId,
    exercice.competenceId,
    resultat.maintenant
  );

  // Même suite que la voie « note » (cf. `recalculerRecommandationsApresProfil`).
  // Sans elle, la boucle s'arrêtait au profil : la maîtrise montait, mais la
  // recommandation restait ouverte et l'étape de parcours ne se validait jamais
  // — y compris pour une feuille-jalon, dont c'est pourtant la raison d'être.
  //
  // C'est bien la PREUVE qui valide l'étape, jamais la feuille : `EtapePlan` est
  // synchronisée sur le profil recalculé, si bien qu'une réussite obtenue hors
  // parcours la valide aussi, et qu'une régression la rouvre.
  await recalculerRecommandation(
    tenantId,
    exercice.feuille.eleveId,
    exercice.competenceId,
    resultat.maintenant
  );
  await synchroniserEtapes(
    tenantId,
    exercice.feuille.eleveId,
    exercice.competenceId,
    resultat.maintenant
  );
}

/** Ferme la feuille quand tous ses exercices sont corrigés. */
async function cloturerSiTerminee(
  tenantId: string,
  feuilleId: string,
  eleveId: string,
  maintenant: Date
): Promise<boolean> {
  // eslint-disable-next-line ecolpro/require-site-filter
  const restants = await prisma.exerciceAssigne.count({
    where: { feuille: { id: feuilleId, tenantId }, reponse: { is: null } },
  });
  const partiels = await prisma.exerciceReponse.count({
    where: { exercice: { feuille: { id: feuilleId, tenantId } }, score: null },
  });
  if (restants + partiels > 0) return false;

  await prisma.feuilleExercices.updateMany({
    where: { id: feuilleId, tenantId, statut: { in: ["ASSIGNEE", "EN_COURS"] } },
    data: { statut: "TERMINEE", termineeLe: maintenant },
  });

  // À la clôture, et non après chaque exercice : un parcours se propose sur une
  // situation d'ensemble. L'évaluer en cours de feuille l'appuierait sur un
  // état à moitié mis à jour, et le referait cinq fois pour un seul verdict.
  // Proposé seulement — la validation reste humaine (`PlanProgression`).
  await evaluerBesoinDePlans(tenantId, eleveId, maintenant);

  return true;
}
