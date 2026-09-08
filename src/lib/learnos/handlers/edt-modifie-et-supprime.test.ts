import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    anneesScolaires: { findFirst: vi.fn() },
    classe: { findFirst: vi.fn() },
    periode: { findFirst: vi.fn() },
    seancePedagogique: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import prisma from "@/lib/prisma";
import { onEmploiDuTempsModifie } from "./edt-modifie";
import { onEmploiDuTempsSupprime } from "./edt-supprime";

const mockPrisma = prisma as unknown as {
  anneesScolaires: { findFirst: ReturnType<typeof vi.fn> };
  classe: { findFirst: ReturnType<typeof vi.fn> };
  periode: { findFirst: ReturnType<typeof vi.fn> };
  seancePedagogique: {
    findMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
    id: "annee-2025-2026",
    dateDebut: new Date("2025-09-01"),
    dateFin: new Date("2026-06-30"),
  });
  mockPrisma.classe.findFirst.mockResolvedValue({ siteId: "site-1" });
  mockPrisma.periode.findFirst.mockResolvedValue(null);
  mockPrisma.seancePedagogique.findMany.mockResolvedValue([]);
  mockPrisma.seancePedagogique.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.seancePedagogique.deleteMany.mockResolvedValue({ count: 0 });
});

function payloadBase() {
  return {
    emploiTempsId: "edt-1",
    classeId: "classe-1",
    matiereId: "matiere-1",
    enseignantId: "enseignant-1",
    jour: "LUNDI" as const,
    heureDebut: "08:00",
    heureFin: "10:00",
    salle: "Salle 1",
    annee: "2025-2026",
    periodeId: null,
  };
}

describe("onEmploiDuTempsSupprime", () => {
  it("supprime les seances PLANIFIEE liees au creneau", async () => {
    await onEmploiDuTempsSupprime({
      id: "ev1",
      tenantId: "tenant-1",
      siteId: "site-1",
      eventType: "edt.supprime",
      aggregateType: "EmploiTemps",
      aggregateId: "edt-1",
      payload: payloadBase(),
      occurredAt: new Date(),
    });

    expect(mockPrisma.seancePedagogique.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.seancePedagogique.deleteMany.mock.calls[0][0].where.emploiTempsId).toBe("edt-1");
    expect(mockPrisma.seancePedagogique.deleteMany.mock.calls[0][0].where.statut).toBe("PLANIFIEE");
  });
});

describe("onEmploiDuTempsModifie", () => {
  it("supprime les seances PLANIFIEE puis les regenere", async () => {
    await onEmploiDuTempsModifie({
      id: "ev1",
      tenantId: "tenant-1",
      siteId: "site-1",
      eventType: "edt.modifie",
      aggregateType: "EmploiTemps",
      aggregateId: "edt-1",
      payload: payloadBase(),
      occurredAt: new Date(),
    });

    expect(mockPrisma.seancePedagogique.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.seancePedagogique.deleteMany.mock.calls[0][0].where.emploiTempsId).toBe("edt-1");
    expect(mockPrisma.seancePedagogique.createMany).toHaveBeenCalledTimes(1);
  });
});
