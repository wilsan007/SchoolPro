/**
 * EcolPro — Journal d'audit global (inspiré de GOSE 2.0)
 * ============================================================
 *
 * Système de traçabilité centralisé des actions sensibles effectuées
 * sur la plateforme. Conformément aux recommandations GOSE 2.0 (MENFOP),
 * chaque action de création, modification, suppression, connexion ou
 * consultation de données sensibles est journalisée de façon non-bloquante.
 *
 * Principes directeurs :
 *  - L'audit ne doit JAMAIS casser le flux métier (try/catch systématique).
 *  - Chaque entrée est horodatée et rattachée à un utilisateur + tenant.
 *  - La durée de conservation dépend de la nature de l'action (rétention).
 *  - La purge automatique respecte la période de rétention par type d'action.
 *
 * Le modèle Prisma sous-jacent est `AuditLog` (table `audit_logs`).
 * Champs de mapping :
 *   utilisateurId → userId
 *   ressource      → resource
 *   ressourceId    → resourceId
 *   adresseIp      → ip
 *   changements    → metadata (sérialisé en JSON)
 *   dateAction     → createdAt
 */

import prisma from "@/lib/prisma";
import type { AuditLog, Prisma } from "@prisma/client";

// ============================================================
// TYPES & ÉNUMÉRATIONS
// ============================================================

/**
 * Catalogue des actions auditées par le journal.
 *
 * Inspiré du référentiel GOSE 2.0 — chaque valeur correspond à une
 * catégorie d'opération dont la criticité détermine la durée de
 * conservation (voir `retentionPourAction`).
 */
export type ActionAudit =
  | "CONNEXION"
  | "DECONNEXION"
  | "CREATION"
  | "MODIFICATION"
  | "SUPPRESSION"
  | "EXPORT"
  | "CONSULTATION_SENSIBLE"
  | "CHANGEMENT_MOT_DE_PASSE"
  | "VALIDATION"
  | "PUBLICATION";

/**
 * Liste exhaustive des actions d'audit, utile pour itérer
 * (notamment lors de la purge par type d'action).
 */
export const ACTIONS_AUDIT: readonly ActionAudit[] = [
  "CONNEXION",
  "DECONNEXION",
  "CREATION",
  "MODIFICATION",
  "SUPPRESSION",
  "EXPORT",
  "CONSULTATION_SENSIBLE",
  "CHANGEMENT_MOT_DE_PASSE",
  "VALIDATION",
  "PUBLICATION",
] as const;

/**
 * Représentation d'un changement survenu sur un champ d'une ressource.
 * `avant` et `apres` sont volontairement typés `unknown` car la nature
 * des valeurs dépend de la ressource auditée.
 */
export interface ChangementChamp {
  avant: unknown;
  apres: unknown;
}

/**
 * Entrée du journal d'audit.
 *
 * Reflète la sémantique métier (noms en français) ; le mapping vers
 * les colonnes Prisma se fait dans `enregistrerAudit`.
 */
export interface JournalAuditEntry {
  /** Identifiant technique (renseigné après persistance). */
  id?: string;
  /** Identifiant de l'utilisateur à l'origine de l'action. */
  utilisateurId: string;
  /** Identifiant du tenant concerné (transverse, peut être null pour un super-admin). */
  tenantId: string | null;
  /** Action effectuée. */
  action: ActionAudit;
  /** Type de ressource concernée (ex: "Eleve", "Facture", "User"). */
  ressource: string;
  /** Identifiant de la ressource concernée, le cas échéant. */
  ressourceId?: string | number | null;
  /** Adresse IP de l'auteur de l'action. */
  adresseIp?: string | null;
  /** User-Agent HTTP de l'auteur de l'action. */
  userAgent?: string | null;
  /** Date à laquelle l'action a eu lieu. */
  dateAction: Date;
  /** Détail des champs modifiés (avant/après), pour les actions de modification. */
  changements?: Record<string, ChangementChamp>;
}

// ============================================================
// RÉTENTION
// ============================================================

/** Durée de rétention (en jours) pour les actions à courte conservation. */
const RETENTION_1_AN = 365;
/** Durée de rétention (en jours) pour les actions à longue conservation. */
const RETENTION_3_ANS = 1095;

/** Nombre de millisecondes dans une journée (utile pour les calculs de date). */
const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/**
 * Actions conservées 1 an : événements d'authentification et
 * consultations sensibles (poids forensique faible, volume élevé).
 */
const ACTIONS_RETENTION_1_AN: readonly ActionAudit[] = [
  "CONNEXION",
  "DECONNEXION",
  "CONSULTATION_SENSIBLE",
];

