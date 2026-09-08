import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    eleve: { findMany: vi.fn() },
    bulletin: { createMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { onPeriodeCloturee } from "./periode-cloturee";

const mockPrisma = prisma as unknown as {
  eleve: { findMany: ReturnType<typeof vi.fn> };
  bulletin: { createMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.eleve.findMany.mockResolvedValue([
    { id: "eleve-1" },
    { id: "eleve-2" },
  ]);
  mockPrisma.bulletin.createMany.mockResolvedValue({ count: 0 });
});

function event(over: Record<string, unknown> = {}) {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "periode.cloturee" as const,
    aggregateType: "Periode",
    aggregateId: "periode-1",
    payload: {
      periodeId: "periode-1",
      anneeId: "annee-1",
      anneeLibelle: "2025-2026",
      statut: "CLOTUREE",
    },
    occurredAt: new Date(),
    ...over,
  };
}

describe("onPeriodeCloturee", () => {
  it("génère un bulletin squelette par élève de l'année", async () => {
    await onPeriodeCloturee(event());

    expect(mockPrisma.bulletin.createMany).toHaveBeenCalledTimes(1);
    const data = mockPrisma.bulletin.createMany.mock.calls[0][0].data as { eleveId: string; periodeId: string }[];
    expect(data.length).toBe(2);
    expect(data[0].eleveId).toBe("eleve-1");
    expect(data[0].periodeId).toBe("periode-1");
    expect(mockPrisma.bulletin.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it("ne crée rien si la période n'est pas CLOTUREE", async () => {
    await onPeriodeCloturee(event({ payload: { statut: "OUVERTE" } }));

    expect(mockPrisma.eleve.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.bulletin.createMany).not.toHaveBeenCalled();
  });
});
