import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    anneesScolaires: { findFirst: vi.fn() },
    classe: { findFirst: vi.fn() },
    periode: { findFirst: vi.fn() },
    seancePedagogique: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

import prisma from "@/lib/prisma";
import { onEmploiDuTempsCree } from "./edt-cree";
import { StatutSeance } from "@prisma/client";

const mockPrisma = prisma as unknown as {
  anneesScolaires: { findFirst: ReturnType<typeof vi.fn> };
  classe: { findFirst: ReturnType<typeof vi.fn> };
  periode: { findFirst: ReturnType<typeof vi.fn> };
  seancePedagogique: {
    findMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
    id: "annee-2025-2026",
    dateDebut: new Date("2025-09-01"), // lundi
    dateFin: new Date("2026-06-30"),
  });
  mockPrisma.classe.findFirst.mockResolvedValue({ siteId: "site-1" });
  mockPrisma.periode.findFirst.mockResolvedValue(null);
  mockPrisma.seancePedagogique.findMany.mockResolvedValue([]);
  mockPrisma.seancePedagogique.createMany.mockResolvedValue({ count: 0 });
});

describe("onEmploiDuTempsCree", () => {
  it("génère une séance par semaine pour un créneau lundi", async () => {
    await onEmploiDuTempsCree({
      id: "ev1",
      tenantId: "tenant-1",
      siteId: "site-1",
      eventType: "edt.cree",
      aggregateType: "EmploiTemps",
      aggregateId: "edt-1",
      payload: {
        emploiTempsId: "edt-1",
        classeId: "classe-1",
        matiereId: "matiere-1",
        enseignantId: "enseignant-1",
        jour: "LUNDI",
        heureDebut: "08:00",
        heureFin: "10:00",
        salle: "Salle 1",
        annee: "2025-2026",
        periodeId: null,
      },
      occurredAt: new Date(),
    });

    expect(mockPrisma.seancePedagogique.createMany).toHaveBeenCalledTimes(1);
    const data = mockPrisma.seancePedagogique.createMany.mock.calls[0][0].data as { date: Date; dureePrevue: number; semaine: number; statut: string }[];

    expect(data.length).toBeGreaterThan(30);

    const first = data[0];
    expect(first.date.getFullYear()).toBe(2025);
    expect(first.date.getMonth()).toBe(8); // septembre (0-indexé)
    expect(first.date.getHours()).toBe(8);
    expect(first.date.getMinutes()).toBe(0);
    expect(first.dureePrevue).toBe(120);
    expect(first.semaine).toBe(1);
    expect(first.statut).toBe(StatutSeance.PLANIFIEE);

    const last = data[data.length - 1];
    expect(last.semaine).toBe(data.length);
  });

  it("n'ignore pas les séances existantes", async () => {
    const existingDate = new Date(2025, 8, 1, 8, 0);
    mockPrisma.seancePedagogique.findMany.mockResolvedValue([{ date: existingDate }]);

    await onEmploiDuTempsCree({
      id: "ev1",
      tenantId: "tenant-1",
      siteId: "site-1",
      eventType: "edt.cree",
      aggregateType: "EmploiTemps",
      aggregateId: "edt-1",
      payload: {
        emploiTempsId: "edt-1",
        classeId: "classe-1",
        matiereId: "matiere-1",
        enseignantId: "enseignant-1",
        jour: "LUNDI",
        heureDebut: "08:00",
        heureFin: "10:00",
        salle: "Salle 1",
        annee: "2025-2026",
        periodeId: null,
      },
      occurredAt: new Date(),
    });

    const data = mockPrisma.seancePedagogique.createMany.mock.calls[0][0].data as unknown[];
    expect(data.length).toBeGreaterThan(0);
    const dates = data.map((d) => (d as { date: Date }).date.toISOString());
    expect(dates).not.toContain(existingDate.toISOString());
  });
});
