/**
 * EcolPro — Journal des emails transactionnels (EmailLog)
 * ============================================================
 * Crée et met à jour les entrées EmailLog pour tracer chaque email
 * envoyé via Resend. Le statut est initialisé à PENDING, puis mis à
 * jour par le webhook /api/webhooks/resend (DELIVERED / BOUNCED / etc.).
 */

import prisma from "@/lib/prisma";
import type { EmailResult } from "./email";

export interface EmailLogContext {
  tenantId?: string | null;
  userId?: string | null;
  type?: string;
  resourceId?: string;
}

/**
 * Journalise un envoi d'email : crée une entrée EmailLog par destinataire.
 * Si l'envoi a échoué, le statut est FAILED avec le message d'erreur.
 * Si l'envoi a réussi, le statut est PENDING (en attente du webhook Resend).
 *
 * Best-effort : une erreur de journalisation ne doit pas bloquer l'envoi.
 */
export async function journaliserEnvoiEmail(
  destinataires: string[],
  subject: string,
  result: EmailResult,
  ctx?: EmailLogContext,
): Promise<void> {
  if (destinataires.length === 0) return;

  try {
    const statut = result.success ? "PENDING" : "FAILED";
    const erreur = result.success ? null : result.error ?? null;

    await prisma.emailLog.createMany({
      data: destinataires.map((email) => ({
        tenantId: ctx?.tenantId ?? null,
        to: email,
        subject,
        resendId: result.emailIds?.[email] ?? null,
        statut,
        erreur,
        type: ctx?.type ?? null,
        resourceId: ctx?.resourceId ?? null,
        envoyeParId: ctx?.userId ?? null,
      })),
    });
  } catch (err) {
    // Best-effort : on log l'erreur mais on ne bloque pas l'envoi
    console.error("[EmailLog] Erreur de journalisation:", err);
  }
}

/**
 * Met à jour le statut d'un EmailLog à partir d'un événement webhook Resend.
 * Recherche par resendId (l'ID unique attribué par Resend à l'envoi).
 */
export async function mettreAJourStatutEmail(
  resendId: string,
  evenement: string,
  timestamp?: Date,
): Promise<void> {
  const now = timestamp ?? new Date();

  const updates: Record<string, { statut: string; champ?: string | null }> = {
    delivered: { statut: "DELIVERED", champ: "deliveredAt" },
    bounced: { statut: "BOUNCED", champ: "bouncedAt" },
    failed: { statut: "FAILED", champ: undefined },
    complained: { statut: "COMPLAINED", champ: "complainedAt" },
    opened: { statut: "OPENED", champ: "openedAt" },
    delivery_delayed: { statut: "DELIVERY_DELAYED", champ: undefined },
  };

  const config = updates[evenement];
  if (!config) return;

  try {
    // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- webhook entrant, lookup par resendId (clé unique Resend)
    const existing = await prisma.emailLog.findUnique({
      where: { resendId },
      select: { id: true },
    });
    if (!existing) return;

    const data: Record<string, unknown> = { statut: config.statut };
    if (config.champ) {
      data[config.champ] = now;
    }

    // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- resendId déjà vérifié par findUnique
    await prisma.emailLog.update({
      where: { id: existing.id },
      data,
    });
  } catch (err) {
    console.error(`[EmailLog] Erreur mise à jour webhook (${evenement}):`, err);
  }
}
