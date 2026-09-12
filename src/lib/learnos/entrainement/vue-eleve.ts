import { createHash } from "node:crypto";
import type { FormatQuestion } from "@prisma/client";
import { SEPARATEUR, type EtapeQuestion, type FormatEtape, type StructureQuestion } from "./structure-question";
import { TENTATIVES_MAX } from "./correction";
import type { EtapeFaite } from "./deroule-seance";

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
export function graineEtape(exerciceId: string, index: number): string {
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
export function corrigeLisible(etape: EtapeQuestion): string {
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