/**
 * Actions conservées 3 ans : modifications structurelles des données,
 * exports et opérations à fort enjeu juridique (poids forensique élevé).
 */
const ACTIONS_RETENTION_3_ANS: readonly ActionAudit[] = [
  "CREATION",
  "MODIFICATION",
  "SUPPRESSION",
  "CHANGEMENT_MOT_DE_PASSE",
  "VALIDATION",
  "PUBLICATION",
  "EXPORT",
];

/**
 * Retourne la durée de conservation (en jours) applicable à une action.
 *
 * - 1 an (365 jours) pour `CONNEXION`, `DECONNEXION`, `CONSULTATION_SENSIBLE`.
 * - 3 ans (1095 jours) pour les actions structurelles
 *   (`CREATION`, `MODIFICATION`, `SUPPRESSION`, `CHANGEMENT_MOT_DE_PASSE`,
 *   `VALIDATION`, `PUBLICATION`, `EXPORT`).
 *
 * @param action - L'action d'audit dont on veut la rétention.
 * @returns La durée de conservation en jours.
 */
export function retentionPourAction(action: ActionAudit): number {
  if (ACTIONS_RETENTION_1_AN.includes(action)) {
    return RETENTION_1_AN;
  }
  return RETENTION_3_ANS;
}

// ============================================================
// ÉCRITURE DU JOURNAL
// ============================================================

/**
 * Convertit un `ressourceId` (string | number | null) en chaîne
 * compatible avec la colonne Prisma `resourceId` (String?).
 */
function ressourceIdVersString(
  ressourceId: string | number | null | undefined
): string | null {
  if (ressourceId === null || ressourceId === undefined) return null;
  return String(ressourceId);
}

/**
 * Enregistre une entrée dans le journal d'audit.
 *
 * Règles de validation :
 *  - `ressource` ne doit pas être vide.
 *  - `utilisateurId` ne doit pas être vide.
 *
 * L'écriture est **non-bloquante** : toute erreur de persistance est
 * catchée et loggée en console, afin de ne jamais interrompre le flux
 * métier principal. La fonction renvoie l'enregistrement créé, ou
 * `null` en cas d'échec silencieux.
 *
 * @param entry - L'entrée à journaliser (sans `id`).
 * @returns L'enregistrement Prisma créé, ou `null` si l'écriture a échoué.
 */
