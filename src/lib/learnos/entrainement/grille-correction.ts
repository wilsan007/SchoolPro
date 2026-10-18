import type { ErrorType } from "@prisma/client";

// ------------------------------------------------------------
// Grille de correction — schéma, lecture défensive, cohérence
// ------------------------------------------------------------

/**
 * Types d'erreur qu'une grille peut anticiper.
 *
 * Liste fermée et dupliquée de l'enum Prisma à dessein : `parseGrille` lit du
 * JSON venu de la base ou d'un modèle, et ne doit accepter que des valeurs que
 * le reste du code sait traduire. Le test `grille-correction.test.ts` vérifie
 * que cette liste reste incluse dans l'enum.
 */
export const TYPES_ERREUR_GRILLE: readonly ErrorType[] = [
  "CONCEPTUAL_ERROR",
  "PROCEDURAL_ERROR",
  "CALCULATION_ERROR",
  "READING_ERROR",
  "MISINTERPRETATION",
  "MISSING_PREREQUISITE",
  "INCOMPLETE_REASONING",
  "NOTATION_ERROR",
  "ARGUMENT_UNJUSTIFIED",
  "WRITING_ERROR",
];

/** Un critère de correction : ce qui est vérifié, et ce qu'il rapporte. */
export interface CritereGrille {
  id: string;
  libelle: string;
  points: number;
}

/** Une erreur que l'auteur s'attend à voir, pour que le diagnostic la reconnaisse. */
export interface ErreurAnticipee {
  type: ErrorType;
  description: string;
}

export interface GrilleCorrection {
  criteres: CritereGrille[];
  erreursAnticipees: ErreurAnticipee[];
  /** Explication pédagogique montrée une fois l'exercice clos. */
  explication?: string;
  /**
   * Compétence à retravailler si l'exercice échoue (code curriculum).
   * Facultatif : sans lui, c'est la compétence de la question qui est retenue.
   */
  competenceCorrective?: string;
}

/** Garde-fou : une grille de plus de vingt critères ne se lit plus. */
const MAX_CRITERES = 20;

/**
 * Lit une grille venue de la base.
 *
 * Même philosophie que `parseStructure` : le JSON n'est pas typé par
 * PostgreSQL, et ce qui ne passe pas est refusé ici plutôt que découvert au
 * moment de corriger.
 *
 * @returns `null` si la grille est inexploitable.
 */
export function parseGrille(brut: unknown): GrilleCorrection | null {
  if (!brut || typeof brut !== "object") return null;
  const source = brut as Record<string, unknown>;

  if (!Array.isArray(source.criteres) || source.criteres.length === 0) return null;
  if (source.criteres.length > MAX_CRITERES) return null;

  const criteres: CritereGrille[] = [];
  for (const item of source.criteres) {
    if (!item || typeof item !== "object") return null;
    const c = item as Record<string, unknown>;
    if (typeof c.id !== "string" || c.id.trim() === "") return null;
    if (typeof c.libelle !== "string" || c.libelle.trim() === "") return null;
    // Un critère à zéro point ne mesure rien ; un négatif ferait baisser une note
    // déjà acquise.
    if (typeof c.points !== "number" || !Number.isFinite(c.points) || c.points <= 0) return null;
    criteres.push({ id: c.id, libelle: c.libelle.trim(), points: c.points });
  }
  if (new Set(criteres.map((c) => c.id)).size !== criteres.length) return null;

  const erreursAnticipees: ErreurAnticipee[] = [];
  if (source.erreursAnticipees !== undefined) {
    if (!Array.isArray(source.erreursAnticipees)) return null;
    for (const item of source.erreursAnticipees) {
      if (!item || typeof item !== "object") return null;
      const e = item as Record<string, unknown>;
      if (!TYPES_ERREUR_GRILLE.includes(e.type as ErrorType)) return null;
      if (typeof e.description !== "string" || e.description.trim() === "") return null;
      erreursAnticipees.push({ type: e.type as ErrorType, description: e.description.trim() });
    }
  }

  return {
    criteres,
    erreursAnticipees,
    ...(typeof source.explication === "string" && source.explication.trim() !== ""
      ? { explication: source.explication.trim() }
      : {}),
    ...(typeof source.competenceCorrective === "string" && source.competenceCorrective !== ""
      ? { competenceCorrective: source.competenceCorrective }
      : {}),
  };
}

/** Somme des points des critères, arrondie au centième pour absorber le flottant. */
export function totalGrille(grille: GrilleCorrection): number {
  return Math.round(grille.criteres.reduce((s, c) => s + c.points, 0) * 100) / 100;
}

/**
 * Le barème de la question et celui de la grille disent-ils la même chose ?
 *
 * C'est le contrôle de cohérence que le cahier des charges exige avant de
 * présenter un exercice : un énoncé noté sur 4 dont la grille totalise 5 donne
 * deux vérités sur la même copie. Comparé au centième, pas en égalité stricte
 * de flottants (0,1 + 0,2 ≠ 0,3).
 */
export function grilleCoherente(grille: GrilleCorrection, bareme: number): boolean {
  return Math.round(bareme * 100) === Math.round(totalGrille(grille) * 100);
}

/**
 * Points obtenus à partir des critères réussis.
 *
 * LE SCORE SE RECALCULE, IL NE SE LIT PAS
 * ---------------------------------------
 * Un correcteur — humain, déterministe ou assisté — désigne les critères
 * satisfaits ; la note en découle ici, par la grille. Lire un total annoncé
 * dans une prose ferait dépendre la note d'une phrase, et deux copies
 * identiques pourraient recevoir deux totaux.
 *
 * Un identifiant inconnu est ignoré et non compté : un critère fabriqué ne
 * rapporte rien.
 */
export function scoreDepuisCriteres(
  grille: GrilleCorrection,
  criteresReussis: readonly string[]
): number {
  const reussis = new Set(criteresReussis);
  const total = grille.criteres
    .filter((c) => reussis.has(c.id))
    .reduce((s, c) => s + c.points, 0);
  return Math.round(total * 100) / 100;
}
