/**
 * SchoolPro — Scope automatique (tenant + année + site)
 * ============================================================
 *
 * Inspiré de GOSE 2.0 — le cloisonnement est appliqué PAR DÉFAUT,
 * l'accès non filtré est EXPLICITE.
 *
 * Ce module centralise la construction des filtres Prisma `where` pour
 * garantir que toute requête sur une table tenant-scopée inclut
 * obligatoirement `tenantId` et, quand c'est pertinent, `anneeCourante`.
 *
 * Le bug qui a affecté 42 fichiers en août 2026 (données de toutes les
 * années mélangées) serait impossible avec ce module : l'année est
 * injectée automatiquement, pas laissée à la diligence de chaque
 * développeur.
 *
 * USAGE :
 *   import { scopedWhere } from "@/lib/domain/scoped-where";
 *
 *   // Au lieu de : prisma.devoir.findMany({ where: { tenantId } })
 *   // Faire :
 *   const where = scopedWhere(tenantId, { anneeCourante }, "devoir");
 *   prisma.devoir.findMany({ where });
 *
 * Le filtre de site est appliqué via site-scope.ts (déjà existant).
 * Ce module se concentre sur tenantId + annéeCourante.
 */

import { SITE_PATHS, type SitePath } from "@/lib/site-scope";

/**
 * Modèles qui ont une colonne `annee` directe (ex: Classe.annee, EmploiTemps.annee).
 */
const MODELES_ANNEE_COLONNE = new Set([
  "classe",
  "emploiTemps",
]);

/**
 * Modèles qui sont filtrés par année via la relation `classe.annee`.
 */
const MODELES_ANNEE_VIA_CLASSE = new Set([
  "devoir",
  "evaluation",
  "note",
  "tache",
  "seancePedagogique",
  "affectationEnseignant",
]);

/**
 * Modèles filtrés par année via la relation `eleve.classe.annee`.
 */
const MODELES_ANNEE_VIA_ELEVE = new Set([
  "absence",
  "incident",
  "passageInfirmerie",
  "recommandation",
  "parcoursScolaire",
  "historiqueClasse",
]);

/**
 * Modèles filtrés par année via la relation `periode.annee`.
 */
const MODELES_ANNEE_VIA_PERIODE = new Set([
  "bulletin",
  "bulletinMatiere",
]);

/**
 * Modèles qui ne sont PAS filtrés par année (données de référence,
 * transverses, ou qui gèrent leur propre filtrage temporel).
 */
const MODELES_SANS_FILTRE_ANNEE = new Set([
  "tenant",
  "site",
  "user",
  "userTenant",
  "userRole",
  "userPermission",
  "matiere",
  "structure",
  "periode",
  "anneesScolaires",
  "evenementCalendaire",
  "auditLog",
  "notification",
  "conversation",
  "message",
  "conversationParticipant",
  "module",
  "moduleActivation",
  "syncConfig",
  "calendrierOfficiel",
  "demandeLienParent",
  "preferencesParent",
  "document",
  "aiCache",
  "account",
  "session",
  "verificationToken",
  "deviceToken",
  "candidature",
  "campagneReinscription",
  "invitationReinscription",
  "conseil",
  "membreConseil",
  "mentorat",
  "objectifMentorat",
  "seanceMentorat",
  "tarifNiveau",
  "reglesAppreciation",
  // LEARNOS — le curriculum est national, pas scopé par année
  "chapitre",
  "competence",
  "question",
  "feuilleExercices",
  "seuilsRecommandation",
  "planificationChapitre",
  "planificationCompetence",
  "rubriqueEvaluation",
  // Santé : la fiche sanitaire suit l'élève, pas l'année
  "ficheSanitaire",
  // RH : les fiches et congés ne sont pas scopés par année
  "ficheRH",
  "absencePersonnel",
  "congePersonnel",
  "bulletinPaie",
  // Budget : scopé par exercice comptable, pas par année scolaire
  "budget",
  "depense",
  "remiseCaisse",
]);

/**
 * Vérifie si un modèle supporte le filtrage par année.
 */
