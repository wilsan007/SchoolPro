import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    note: { findMany: vi.fn() },
    recommandation: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/learnos/events", () => ({
  publishEvent: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { onEvaluationCompleted } from "./evaluation-completed";
import { publishEvent } from "@/lib/learnos/events";

const mockPrisma = prisma as unknown as {
  note: { findMany: ReturnType<typeof vi.fn> };
  recommandation: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.note.findMany.mockResolvedValue([]);
  mockPrisma.recommandation.findFirst.mockResolvedValue(null);
  mockPrisma.recommandation.create.mockResolvedValue({});
});

function event(over: Record<string, unknown> = {}) {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "evaluation.completed" as const,
    aggregateType: "evaluation",
    aggregateId: "eval-1",
    payload: {
      evaluationId: "eval-1",
      classeId: "classe-1",
      matiereId: "matiere-1",
      periodeId: null,
      eleveIds: ["eleve-1", "eleve-2", "eleve-3"],
      nombreNotes: 3,
      dateEvaluation: "2025-09-15T08:00:00.000Z",
      completeeParId: "user-1",
    },
    occurredAt: new Date(),
    ...over,
  };
}

describe("onEvaluationCompleted", () => {
  it("publie un événement kpi.recalculer pour la classe", async () => {
    await onEvaluationCompleted(event());

    expect(publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "kpi.recalculer",
        aggregateType: "evaluation",
        aggregateId: "eval-1",
      })
    );
  });

  it("ne crée pas de recommandation si aucune note en dessous du seuil", async () => {
    mockPrisma.note.findMany.mockResolvedValue([
      { valeur: 15, noteMax: 20 },
      { valeur: 14, noteMax: 20 },
      { valeur: 16, noteMax: 20 },
    ]);

    await onEvaluationCompleted(event());

    expect(mockPrisma.recommandation.create).not.toHaveBeenCalled();
  });

  it("crée une recommandation si ≥ 30% des élèves sont en difficulté", async () => {
    mockPrisma.note.findMany.mockResolvedValue([
      { valeur: 8, noteMax: 20 },
      { valeur: 7, noteMax: 20 },
      { valeur: 15, noteMax: 20 },
    ]);

    await onEvaluationCompleted(event());

    expect(mockPrisma.recommandation.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.recommandation.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "tenant-1",
      regleDeclenchee: "remediation_collective",
    });
  });

  it("lève une erreur si le payload est incomplet", async () => {
    await expect(
      onEvaluationCompleted(event({ payload: { evaluationId: "eval-1" } }))
    ).rejects.toThrow("evaluation.completed incomplet");
  });

  it("ne crée pas de doublon si une recommandation existe déjà", async () => {
    mockPrisma.note.findMany.mockResolvedValue([
      { valeur: 5, noteMax: 20 },
      { valeur: 6, noteMax: 20 },
    ]);
    mockPrisma.recommandation.findFirst.mockResolvedValue({ id: "rec-1" });

    await onEvaluationCompleted(event());

    expect(mockPrisma.recommandation.create).not.toHaveBeenCalled();
  });

  it("ne fait rien si eleveIds est vide", async () => {
    await onEvaluationCompleted(
      event({ payload: { ...event().payload, eleveIds: [] } })
    );

    expect(mockPrisma.note.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.recommandation.create).not.toHaveBeenCalled();
  });
});
