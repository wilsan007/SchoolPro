import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    kpiSnapshot: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { onKpiRecalculer } from "./kpi-recalculer";

const mockPrisma = prisma as unknown as {
  kpiSnapshot: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.kpiSnapshot.findFirst.mockResolvedValue(null);
  mockPrisma.kpiSnapshot.update.mockResolvedValue({});
  mockPrisma.kpiSnapshot.create.mockResolvedValue({});
});

function event() {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "kpi.recalculer" as const,
    aggregateType: "Tenant",
    aggregateId: "tenant-1",
    payload: {
      perimetre: "complet",
      patternsCrees: 2,
      patternsMisAJour: 3,
      echantillonTotal: 120,
      correlationsCrees: 1,
    },
    occurredAt: new Date(),
  };
}

describe("onKpiRecalculer", () => {
  it("crée 5 snapshots de KPI", async () => {
    await onKpiRecalculer(event());

    expect(mockPrisma.kpiSnapshot.create).toHaveBeenCalledTimes(5);
    const calls = mockPrisma.kpiSnapshot.create.mock.calls.map((c) => c[0].data.kpiKey);
    expect(calls).toEqual([
      "learnos.kpi.patterns.total",
      "learnos.kpi.patterns.crees",
      "learnos.kpi.patterns.misajour",
      "learnos.kpi.correlations",
      "learnos.kpi.echantillon",
    ]);
    const totalCall = mockPrisma.kpiSnapshot.create.mock.calls.find((c) => c[0].data.kpiKey === "learnos.kpi.patterns.total");
    expect(totalCall?.[0].data.valeur).toBe(5);
  });

  it("met a jour un snapshot existant", async () => {
    mockPrisma.kpiSnapshot.findFirst.mockResolvedValue({ id: "kpi-1" });

    await onKpiRecalculer(event());

    expect(mockPrisma.kpiSnapshot.update).toHaveBeenCalledTimes(5);
    expect(mockPrisma.kpiSnapshot.create).not.toHaveBeenCalled();
  });
});
