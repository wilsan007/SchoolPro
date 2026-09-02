// ============================================================
// Règles d'unicité des factures (domaine pur, sans Prisma)
// ============================================================
//
// Règle 7 AGENTS.md : la logique métier vit dans src/lib/domain/
// et ne dépend d'aucune infrastructure. On peut tester ces règles
// sans mocker Prisma.
//
// Types de factures et leur règle d'unicité :
//
//   Types MENSUELS (unicité par eleveId + type + mois) :
//     - MENSUALITE : une seule mensualité par élève et par mois
//     - CANTINE    : une seule cantine par élève et par mois
//     - TRANSPORT  : un seul transport par élève et par mois
//
//   Types GLOBAUX (unicité par eleveId + type, pas de mois) :
//     - INSCRIPTION     : une seule inscription par élève (par année)
//     - RENOUVELLEMENT  : un seul renouvellement par élève (par année)
//     - LIBRE           : une seule facture libre par élève (par année)
//
// Une facture ANNULEE n'est PAS bloquante : elle est considérée
// comme une erreur corrigée, et permet de recréer une facture
// pour le même service. Les statuts bloquants sont :
//   EN_ATTENTE, PAYEE, EN_RETARD.

import type { StatutFacture, TypeFacture } from "@prisma/client";

/** Types mensuels : unicité par (eleveId, type, mois). */
export const TYPES_MENSUELS: ReadonlySet<TypeFacture> = new Set([
  "MENSUALITE",
  "CANTINE",
  "TRANSPORT",
]);

/** Types globaux : unicité par (eleveId, type), pas de mois. */
export const TYPES_GLOBAUX: ReadonlySet<TypeFacture> = new Set([
  "INSCRIPTION",
  "RENOUVELLEMENT",
  "LIBRE",
]);

/** Statuts bloquants : une facture dans un de ces statuts empêche la recréation. */
export const STATUTS_BLOQUANTS: ReadonlySet<StatutFacture> = new Set([
  "EN_ATTENTE",
  "PAYEE",
  "EN_RETARD",
]);

/** Exclusions mutuelles : INSCRIPTION et RENOUVELLEMENT ne peuvent pas
 * être dans le même batch (un élève ne peut pas s'inscrire ET se réinscrire
 * en même temps). */
export const EXCLUSIONS: Partial<Record<TypeFacture, TypeFacture>> = {
  INSCRIPTION: "RENOUVELLEMENT",
  RENOUVELLEMENT: "INSCRIPTION",
};

/** Représentation d'une facture existante pour la vérification d'unicité. */
export interface FactureExistante {
  id: string;
  numero: string;
  type: TypeFacture;
  statut: StatutFacture;
  mois: string | null;
}

/** Résultat de la vérification d'unicité pour une facture candidate. */
export interface ResultatUnicite {
  /** true si la création est autorisée (aucune facture bloquante existante). */
  autorise: boolean;
  /** Si bloqué, la facture existante qui bloque (pour le message d'erreur). */
  factureExistante?: FactureExistante;
  /** Raison du blocage, pour un message d'erreur précis. */
  raison?: "deja_payee" | "existe_deja";
}

/**
 * Vérifie si une facture peut être créée pour un élève, un type et un mois donnés,
 * en fonction des factures existantes (non annulées) de cet élève.
 *
 * @param type type de la facture candidate
 * @param mois mois au format "YYYY-MM" (requis pour les types mensuels, ignoré pour les globaux)
 * @param existantes liste des factures existantes de l'élève (tous types confondus)
 * @returns { autorise: true } si OK, ou { autorise: false, raison, factureExistante } si bloqué
 */
export function canCreateFacture(
  type: TypeFacture,
  mois: string | null,
  existantes: FactureExistante[],
): ResultatUnicite {
  const estMensuel = TYPES_MENSUELS.has(type);

  // Filtre les factures existantes du même type.
  // Pour les types mensuels, on filtre aussi sur le mois.
  // Pour les types globaux, le mois n'a pas d'importance.
  const candidates = existantes.filter((f) => {
    if (f.type !== type) return false;
    if (estMensuel) {
      // Comparaison sur le mois (les deux doivent être non-null pour matcher)
      if (!mois || !f.mois) return false;
      return f.mois === mois;
    }
    // Type global : pas de filtre sur le mois
    return true;
  });

  // Une facture ANNULEE n'est pas bloquante (erreur corrigée).
  // On ne cherche que les factures avec un statut bloquant.
  const bloquante = candidates.find((f) => STATUTS_BLOQUANTS.has(f.statut));

  if (!bloquante) {
    return { autorise: true };
  }

  // Distinguer "déjà payée" (impossible de régénérer) vs "existe déjà" (annuler d'abord).
  const raison: "deja_payee" | "existe_deja" =
    bloquante.statut === "PAYEE" ? "deja_payee" : "existe_deja";

  return { autorise: false, factureExistante: bloquante, raison };
}

/**
 * Vérifie l'exclusivité mutuelle dans un batch de types de factures.
 * INSCRIPTION et RENOUVELLEMENT ne peuvent pas être dans le même batch.
 *
 * @param types liste des types de factures à créer dans le batch
 * @returns true si le batch est valide (pas de conflit d'exclusion)
 */
export function batchValide(types: TypeFacture[]): boolean {
  const set = new Set(types);
  for (const t of types) {
    const exclue = EXCLUSIONS[t];
    if (exclue && set.has(exclue)) return false;
  }
  return true;
}

/**
 * Construit la clé d'unicité d'une facture (pour dédoublonner l'UI).
 * Pour les types mensuels : `${type}|${mois}`.
 * Pour les types globaux : `${type}`.
 */
export function cleUnicite(type: TypeFacture, mois: string | null): string {
  return TYPES_MENSUELS.has(type) ? `${type}|${mois ?? ""}` : type;
}
