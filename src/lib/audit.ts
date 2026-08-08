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
}
