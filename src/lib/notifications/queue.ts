/**
 * EcolPro — Queue Asynchrone de Diffusion Multi-Canal
 * ============================================================
 *
 * Orchestre l'envoi de notifications sur plusieurs canaux (EMAIL, SMS,
 * PUSH, WHATSAPP, TELEGRAM) de manière asynchrone avec Circuit Breaker.
 *
 * Objectifs :
 * 1. La requête API initiale répond en < 150ms (mise en file immédiate)
 * 2. La queue dépile à 50 messages/seconde sans blocage UI
 * 3. Bascule automatique vers un canal alternatif si le canal principal
 *    présente un taux d'erreur > 20% (Circuit Breaker)
 */

import { getCircuit } from "./circuit-breaker";

// ============================================================
// TYPES
// ============================================================

export type CanalNotification = "EMAIL" | "SMS" | "PUSH" | "WHATSAPP" | "TELEGRAM";

export interface NotificationJob {
  id: string;
  notificationId: string;
  canal: CanalNotification;
  destinataires: string[];
  titre: string;
  contenu: string;
  tenantId: string;
  /** Priorité : HIGH = immédiat, NORMAL = file standard, LOW = batch */
  priorite: "HIGH" | "NORMAL" | "LOW";
  /** Tentatives d'envoi */
  attempts: number;
  /** Statut */
  status: "QUEUED" | "SENDING" | "SENT" | "FAILED" | "FALLBACK";
  /** Canal de fallback si le canal principal échoue */
  canalFallback?: CanalNotification;
  /** Horodatage de création */
  createdAt: number;
  /** Prochain retry (ms epoch) */
  nextRetryAt: number;
}

export interface QueueStats {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  fallback: number;
  throughput: number; // messages/seconde
}

// ============================================================
// CONSTANTES
// ============================================================

const RATE_LIMIT_MS = 20; // 50 messages/seconde = 20ms entre chaque
const MAX_ATTEMPTS = 3;
const FALLBACK_ORDER: Record<CanalNotification, CanalNotification | undefined> = {
  SMS: "WHATSAPP",
  WHATSAPP: "TELEGRAM",
  TELEGRAM: "EMAIL",
  EMAIL: undefined,
  PUSH: undefined,
};

// ============================================================
// QUEUE EN MÉMOIRE (en production : Redis / BullMQ)
// ============================================================

const queue: NotificationJob[] = [];
let isProcessing = false;
let lastSentAt = 0;
let sentCount = 0;
let lastThroughputReset = Date.now();

/**
 * Ajoute un job à la queue de diffusion.
 * Retourne immédiatement (< 1ms) pour ne pas bloquer l'API.
 */
export function enqueueNotification(job: Omit<NotificationJob, "id" | "attempts" | "status" | "createdAt" | "nextRetryAt">): NotificationJob {
  const fullJob: NotificationJob = {
    ...job,
    id: generateJobId(),
    attempts: 0,
    status: "QUEUED",
    createdAt: Date.now(),
    nextRetryAt: Date.now(),
  };
  // Insérer selon la priorité (HIGH en tête)
  if (fullJob.priorite === "HIGH") {
    queue.unshift(fullJob);
  } else {
    queue.push(fullJob);
  }

  // Déclencher le traitement asynchrone
  void processQueue();

  return fullJob;
}

/**
 * Traite la queue de manière asynchrone.
 * Respecte le rate limit (50 msg/s) et le Circuit Breaker par canal.
 */
async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  while (queue.length > 0) {
    const now = Date.now();

    // Respecter le rate limit
    if (now - lastSentAt < RATE_LIMIT_MS) {
      await sleep(RATE_LIMIT_MS - (now - lastSentAt));
    }

    const job = queue.shift();
    if (!job) break;

    // Vérifier le Circuit Breaker
    const circuit = getCircuit(job.canal);
    if (circuit.getStats().state === "OPEN") {
      // Tenter le fallback
      const fallback = FALLBACK_ORDER[job.canal];
      if (fallback && job.attempts < MAX_ATTEMPTS) {
        job.canal = fallback;
        job.status = "FALLBACK";
        queue.unshift(job);
        continue;
      } else {
        job.status = "FAILED";
        continue;
      }
    }

    // Exécuter l'envoi via le Circuit Breaker
    job.status = "SENDING";
    job.attempts++;

    try {
      await circuit.execute(() => sendViaCanal(job));
      job.status = "SENT";
      lastSentAt = Date.now();
      sentCount++;
    } catch (e) {
      console.warn("[non-fatal]", e);
      // Échec — retry ou fallback
      if (job.attempts < MAX_ATTEMPTS) {
        const fallback = FALLBACK_ORDER[job.canal];
        if (fallback) {
          job.canal = fallback;
          job.status = "FALLBACK";
          job.nextRetryAt = Date.now() + 2000 * Math.pow(2, job.attempts);
          queue.push(job);
        } else {
          job.status = "FAILED";
        }
      } else {
        job.status = "FAILED";
      }
    }
  }

  isProcessing = false;
}

// ============================================================
// ENVOI PAR CANAL (injecté en production)
// ============================================================

// Fonctions d'envoi injectables (en production, importées depuis les modules existants)
let sendFns: Partial<Record<CanalNotification, (job: NotificationJob) => Promise<void>>> = {};

/**
 * Configure les fonctions d'envoi par canal.
 * À appeler au démarrage de l'application.
 */
export function configureSenders(
  fns: Partial<Record<CanalNotification, (job: NotificationJob) => Promise<void>>>
): void {
  sendFns = { ...sendFns, ...fns };
}

async function sendViaCanal(job: NotificationJob): Promise<void> {
  const fn = sendFns[job.canal];
  if (!fn) {
    throw new Error(`Aucune fonction d'envoi configurée pour le canal ${job.canal}`);
  }
  await fn(job);
}

// ============================================================
// STATISTIQUES
// ============================================================

export function getQueueStats(): QueueStats {
  const now = Date.now();
  // Réinitialiser le compteur de throughput toutes les secondes
  if (now - lastThroughputReset > 1000) {
    sentCount = 0;
    lastThroughputReset = now;
  }

  let pending = 0, sending = 0, sent = 0, failed = 0, fallback = 0;
  for (const job of queue) {
    switch (job.status) {
      case "QUEUED": pending++; break;
      case "SENDING": sending++; break;
      case "SENT": sent++; break;
      case "FAILED": failed++; break;
      case "FALLBACK": fallback++; break;
    }
  }

  return {
    pending,
    sending,
    sent,
    failed,
    fallback,
    throughput: sentCount,
  };
}

/** Retourne la taille actuelle de la file. */
export function getQueueSize(): number {
  return queue.length;
}

// ============================================================
// UTILITAIRES
// ============================================================

function generateJobId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
