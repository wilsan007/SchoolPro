import type { ErrorType } from "@prisma/client";
import { normalizeText } from "@/lib/text-match";

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