export async function enregistrerAudit(
  entry: Omit<JournalAuditEntry, "id">
): Promise<AuditLog | null> {
  // --- Validation des champs obligatoires ---
  if (!entry.ressource || entry.ressource.trim() === "") {
    throw new Error(
      "[journal-audit] Le champ `ressource` est obligatoire et ne doit pas être vide."
    );
  }
  if (!entry.utilisateurId || entry.utilisateurId.trim() === "") {
    throw new Error(
      "[journal-audit] Le champ `utilisateurId` est obligatoire et ne doit pas être vide."
    );
  }

  try {
    const created = await prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId ?? null,
        userId: entry.utilisateurId,
        action: entry.action,
        verdict: "ALLOWED",
        resource: entry.ressource,
        resourceId: ressourceIdVersString(entry.ressourceId),
        ip: entry.adresseIp ?? null,
        userAgent: entry.userAgent ?? null,
        createdAt: entry.dateAction,
        metadata: (entry.changements ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
    return created;
  } catch (err) {
    // L'audit ne doit jamais casser l'opération principale.
    console.error("[journal-audit] Échec d'écriture du journal d'audit:", err);
    return null;
  }
}

/**
 * Journalise une connexion utilisateur.
 *
 * Fonction de commodité pour l'action `CONNEXION` : pré-remplit la
 * ressource ("Session") et la date courante.
 *
 * @param utilisateurId - Identifiant de l'utilisateur qui se connecte.
 * @param tenantId - Identifiant du tenant (ou null pour un super-admin).
 * @param adresseIp - Adresse IP de connexion (optionnel).
 * @param userAgent - User-Agent du navigateur (optionnel).
 */
export async function enregistrerAuditConnexion(
  utilisateurId: string,
  tenantId: string | null,
  adresseIp?: string | null,
  userAgent?: string | null
): Promise<void> {
  await enregistrerAudit({
    utilisateurId,
    tenantId,
    action: "CONNEXION",
    ressource: "Session",
    ressourceId: null,
    adresseIp: adresseIp ?? null,
    userAgent: userAgent ?? null,
    dateAction: new Date(),
  });
}

/**
 * Journalise une modification sur une ressource, avec détail des
 * champs modifiés (avant/après).
 *
 * @param utilisateurId - Identifiant de l'utilisateur auteur de la modification.
 * @param tenantId - Identifiant du tenant concerné.
 * @param ressource - Type de ressource modifiée (ex: "Eleve", "Facture").
 * @param ressourceId - Identifiant de la ressource modifiée.
 * @param changements - Dictionnaire des champs modifiés (avant/après).
 * @param adresseIp - Adresse IP de l'auteur (optionnel).
 * @param userAgent - User-Agent de l'auteur (optionnel).
 */
export async function enregistrerAuditModification(
  utilisateurId: string,
  tenantId: string | null,
  ressource: string,
  ressourceId: string | number | null,
  changements: Record<string, ChangementChamp>,
  adresseIp?: string | null,
  userAgent?: string | null
): Promise<void> {
  await enregistrerAudit({
    utilisateurId,
    tenantId,
    action: "MODIFICATION",
    ressource,
    ressourceId,
    adresseIp: adresseIp ?? null,
    userAgent: userAgent ?? null,
    dateAction: new Date(),
    changements,
  });
}

// ============================================================
// PURGE DES ENTRÉES EXPIRÉES
// ============================================================

/**
 * Supprime du journal d'audit les entrées dont la période de
 * conservation est dépassée.
 *
 * Pour chaque type d'action, calcule la date limite (= maintenant -
 * rétention) et supprime les enregistrements antérieurs. Cette
 * fonction est conçue pour être appelée par une tâche planifiée
 * (cron) — typiquement une fois par jour.
 *
 * @returns Un dictionnaire `{ action: nombre }` indiquant le nombre
 *          d'enregistrements supprimés par type d'action.
 */
export async function purgerAuditAncien(): Promise<
  Record<ActionAudit, number>
> {
  const resultats = {} as Record<ActionAudit, number>;
  const maintenant = Date.now();

  for (const action of ACTIONS_AUDIT) {
    const retentionJours = retentionPourAction(action);
    const dateLimite = new Date(
      maintenant - retentionJours * MS_PAR_JOUR
    );

    try {
      // eslint-disable-next-line ecolpro/require-tenant-id -- cron système de purge, scanne tous les tenants
      const supprimes = await prisma.auditLog.deleteMany({
        where: {
          action,
          createdAt: { lt: dateLimite },
        },
      });
      resultats[action] = supprimes.count;
    } catch (err) {
      // La purge ne doit pas interrompre le traitement des autres actions.
      console.error(
        `[journal-audit] Échec de purge pour l'action "${action}":`,
        err
      );
      resultats[action] = 0;
    }
  }

  return resultats;
}

// ============================================================
// REQUÊTE / LECTURE DU JOURNAL
// ============================================================

/**
 * Critères de filtrage pour la lecture du journal d'audit.
 * `tenantId` est obligatoire (règle de cloisonnement fail-closed).
 */
export interface FiltresAudit {
  /** Filtrer par utilisateur. */
  utilisateurId?: string;
  /** Tenant concerné — OBLIGATOIRE (pas de fuite inter-tenants). */
  tenantId: string;
  /** Filtrer par type d'action. */
  action?: ActionAudit;
  /** Filtrer par type de ressource. */
  ressource?: string;
  /** Date de début (incluse). */
  dateDebut?: Date;
  /** Date de fin (incluse). */
  dateFin?: Date;
  /** Nombre maximum d'enregistrements renvoyés (pagination). */
  limit?: number;
}

/**
 * Récupère des entrées du journal d'audit selon des critères de
 * filtrage, avec pagination.
 *
 * Le `tenantId` est obligatoire afin de respecter la règle de
 * cloisonnement fail-closed : aucune requête ne peut traverser les
 * tenants. Les super-admins doivent passer explicitite un tenantId
 * ou utiliser une route dédiée documentée.
 *
 * @param filters - Critères de filtrage (tenantId obligatoire).
 * @returns Les enregistrements d'audit correspondants, triés du
 *          plus récent au plus ancien.
 */
export async function recupererAudit(
  filters: FiltresAudit
): Promise<AuditLog[]> {
  const where: Prisma.AuditLogWhereInput = {
    tenantId: filters.tenantId,
  };

  if (filters.utilisateurId) {
    where.userId = filters.utilisateurId;
  }
  if (filters.action) {
    where.action = filters.action;
  }
  if (filters.ressource) {
    where.resource = filters.ressource;
  }
  if (filters.dateDebut || filters.dateFin) {
    where.createdAt = {};
    if (filters.dateDebut) {
      where.createdAt.gte = filters.dateDebut;
    }
    if (filters.dateFin) {
      where.createdAt.lte = filters.dateFin;
    }
  }

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 100,
  });
}
