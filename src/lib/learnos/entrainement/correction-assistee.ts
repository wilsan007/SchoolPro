import type { ErrorType } from "@prisma/client";
import { z } from "zod";
import {
  TYPES_ERREUR_GRILLE,
  scoreDepuisCriteres,
  totalGrille,
  type GrilleCorrection,
} from "./grille-correction";

// ------------------------------------------------------------
// Correction assistée — le modèle PROPOSE, la grille CALCULE
// ------------------------------------------------------------
//
// Ce module est pur : ni base, ni réseau. C'est voulu — c'est lui qui porte
// les trois règles non négociables de AGENTS.md, et elles doivent pouvoir se
// tester sans rien simuler.
//
//  1. Le modèle ne décide pas. Sa sortie est une proposition, jamais un verdict.
//  2. Le score se recalcule depuis la grille. La sortie du modèle ne contient
//     AUCUN total : elle désigne des critères, et le total en découle.
//  3. Dans le doute, on s'abstient. Une proposition incertaine n'est jamais
//     déclarée « fausse » : elle est marquée INCERTAINE et attend un humain.

/**
 * Confiance minimale pour qu'une proposition soit présentée comme exploitable.
 * En dessous, elle reste visible mais marquée INCERTAINE.
 *
 * Valeur de départ, à recaler avec le banc d'essai (`mesurerFiabilite`) sur des
 * copies réellement corrigées par des enseignants : la fixer « au jugé » est
 * une hypothèse, pas une mesure.
 */
export const SEUIL_CONFIANCE = 0.7;

/** Longueur maximale d'une réponse envoyée au modèle. */
export const LONGUEUR_MAX_REPONSE = 4000;

export type StatutProposition = "A_VALIDER" | "INCERTAINE";

/** Sortie brute attendue du modèle : des critères désignés, jamais une note. */
const SortieSchema = z.object({
  criteres: z
    .array(
      z.object({
        id: z.string().min(1),
        reussi: z.boolean(),
        justification: z.string().max(500).default(""),
        confiance: z.number().min(0).max(1),
      })
    )
    .min(1),
  erreurs: z
    .array(
      z.object({
        type: z.string().refine((t) => TYPES_ERREUR_GRILLE.includes(t as ErrorType)),
        description: z.string().max(300),
      })
    )
    .default([]),
  explication: z.string().max(800).optional(),
  /** Le modèle déclare lui-même qu'il hésite : on le croit, c'est prudent. */
  ambigu: z.boolean().default(false),
  /** Question courte pour départager deux lectures possibles. */
  questionVerification: z.string().max(300).optional(),
  confianceGlobale: z.number().min(0).max(1),
});

export interface DetailCritere {
  id: string;
  libelle: string;
  points: number;
  reussi: boolean;
  justification: string;
  confiance: number;
}

export interface Proposition {
  statut: StatutProposition;
  /** Calculé depuis la grille, jamais lu dans la sortie du modèle. */
  score: number;
  maxScore: number;
  criteresReussis: string[];
  details: DetailCritere[];
  erreurs: { type: ErrorType; description: string }[];
  explication: string | null;
  questionVerification: string | null;
  /** Confiance la plus basse rencontrée : une chaîne vaut son maillon faible. */
  confiance: number;
  /** Clés de motif (traduisibles), non des phrases figées. */
  motifs: string[];
}

/**
 * Transforme la sortie brute du modèle en proposition vérifiée.
 *
 * @returns `null` si la sortie est inexploitable (JSON invalide, schéma non
 *   respecté). `null` n'est PAS un verdict sur la copie : c'est « le modèle n'a
 *   rien produit d'utilisable », et l'appelant doit le dire tel quel.
 */
export function construireProposition(
  grille: GrilleCorrection,
  sortieBrute: unknown
): Proposition | null {
  let objet: unknown = sortieBrute;
  if (typeof sortieBrute === "string") {
    try {
      objet = JSON.parse(sortieBrute);
    } catch (e) {
      console.warn("[non-fatal]", e);
      return null;
    }
  }

  const lue = SortieSchema.safeParse(objet);
  if (!lue.success) return null;
  const sortie = lue.data;

  const parId = new Map(grille.criteres.map((c) => [c.id, c]));
  const motifs: string[] = [];

  // Un critère inconnu de la grille est ignoré, pas compté : un critère
  // fabriqué ne rapporte rien (cf. `scoreDepuisCriteres`).
  const evalues = new Map<string, (typeof sortie.criteres)[number]>();
  for (const c of sortie.criteres) {
    if (parId.has(c.id) && !evalues.has(c.id)) evalues.set(c.id, c);
  }
  if (evalues.size < sortie.criteres.length) motifs.push("critere_inconnu_ignore");

  // Un critère que le modèle n'a pas évalué n'est PAS un critère raté : on ne
  // sait rien. Le compter à zéro fabriquerait une erreur.
  const manquants = grille.criteres.filter((c) => !evalues.has(c.id));
  if (manquants.length > 0) motifs.push("critere_non_evalue");

  const details: DetailCritere[] = grille.criteres.flatMap((c) => {
    const e = evalues.get(c.id);
    if (!e) return [];
    return [
      {
        id: c.id,
        libelle: c.libelle,
        points: c.points,
        reussi: e.reussi,
        justification: e.justification,
        confiance: e.confiance,
      },
    ];
  });

  const criteresReussis = details.filter((d) => d.reussi).map((d) => d.id);
  const score = scoreDepuisCriteres(grille, criteresReussis);

  const confiance = Math.min(sortie.confianceGlobale, ...details.map((d) => d.confiance));
  if (confiance < SEUIL_CONFIANCE) motifs.push("confiance_insuffisante");
  if (sortie.ambigu) motifs.push("ambigu_declare");

  // Un critère à confiance basse suffit à rendre la note indicative : la note
  // est une somme, un seul terme douteux la rend douteuse.
  const incertaine = motifs.some((m) =>
    ["critere_non_evalue", "confiance_insuffisante", "ambigu_declare"].includes(m)
  );

  return {
    statut: incertaine ? "INCERTAINE" : "A_VALIDER",
    score,
    maxScore: totalGrille(grille),
    criteresReussis,
    details,
    erreurs: sortie.erreurs.map((e) => ({ type: e.type as ErrorType, description: e.description })),
    explication: sortie.explication?.trim() || null,
    questionVerification: sortie.questionVerification?.trim() || null,
    confiance,
    motifs,
  };
}
