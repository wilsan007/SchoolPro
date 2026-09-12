/**
 * EcolPro — Moteur de synchronisation Offline-First
 * ============================================================
 *
 * Gère une file d'attente locale de mutations (POST/PATCH/DELETE) pour
 * permettre le fonctionnement hors-ligne de l'application mobile (Capacitor).
 *
 * Architecture :
 * 1. Les mutations sont stockées localement (IndexedDB via Dexie ou SQLite Capacitor)
 *    avec un UUID client, un horodatage et un compteur de réessais exponentiel.
 * 2. Au retour de la connectivité, la file est dévidée séquentiellement.
 * 3. En cas de conflit (409), la stratégie Last-Write-Wins est appliquée pour
 *    les notes d'un même enseignant ; les conflits d'évaluation concurrente
 *    déclenchent une notification pour résolution manuelle.
 */

// ============================================================
// TYPES
// ============================================================

export type HttpMethod = "POST" | "PATCH" | "DELETE";

export interface QueuedMutation {
  /** UUID client unique pour idempotence */
  id: string;
  /** URL de l'API cible (ex: /api/absences, /api/notes) */
  url: string;
  method: HttpMethod;
  /** Corps de la requête sérialisé en JSON */
  body: string | null;
  /** Horodatage de création côté client (ms epoch) */
  createdAt: number;
  /** Nombre de tentatives de synchronisation */
  attempts: number;
  /** Prochain délai de retry (ms), exponentiel : base * 2^attempts */
  nextRetryAt: number;
  /** Statut de la mutation */
  status: "PENDING" | "SYNCING" | "SYNCED" | "CONFLICT" | "FAILED";
  /** Motif d'échec si applicable */
  errorMessage?: string;
  /** Empreinte pour la déduplication (ex: `${url}-${body-hash}`) */
  fingerprint: string;
}

export interface SyncResult {
  synced: number;
  conflicts: number;
  failed: number;
  remaining: number;
}

// ============================================================
// CONSTANTES
// ============================================================

const BASE_RETRY_MS = 2_000; // 2 secondes
const MAX_RETRY_MS = 300_000; // 5 minutes
const MAX_ATTEMPTS = 10;

// ============================================================
// UTILITAIRES
// ============================================================

/** Calcule le délai de retry exponentiel avec plafond. */
export function retryDelay(attempts: number): number {
  const delay = BASE_RETRY_MS * Math.pow(2, attempts);
  return Math.min(delay, MAX_RETRY_MS);
}

