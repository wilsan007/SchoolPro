/**
 * Types partagés entre email.ts et email-log.ts
 * (évite la dépendance circulaire email.ts ↔ email-log.ts)
 */

export interface EmailResult {
  success: boolean;
  sent: number;
  error?: string;
  /** Map email → ID Resend, pour corrélation avec les webhooks (statut délivrance/bond). */
  emailIds?: Record<string, string>;
}

export interface EmailLogContext {
  tenantId?: string | null;
  userId?: string | null;
  type?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}
