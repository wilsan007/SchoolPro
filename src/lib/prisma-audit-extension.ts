/**
 * Extension Prisma — Détection runtime des failures silencieux.
 *
 * Active en développement et en mode `warn`, cette extension:
 *  1. Détecte les requêtes sur tables tenant-scopées SANS tenantId dans le where
 *  2. Détecte les update/delete par id seul sans tenantId
 *  3. Logge des warnings structurés pour chaque violation
 *  4. En mode `enforce`, lance une erreur au lieu de logger
 *
 * Usage:
 *   import prisma from "@/lib/prisma";
 *   // prisma est déjà étendu avec cette extension en dev/warn
 *
 * Configuration via env:
 *   AUDIT_PRISMA=off    — désactivé (production par défaut)
 *   AUDIT_PRISMA=warn   — logge les violations (développement)
 *   AUDIT_PRISMA=enforce — lance une erreur (tests d'isolation)
 */

import { Prisma } from "@prisma/client";

// ─── Tables tenant-scopées (ont un champ tenantId) ─────────
const TENANT_SCOPED_MODELS = new Set([
  "eleve", "parent", "eleveParent", "classe", "matiere", "chapitre", "competence",
  "note", "devoir", "evaluation", "examen", "absence", "retard", "incident",
  "sanction", "convocation", "exclusion", "passageInfirmerie", "ficheSanitaire",
  "bulletin", "periode", "emploiTemps", "seancePedagogique", "cahierJournal",
  "planificationChapitre", "planificationCompetence", "evenementCalendaire",
  "facture", "paiement", "echeancier", "depense", "budget", "remiseCaisse",
  "caisse", "inventaire", "itemInventaire", "fourniture", "demandeFourniture",
  "enseignant", "ficheRH", "absencePersonnel", "congePersonnel", "bulletinPaie",
  "disponibiliteEnseignant", "indisponibiliteEnseignant", "remplacementCours",
  "affectationEnseignant", "salle", "notification", "message", "conversation",
  "conversationParticipant", "tache", "invitationReinscription",
  "campagneReinscription", "alumni", "candidature", "admission",
  "mentorat", "orientation", "parcoursScolaire", "documentEleve",
  "fichierJoint", "syncConfig", "moduleActivation", "impersonationGrant",
  "patternPedagogique", "predictionDifficulte", "calibrationSeuil",
  "journalApprentissage", "feuilleExercices", "question", "alerteParent",
  "comparateurKpi", "comparateurFeuille", "learnosEventDeadletter",
  "rubriqueEvaluation", "trimestre", "anneesScolaires",
]);

// ─── Tables NON tenant-scopées (système, global) ───────────
const SYSTEM_MODELS = new Set([
  "tenant", "user", "userTenant", "site", "enseignantSite",
  "auditLog", "session", "account", "verificationToken",
  "emailLog", "siteDeletionLog",
]);

// ─── Opérations de lecture vs écriture ─────────────────────
const READ_OPS = new Set(["findMany", "findFirst", "findUnique", "count", "aggregate", "groupBy"]);
const WRITE_OPS = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);

// ─── Mode de fonctionnement ────────────────────────────────
type AuditMode = "off" | "warn" | "enforce";
function getAuditMode(): AuditMode {
  const env = process.env.AUDIT_PRISMA || process.env.NODE_ENV === "development" ? "warn" : "off";
  return (env as AuditMode) || "off";
}

// ─── Vérification d'une requête ────────────────────────────
interface AuditViolation {
  model: string;
  operation: string;
  reason: string;
  where?: unknown;
}

function checkQuery(model: string | undefined, action: string, args: unknown): AuditViolation | null {
  if (!model || !TENANT_SCOPED_MODELS.has(model)) return null;

  const argsObj = args as Record<string, unknown> | undefined;
  if (!argsObj) return null;

  // Pour les opérations de lecture et update/delete, vérifier where
  if (READ_OPS.has(action) || action === "update" || action === "delete" || action === "deleteMany" || action === "updateMany") {
    const where = argsObj.where as Record<string, unknown> | undefined;
    if (!where) {
      return { model, operation: action, reason: "pas de clause where", where };
    }
    if (!("tenantId" in where)) {
      // Vérifier si tenantId est dans args directement (findMany avec where au même niveau)
      if ("tenantId" in argsObj) return null;
      return {
        model,
        operation: action,
        reason: `pas de tenantId dans where pour ${model}.${action}`,
        where,
      };
    }
  }

  // Pour create/createMany, vérifier data
  if (action === "create" || action === "createMany") {
    const data = argsObj.data as Record<string, unknown> | undefined;
    if (data && !("tenantId" in data) && !Array.isArray(data)) {
      return { model, operation: action, reason: `pas de tenantId dans data pour ${model}.create` };
    }
  }

  // Pour upsert, vérifier both where et create
  if (action === "upsert") {
    const where = argsObj.where as Record<string, unknown> | undefined;
    const create = argsObj.create as Record<string, unknown> | undefined;
    if (where && !("tenantId" in where)) {
      return { model, operation: action, reason: `pas de tenantId dans where pour ${model}.upsert`, where };
    }
    if (create && !("tenantId" in create)) {
      return { model, operation: action, reason: `pas de tenantId dans create pour ${model}.upsert` };
    }
  }

  return null;
}

// ─── Logger structuré ──────────────────────────────────────
function logViolation(violation: AuditViolation) {
  const prefix = `[AUDIT_PRISMA] ⚠️`;
  const msg = `${prefix} ${violation.reason}`;
  const detail = {
    model: violation.model,
    operation: violation.operation,
    where: violation.where,
    stack: new Error().stack?.split("\n").slice(2, 8).join("\n"),
  };
  console.warn(msg, JSON.stringify(detail, null, 2));
}

// ─── Extension Prisma ──────────────────────────────────────
export function createAuditExtension() {
  const mode = getAuditMode();
  if (mode === "off") return {};

  return Prisma.defineExtension({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: {
          model?: string;
          operation: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          const violation = checkQuery(model, operation, args);
          if (violation) {
            if (mode === "enforce") {
              throw new Error(
                `[AUDIT_PRISMA] VIOLATION: ${violation.reason}. ` +
                  `En mode enforce, cette requête est bloquée. ` +
                  `Ajoutez tenantId au where/data.`
              );
            }
            logViolation(violation);
          }
          return query(args);
        },
      },
    },
  });
}
