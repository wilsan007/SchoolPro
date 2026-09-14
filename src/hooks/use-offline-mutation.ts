"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type HttpMethod,
  type QueuedMutation,
  type SyncResult,
  InMemoryMutationStore,
  enqueueMutation,
  drainQueue,
} from "@/lib/mobile/offline-sync";

// ============================================================
// HOOK : useOfflineMutation
// ============================================================
//
// Permet d'exécuter une mutation API en mode offline-first.
// Si l'appareil est hors-ligne, la mutation est mise en file d'attente
// et synchronisée ultérieurement.
//
// Usage :
//   const { mutate, isPending, queueSize } = useOfflineMutation();
//   await mutate("/api/absences", "POST", { eleveId: "...", date: "..." });

// Store singleton (en production, remplacé par Dexie/SQLite)
let globalStore: InMemoryMutationStore | null = null;

function getStore(): InMemoryMutationStore {
  if (!globalStore) {
    globalStore = new InMemoryMutationStore();
  }
  return globalStore;
}

export interface UseOfflineMutationResult {
  /** Exécute une mutation (immédiatement si en ligne, sinon en file d'attente) */
  mutate: (url: string, method: HttpMethod, body?: unknown | null) => Promise<{ queued: boolean; mutation?: QueuedMutation }>;
  /** Tente de synchroniser la file d'attente */
  sync: () => Promise<SyncResult>;
  /** Nombre de mutations en attente */
  queueSize: number;
  /** Indique si l'appareil est actuellement en ligne */
  isOnline: boolean;
  /** Dernier résultat de synchronisation */
  lastSyncResult: SyncResult | null;
}

export function useOfflineMutation(): UseOfflineMutationResult {
  const [isOnline, setIsOnline] = useState(true);
  const [queueSize, setQueueSize] = useState(0);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [csrfToken, setCsrfToken] = useState("");

  // Surveiller la connectivité
  useEffect(() => {
    if (typeof navigator === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync au retour de la connectivité
      void doSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doSync est stable via useCallback, on ne veut pas re-enregistrer les listeners
  }, []);

  // Récupérer le token CSRF
  useEffect(() => {
    fetch("/api/csrf")
      .then((r) => r.json())
      .then((data: { token: string }) => setCsrfToken(data.token))
      .catch((e) => console.warn("[non-fatal]", e));
  }, []);

  // Mettre à jour la taille de la file
  const refreshQueueSize = useCallback(async () => {
    const store = getStore();
    const count = await store.countPending();
    setQueueSize(count);
  }, []);

  // Synchroniser la file
  const doSync = useCallback(async () => {
    if (!csrfToken) return { synced: 0, conflicts: 0, failed: 0, remaining: 0 };
    const store = getStore();
    const result = await drainQueue(store, fetch, csrfToken);
    setLastSyncResult(result);
    await refreshQueueSize();
    return result;
  }, [csrfToken, refreshQueueSize]);

  // Exécuter une mutation
  const mutate = useCallback(
    async (url: string, method: HttpMethod, body?: unknown | null) => {
      const store = getStore();

      if (isOnline && csrfToken) {
        // En ligne : tenter directement, fallback vers la file en cas d'échec
        try {
          const response = await fetch(url, {
            method,
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrfToken,
            },
            body: body ? JSON.stringify(body) : null,
          });

          if (response.ok) {
            return { queued: false };
          }

          // Si la requête échoue (ex: 500 ou réseau), mettre en file
          if (response.status >= 500) {
            const mutation = await enqueueMutation(store, url, method, body ?? null);
            await refreshQueueSize();
            return { queued: true, mutation };
          }

          // Erreur client (400, 403) — ne pas mettre en file
          throw new Error(`HTTP ${response.status}`);
        } catch (e) {
          console.warn("[non-fatal]", e);
          // Erreur réseau — mettre en file
          const mutation = await enqueueMutation(store, url, method, body ?? null);
          await refreshQueueSize();
          return { queued: true, mutation };
        }
      }

      // Hors-ligne : mettre en file d'attente
      const mutation = await enqueueMutation(store, url, method, body ?? null);
      await refreshQueueSize();
      return { queued: true, mutation };
    },
    [isOnline, csrfToken, refreshQueueSize]
  );

  return {
    mutate,
    sync: doSync,
    queueSize,
    isOnline,
    lastSyncResult,
  };
}