/** Génère un UUID v4 côté client (pas de dépendance externe). */
export function generateClientId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback pour les environnements sans crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Calcule une empreinte simple pour la déduplication. */
export function computeFingerprint(url: string, body: string | null): string {
  const raw = `${url}:${body ?? ""}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return `fp-${Math.abs(hash).toString(36)}`;
}

// ============================================================
// INTERFACE DE STOCKAGE (abstraction pour Dexie / SQLite / IndexedDB)
// ============================================================

/**
 * Abstraction de stockage de la file d'attente.
 * En production, implémentée par Dexie (IndexedDB) ou @capacitor-community/sqlite.
 * En tests, implémentée par un Map en mémoire.
 */
export interface MutationStore {
  add(mutation: QueuedMutation): Promise<void>;
  getAll(): Promise<QueuedMutation[]>;
  update(id: string, patch: Partial<QueuedMutation>): Promise<void>;
  remove(id: string): Promise<void>;
  removeSynced(): Promise<void>;
  countPending(): Promise<number>;
}

// ============================================================
// STORE EN MÉMOIRE (pour tests et fallback)
// ============================================================

export class InMemoryMutationStore implements MutationStore {
  private mutations = new Map<string, QueuedMutation>();

  async add(mutation: QueuedMutation): Promise<void> {
    this.mutations.set(mutation.id, { ...mutation });
  }

  async getAll(): Promise<QueuedMutation[]> {
    return Array.from(this.mutations.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  async update(id: string, patch: Partial<QueuedMutation>): Promise<void> {
    const existing = this.mutations.get(id);
    if (existing) {
      this.mutations.set(id, { ...existing, ...patch });
    }
  }

  async remove(id: string): Promise<void> {
    this.mutations.delete(id);
  }

  async removeSynced(): Promise<void> {
    for (const [id, m] of this.mutations) {
      if (m.status === "SYNCED") {
        this.mutations.delete(id);
      }
    }
  }

  async countPending(): Promise<number> {
    let count = 0;
    for (const m of this.mutations.values()) {
      if (m.status === "PENDING") count++;
    }
    return count;
  }
}

// ============================================================
// MISE EN FILE D'ATTENTE
// ============================================================

/**
 * Ajoute une mutation à la file d'attente locale.
 * Vérifie la déduplication via l'empreinte.
 */
export async function enqueueMutation(
  store: MutationStore,
  url: string,
  method: HttpMethod,
  body: unknown | null
): Promise<QueuedMutation> {
  const bodyStr = body ? JSON.stringify(body) : null;
  const fingerprint = computeFingerprint(url, bodyStr);

  // Vérifier la déduplication : si une mutation identique est déjà en attente, on ne duplique pas
  const existing = await store.getAll();
  const duplicate = existing.find(
    (m) => m.fingerprint === fingerprint && m.status === "PENDING"
  );
  if (duplicate) {
    return duplicate;
  }

  const now = Date.now();
  const mutation: QueuedMutation = {
    id: generateClientId(),
    url,
    method,
    body: bodyStr,
    createdAt: now,
    attempts: 0,
    nextRetryAt: now,
    status: "PENDING",
    fingerprint,
  };

  await store.add(mutation);
  return mutation;
}

// ============================================================
// DRAINAGE DE LA FILE (synchronisation)
// ============================================================

/**
 * Tente de synchroniser toutes les mutations en attente.
 * Appelée au retour de la connectivité ou périodiquement.
 *
 * @param store Le store de mutations
 * @param fetchFn Fonction de fetch (injectée pour testabilité)
 * @param csrfToken Token CSRF pour les mutations Next.js
 */
export async function drainQueue(
  store: MutationStore,
  fetchFn: typeof fetch,
  csrfToken: string
): Promise<SyncResult> {
  const all = await store.getAll();
  const pending = all.filter(
    (m) =>
      (m.status === "PENDING" || m.status === "CONFLICT") &&
      Date.now() >= m.nextRetryAt &&
      m.attempts < MAX_ATTEMPTS
  );

  let synced = 0;
  let conflicts = 0;
  let failed = 0;

  for (const mutation of pending) {
    await store.update(mutation.id, { status: "SYNCING" });

    try {
      const response = await fetchFn(mutation.url, {
        method: mutation.method,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: mutation.body,
      });

      if (response.ok) {
        await store.update(mutation.id, { status: "SYNCED" });
        synced++;
      } else if (response.status === 409) {
        // Conflit — Last-Write-Wins pour les notes, notification pour les évaluations
        const errorBody = await response.text().catch(() => "");
        await store.update(mutation.id, {
          status: "CONFLICT",
          attempts: mutation.attempts + 1,
          nextRetryAt: Date.now() + retryDelay(mutation.attempts + 1),
          errorMessage: errorBody || "Conflit de version",
        });
        conflicts++;
      } else if (response.status >= 400 && response.status < 500) {
        // Erreur client non récupérable (400, 403, 404, etc.)
        await store.update(mutation.id, {
          status: "FAILED",
          attempts: mutation.attempts + 1,
          errorMessage: `HTTP ${response.status}`,
        });
        failed++;
      } else {
        // Erreur serveur (500, 502, 503) — retry exponentiel
        await store.update(mutation.id, {
          status: "PENDING",
          attempts: mutation.attempts + 1,
          nextRetryAt: Date.now() + retryDelay(mutation.attempts + 1),
          errorMessage: `HTTP ${response.status}`,
        });
        failed++;
      }
    } catch (err) {
      // Erreur réseau — retry exponentiel
      await store.update(mutation.id, {
        status: "PENDING",
        attempts: mutation.attempts + 1,
        nextRetryAt: Date.now() + retryDelay(mutation.attempts + 1),
        errorMessage: err instanceof Error ? err.message : "Erreur réseau",
      });
      failed++;
    }
  }

  // Nettoyer les mutations synchronisées
  await store.removeSynced();

  const remaining = await store.countPending();

  return { synced, conflicts, failed, remaining };
}

// ============================================================
// STRATÉGIE DE RÉSOLUTION DE CONFLITS
// ============================================================

/**
 * Détermine la stratégie de résolution de conflit selon le type de mutation.
 *
 * - Notes d'un même enseignant : Last-Write-Wins (la dernière version gagne)
 * - Évaluations concurrentes : Notification pour résolution manuelle
 * - Autres : Last-Write-Wins par défaut
 */
export function resolveConflict(
  localMutation: QueuedMutation,
  serverVersion: unknown
): "OVERWRITE" | "KEEP_SERVER" | "NOTIFY" {
  // Les notes (URL contient /api/notes) → Last-Write-Wins
  if (localMutation.url.includes("/api/notes")) {
    return "OVERWRITE";
  }

  // Les évaluations (URL contient /api/evaluations) → Notification manuelle
  if (localMutation.url.includes("/api/evaluations")) {
    return "NOTIFY";
  }

  // Par défaut : Last-Write-Wins
  return "OVERWRITE";
}
