import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  retryDelay,
  generateClientId,
  computeFingerprint,
  InMemoryMutationStore,
  enqueueMutation,
  drainQueue,
  resolveConflict,
  type QueuedMutation,
} from "./offline-sync";

describe("Moteur Offline-Sync Mobile (src/lib/mobile/offline-sync.ts)", () => {
  let store: InMemoryMutationStore;

  beforeEach(() => {
    store = new InMemoryMutationStore();
    vi.restoreAllMocks();
  });

  describe("retryDelay", () => {
    it("calcule un délai exponentiel correct avec base 2000ms", () => {
      expect(retryDelay(0)).toBe(2000);
      expect(retryDelay(1)).toBe(4000);
      expect(retryDelay(2)).toBe(8000);
      expect(retryDelay(3)).toBe(16000);
    });

    it("plafonne le délai à 300 000 ms (5 minutes)", () => {
      expect(retryDelay(10)).toBe(300_000);
      expect(retryDelay(20)).toBe(300_000);
    });
  });

  describe("generateClientId", () => {
    it("génère un UUID valide", () => {
      const id1 = generateClientId();
      const id2 = generateClientId();
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(id1).not.toBe(id2);
    });
  });

  describe("computeFingerprint", () => {
    it("est déterministe pour une URL et un corps identiques", () => {
      const fp1 = computeFingerprint("/api/absences", JSON.stringify({ eleveId: "123", statut: "ABSENT" }));
      const fp2 = computeFingerprint("/api/absences", JSON.stringify({ eleveId: "123", statut: "ABSENT" }));
      expect(fp1).toBe(fp2);
    });

    it("change si le corps ou l'URL varie", () => {
      const fp1 = computeFingerprint("/api/absences", JSON.stringify({ eleveId: "123" }));
      const fp2 = computeFingerprint("/api/absences", JSON.stringify({ eleveId: "456" }));
      const fp3 = computeFingerprint("/api/notes", JSON.stringify({ eleveId: "123" }));
      expect(fp1).not.toBe(fp2);
      expect(fp1).not.toBe(fp3);
    });
  });

  describe("InMemoryMutationStore", () => {
    it("gère le cycle de vie complet des mutations", async () => {
      const m1: QueuedMutation = {
        id: "mut-1",
        url: "/api/notes",
        method: "POST",
        body: JSON.stringify({ valeur: 15 }),
        createdAt: 1000,
        attempts: 0,
        nextRetryAt: 1000,
        status: "PENDING",
        fingerprint: "fp-1",
      };

      await store.add(m1);
      expect(await store.countPending()).toBe(1);

      const all = await store.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe("mut-1");

      await store.update("mut-1", { status: "SYNCED" });
      expect(await store.countPending()).toBe(0);

      await store.removeSynced();
      expect(await store.getAll()).toHaveLength(0);
    });
  });

  describe("enqueueMutation", () => {
    it("ajoute une mutation à l'état PENDING", async () => {
      const mut = await enqueueMutation(store, "/api/absences", "POST", { eleveId: "e1" });
      expect(mut.status).toBe("PENDING");
      expect(mut.attempts).toBe(0);
      expect(await store.countPending()).toBe(1);
    });

    it("déduplique les mutations identiques en attente", async () => {
      const mut1 = await enqueueMutation(store, "/api/absences", "POST", { eleveId: "e1" });
      const mut2 = await enqueueMutation(store, "/api/absences", "POST", { eleveId: "e1" });
      expect(mut1.id).toBe(mut2.id);
      expect(await store.countPending()).toBe(1);
    });
  });

  describe("drainQueue", () => {
    it("synchronise avec succès les requêtes quand le réseau fonctionne (HTTP 200)", async () => {
      await enqueueMutation(store, "/api/absences", "POST", { eleveId: "e1" });
      await enqueueMutation(store, "/api/absences", "POST", { eleveId: "e2" });

      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const result = await drainQueue(store, mockFetch as unknown as typeof fetch, "csrf-token-123");

      expect(result.synced).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.conflicts).toBe(0);
      expect(result.remaining).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(await store.getAll()).toHaveLength(0); // Synchronisées et purgées
    });

    it("gère les coupures réseau sans perdre la mutation (réseau offline)", async () => {
      await enqueueMutation(store, "/api/absences", "POST", { eleveId: "e1" });

      const mockFetch = vi.fn().mockRejectedValue(new Error("Failed to fetch / network down"));

      const result = await drainQueue(store, mockFetch as unknown as typeof fetch, "csrf-token-123");

      expect(result.synced).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.remaining).toBe(1);

      const all = await store.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].status).toBe("PENDING");
      expect(all[0].attempts).toBe(1);
      expect(all[0].nextRetryAt).toBeGreaterThan(Date.now());
    });

    it("détecte les conflits HTTP 409 et positionne le statut CONFLICT", async () => {
      await enqueueMutation(store, "/api/notes", "PATCH", { noteId: "n1", valeur: 16 });

      const mockFetch = vi.fn().mockResolvedValue(new Response("Conflit de note existante", { status: 409 }));

      const result = await drainQueue(store, mockFetch as unknown as typeof fetch, "csrf-token-123");

      expect(result.conflicts).toBe(1);
      const all = await store.getAll();
      expect(all[0].status).toBe("CONFLICT");
      expect(all[0].attempts).toBe(1);
    });

    it("marque FAILED les erreurs client non récupérables (HTTP 400)", async () => {
      await enqueueMutation(store, "/api/absences", "POST", { invalid: "payload" });

      const mockFetch = vi.fn().mockResolvedValue(new Response("Bad Request", { status: 400 }));

      const result = await drainQueue(store, mockFetch as unknown as typeof fetch, "csrf-token-123");

      expect(result.failed).toBe(1);
      const all = await store.getAll();
      expect(all[0].status).toBe("FAILED");
      expect(all[0].errorMessage).toBe("HTTP 400");
    });

    it("respecte le délai nextRetryAt et ne rejoue pas une mutation prématurément", async () => {
      const mut = await enqueueMutation(store, "/api/notes", "POST", { val: 12 });
      // Définir un retry dans le futur (+1 heure)
      await store.update(mut.id, { nextRetryAt: Date.now() + 3600_000 });

      const mockFetch = vi.fn();
      const result = await drainQueue(store, mockFetch as unknown as typeof fetch, "csrf-token-123");

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.synced).toBe(0);
      expect(result.remaining).toBe(1);
    });
  });

  describe("resolveConflict", () => {
    it("applique Last-Write-Wins (OVERWRITE) pour les notes", () => {
      const mut: QueuedMutation = {
        id: "m1",
        url: "/api/notes/123",
        method: "PATCH",
        body: null,
        createdAt: Date.now(),
        attempts: 1,
        nextRetryAt: 0,
        status: "CONFLICT",
        fingerprint: "fp",
      };
      expect(resolveConflict(mut, null)).toBe("OVERWRITE");
    });

    it("exige une intervention manuelle (NOTIFY) pour les évaluations concurrentes", () => {
      const mut: QueuedMutation = {
        id: "m2",
        url: "/api/evaluations/456",
        method: "POST",
        body: null,
        createdAt: Date.now(),
        attempts: 1,
        nextRetryAt: 0,
        status: "CONFLICT",
        fingerprint: "fp",
      };
      expect(resolveConflict(mut, null)).toBe("NOTIFY");
    });
  });
});
