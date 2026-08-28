import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    tache: {
      findMany: vi.fn(),
    },
    notification: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import prisma from "@/lib/prisma";

const mockPrisma = prisma as unknown as {
  tache: { findMany: ReturnType<typeof vi.fn> };
  notification: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

// Import après les mocks.
const { rappelerEcheancesTaches } = await import("@/lib/tache-rappels");

// Date de référence fixe : 10 mars 2025, 10h00.
const NOW = new Date(2025, 2, 10, 10, 0, 0, 0);

function dans(jours: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + jours);
  return d;
}

describe("rappelerEcheancesTaches — rappels J-3 et J-1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // Par défaut : aucune notification existante (idempotence désactivée).
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockPrisma.notification.create.mockResolvedValue({ id: "n1" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("envoie un rappel J-3 pour une tâche dont l'échéance est dans 3 jours", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([
      {
        id: "t1",
        tenantId: "tenant1",
        titre: "Saisir les notes",
        echeance: dans(3),
        assigneeAId: "u1",
      },
    ]);

    const result = await rappelerEcheancesTaches();

    // diffJours = 3 → palier J-3 déclenché, palier J-1 (1) skippé (3 > 1).
    expect(result.count).toBe(1);
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    const created = mockPrisma.notification.create.mock.calls[0][0].data;
    expect(created.titre).toBe("[J-3] Saisir les notes");
    expect(created.contenu).toContain("dans 3 jours");
    expect(created.canal).toBe("IN_APP");
    expect(created.statut).toBe("ENVOYEE");
  });

  it("envoie un rappel J-1 pour une tâche dont l'échéance est demain", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([
      {
        id: "t2",
        tenantId: "tenant1",
        titre: "Corriger le devoir",
        echeance: dans(1),
        assigneeAId: "u2",
      },
    ]);

    const result = await rappelerEcheancesTaches();

    // diffJours = 1 → J-3 (1 <= 3) ET J-1 (1 <= 1) déclenchés.
    expect(result.count).toBe(2);
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);
    const titres = mockPrisma.notification.create.mock.calls.map(
      (c) => c[0].data.titre
    );
    expect(titres).toContain("[J-3] Corriger le devoir");
    expect(titres).toContain("[J-1] Corriger le devoir");
    // Le contenu J-1 mentionne « demain ».
    const callJ1 = mockPrisma.notification.create.mock.calls.find(
      (c) => c[0].data.titre === "[J-1] Corriger le devoir"
    );
    expect(callJ1[0].data.contenu).toContain("demain");
  });

  it("est idempotent : ne renvoie pas un palier déjà notifié", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([
      {
        id: "t3",
        tenantId: "tenant1",
        titre: "Publier le bulletin",
        echeance: dans(3),
        assigneeAId: "u3",
      },
    ]);
    // La notification J-3 existe déjà.
    mockPrisma.notification.findFirst.mockImplementation(async (args: any) => {
      if (args.where.titre === "[J-3] Publier le bulletin") {
        return { id: "exist-1" };
      }
      return null;
    });

    const result = await rappelerEcheancesTaches();

    // J-3 déjà envoyé → skippé ; J-1 non concerné (diffJours=3 > 1).
    expect(result.count).toBe(0);
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it("n'envoie pas de rappel pour une tâche sans échéance", async () => {
    // Le garde-fou `if (!tache.echeance) continue` protège même si la requête
    // renvoyait une tâche sans échéance.
    mockPrisma.tache.findMany.mockResolvedValue([
      {
        id: "t4",
        tenantId: "tenant1",
        titre: "Tâche sans échéance",
        echeance: null,
        assigneeAId: "u4",
      },
    ]);

    const result = await rappelerEcheancesTaches();

    expect(result.count).toBe(0);
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it("ne fait rien quand aucune tâche n'approche de son échéance", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([]);

    const result = await rappelerEcheancesTaches();

    expect(result.count).toBe(0);
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it("filtre les tâches par fenêtre [maintenant ; J+3] dans la requête", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([]);

    await rappelerEcheancesTaches();

    const where = mockPrisma.tache.findMany.mock.calls[0][0].where;
    expect(where.statut).toEqual({ in: ["A_FAIRE", "EN_COURS"] });
    expect(where.echeance).toBeDefined();
    expect(where.echeance.gte).toBeInstanceOf(Date);
    expect(where.echeance.lte).toBeInstanceOf(Date);
    // La borne supérieure est ~3 jours après maintenant.
    const deltaJours =
      (where.echeance.lte.getTime() - where.echeance.gte.getTime()) /
      (1000 * 60 * 60 * 24);
    expect(Math.round(deltaJours)).toBeGreaterThanOrEqual(2);
  });
});
