/**
 * EcolPro — Helper d'audit non-bloquant
 * ============================================================
 * Journalise les actions sensibles et les refus d'autorisation.
 * Ne lève JAMAIS d'exception — l'audit ne doit pas casser le flux métier.
 */

import prisma from "@/lib/prisma";
import type { AuditVerdict, Prisma } from "@prisma/client";

export interface AuditParams {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  verdict: AuditVerdict;
  resource?: string;
  resourceId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Écrit une entrée d'audit de façon non-bloquante.
 * Toute erreur est catchée et loggée — l'audit ne doit jamais
 * interrompre le flux métier.
 */
export async function audit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId ?? null,
        userId: params.userId ?? null,
        action: params.action,
        verdict: params.verdict,
        resource: params.resource ?? null,
        resourceId: params.resourceId ?? null,
        reason: params.reason ?? null,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] Échec d'écriture du journal d'audit:", err);
  }
}

/**
 * Variante synchrone (fire-and-forget) pour les contextes
 * où on ne peut pas await (ex: dans un catch block).
 */
export function auditFire(params: AuditParams): void {
  audit(params).catch((err) =>
    console.error("[audit] Erreur fire-and-forget:", err)
  );
  alertIfSecurityEvent(params);
}

// ============================================================
// ALERTES DE SÉCURITÉ
// ============================================================

/** Actions dont un échec répété doit déclencher une alerte. */
const SECURITY_ACTIONS = new Set([
  "auth:login",
  "auth:2fa",
  "auth:turnstile",
  "auth:super-admin",
  "switch-role",
  "rbac:denied",
]);

/** Seuil d'échecs avant alerte (dans la fenêtre de 5 min). */
const ALERT_THRESHOLD = 5;
const ALERT_WINDOW_SEC = 300;

/** Compteur en mémoire des échecs récents par clé. */
const failureCounts = new Map<string, { count: number; firstAt: number }>();

/**
 * Détecte les événements de sécurité (échec d'auth, refus de permission)
 * et émet une alerte console si le seuil est atteint.
 *
 * En production, cette alerte devrait être connectée à un canal
 * (email, Slack, PagerDuty) via une intégration externe.
 */
function alertIfSecurityEvent(params: AuditParams): void {
  if (params.verdict !== "DENIED") return;
  if (!SECURITY_ACTIONS.has(params.action)) return;

  const key = `${params.action}:${params.ip ?? params.userId ?? "unknown"}`;
  const now = Date.now();
  const entry = failureCounts.get(key);

  if (!entry || now - entry.firstAt > ALERT_WINDOW_SEC * 1000) {
    failureCounts.set(key, { count: 1, firstAt: now });
    return;
  }

  entry.count++;
  if (entry.count >= ALERT_THRESHOLD) {
    console.warn(
      `[SECURITY ALERT] ${entry.count} échecs "${params.action}" ` +
        `depuis ${params.ip ?? params.userId ?? "?"} ` +
        `dans les dernières ${ALERT_WINDOW_SEC}s. ` +
        `Action: ${params.action}, ressource: ${params.resource ?? "N/A"}.`
    );
    // Reset pour éviter les alertes en cascade
    failureCounts.delete(key);
  }
}
