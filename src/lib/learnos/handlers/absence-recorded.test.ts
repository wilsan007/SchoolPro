import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    anneesScolaires: { findFirst: vi.fn() },
    eleve: { findFirst: vi.fn() },
    absence: { count: vi.fn() },
    alerteParent: { createMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { onAbsenceRecorded } from "./absence-recorded";
import { NiveauAlerteParent } from "@prisma/client";

const mockPrisma = prisma as unknown as {
  anneesScolaires: { findFirst: ReturnType<typeof vi.fn> };
  eleve: { findFirst: ReturnType<typeof vi.fn> };
  absence: { count: ReturnType<typeof vi.fn> };
  alerteParent: { createMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
    id: "annee-2025-2026",
    dateDebut: new Date("2025-09-01"),
    dateFin: new Date("2026-06-30"),
  });
  mockPrisma.eleve.findFirst.mockResolvedValue({
    id: "eleve-1",
    siteId: "site-1",
    parents: [{ parentId: "parent-1" }, { parentId: "parent-2" }],
  });
  mockPrisma.absence.count.mockResolvedValue(3);
  mockPrisma.alerteParent.createMany.mockResolvedValue({ count: 0 });
});

function event(over: Record<string, unknown> = {}) {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "absence.recorded" as const,
    aggregateType: "Absence",
    aggregateId: "abs-1",
    payload: {
      absenceId: "abs-1",
      eleveId: "eleve-1",
      classeId: "classe-1",
      date: "2025-09-15T08:00:00.000Z",
      isRetard: false,
      motif: "INJUSTIFIE",
    },
    occurredAt: new Date(),
    ...over,
  };
}

describe("onAbsenceRecorded", () => {
  it("crée une alerte par parent quand le seuil est atteint", async () => {
    await onAbsenceRecorded(event());

    expect(mockPrisma.alerteParent.createMany).toHaveBeenCalledTimes(1);
    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as unknown[];
    expect(data.length).toBe(2);
    expect(data[0]).toMatchObject({
      tenantId: "tenant-1",
      eleveId: "eleve-1",
      parentId: "parent-1",
      niveau: NiveauAlerteParent.ATTENTION,
      cle: "learnos.alertes.absence.frequence",
      empreinte: expect.stringContaining("absence-freq-eleve-1-parent-1"),
    });
    expect(mockPrisma.alerteParent.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it("passe en URGENT à partir de 5 absences", async () => {
    mockPrisma.absence.count.mockResolvedValue(5);

    await onAbsenceRecorded(event());

    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as { niveau: string }[];
    expect(data[0].niveau).toBe(NiveauAlerteParent.URGENT);
  });

  it("ne crée rien en dessous du seuil", async () => {
    mockPrisma.absence.count.mockResolvedValue(1);

    await onAbsenceRecorded(event());

    expect(mockPrisma.alerteParent.createMany).not.toHaveBeenCalled();
  });

  it("ignore les retards", async () => {
    await onAbsenceRecorded(event({ payload: { isRetard: true } }));

    expect(mockPrisma.absence.count).not.toHaveBeenCalled();
    expect(mockPrisma.alerteParent.createMany).not.toHaveBeenCalled();
  });

  it("ignore les absences non injustifiées", async () => {
    await onAbsenceRecorded(event({ payload: { motif: "MALADIE" } }));

    expect(mockPrisma.absence.count).not.toHaveBeenCalled();
    expect(mockPrisma.alerteParent.createMany).not.toHaveBeenCalled();
  });
});