export function modeleFiltrableParAnnee(model: string): boolean {
  return (
    MODELES_ANNEE_COLONNE.has(model) ||
    MODELES_ANNEE_VIA_CLASSE.has(model) ||
    MODELES_ANNEE_VIA_ELEVE.has(model) ||
    MODELES_ANNEE_VIA_PERIODE.has(model)
  );
}

/**
 * Construit un fragment `where` avec tenantId + filtre d'année automatique.
 *
 * @param tenantId le tenant actif (OBLIGATOIRE, non-null)
 * @param anneeCourante l'année scolaire courante (ex: "2025-2026") ou null
 * @param model le nom du modèle Prisma (ex: "devoir", "classe", "note")
 * @param filtresSupplementaires filtres additionnels de l'appelant
 * @returns un objet `where` Prisma avec tenantId + année + filtres
 *
 * @example
 *   const where = scopedWhere(tenantId, "2025-2026", "devoir", { classeId });
 *   // → { tenantId, classe: { annee: "2025-2026" }, classeId }
 *
 * @example Sans année (début d'année non définie) :
 *   const where = scopedWhere(tenantId, null, "devoir");
 *   // → { tenantId } (pas de filtre d'année, mais tenantId toujours présent)
 */
export function scopedWhere(
  tenantId: string,
  anneeCourante: string | null,
  model: string,
  filtresSupplementaires?: Record<string, unknown>
): Record<string, unknown> {
  if (!tenantId) {
    throw new Error(
      `scopedWhere: tenantId est OBLIGATOIRE pour le modèle "${model}". ` +
        "Un requête sans tenantId provoque une fuite de données entre tenants."
    );
  }

  const where: Record<string, unknown> = { tenantId };

  // Appliquer le filtre d'année si disponible et si le modèle le supporte
  if (anneeCourante) {
    if (MODELES_ANNEE_COLONNE.has(model)) {
      where.annee = anneeCourante;
    } else if (MODELES_ANNEE_VIA_CLASSE.has(model)) {
      where.classe = { annee: anneeCourante };
    } else if (MODELES_ANNEE_VIA_ELEVE.has(model)) {
      where.eleve = { classe: { annee: anneeCourante } };
    } else if (MODELES_ANNEE_VIA_PERIODE.has(model)) {
      where.periode = { annee: { libelle: anneeCourante } };
    }
  }

  // Fusionner les filtres supplémentaires de l'appelant
  if (filtresSupplementaires) {
    Object.assign(where, filtresSupplementaires);
  }

  return where;
}

/**
 * Variante pour les modèles qui n'ont PAS de tenantId mais qui sont
 * filtrés par année via une relation.
 *
 * @example
 *   const where = scopedWhereAnnee("2025-2026", "bulletinMatiere");
 *   // → { bulletin: { periode: { annee: { libelle: "2025-2026" } } } }
 */
export function scopedWhereAnnee(
  anneeCourante: string | null,
  model: string,
  filtresSupplementaires?: Record<string, unknown>
): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (anneeCourante) {
    if (MODELES_ANNEE_COLONNE.has(model)) {
      where.annee = anneeCourante;
    } else if (MODELES_ANNEE_VIA_CLASSE.has(model)) {
      where.classe = { annee: anneeCourante };
    } else if (MODELES_ANNEE_VIA_ELEVE.has(model)) {
      where.eleve = { classe: { annee: anneeCourante } };
    } else if (MODELES_ANNEE_VIA_PERIODE.has(model)) {
      where.periode = { annee: { libelle: anneeCourante } };
    }
  }

  if (filtresSupplementaires) {
    Object.assign(where, filtresSupplementaires);
  }

  return where;
}

/**
 * Liste des modèles qui requièrent obligatoirement tenantId.
 * Utilisé par les tests de cloisonnement pour vérifier l'exhaustivité.
 */
export const MODELES_TENANT_SCOPES = Object.keys(SITE_PATHS).filter(
  (m) => SITE_PATHS[m as keyof typeof SITE_PATHS] !== "tenant" || m !== "tenant"
);
