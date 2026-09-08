import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    devoir: { findFirst: vi.fn() },
    eleve: { findMany: vi.fn() },
    alerteParent: { createMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { onDevoirEnRetard } from "./devoir-enretard";
import { NiveauAlerteParent } from "@prisma/client";

const mockPrisma = prisma as unknown as {
  devoir: { findFirst: ReturnType<typeof vi.fn> };
  eleve: { findMany: ReturnType<typeof vi.fn> };
  alerteParent: { createMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.devoir.findFirst.mockResolvedValue({
    titre: "DS n°3",
    matiere: { nom: "Mathématiques" },
  });
  mockPrisma.eleve.findMany.mockResolvedValue([
    {
      id: "eleve-1",
      nom: "Doe",
      prenom: "John",
      siteId: "site-1",
      parents: [{ parentId: "parent-1" }],
    },
    {
      id: "eleve-2",
      nom: "Smith",
      prenom: "Jane",
      siteId: "site-1",
      parents: [{ parentId: "parent-2" }],
    },
  ]);
  mockPrisma.alerteParent.createMany.mockResolvedValue({ count: 0 });
});

function event(joursRetard: number) {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "devoir.enretard" as const,
    aggregateType: "devoir",
    aggregateId: "devoir-1",
    payload: {
      devoirId: "devoir-1",
      classeId: "classe-1",
      matiereId: "matiere-1",
      joursRetard,
    },
    occurredAt: new Date(),
  };
}

describe("onDevoirEnRetard", () => {
  it("crée une alerte par parent d'élève de la classe", async () => {
    await onDevoirEnRetard(event(2));

    expect(mockPrisma.eleve.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ classeId: "classe-1" }),
      })
    );

    expect(mockPrisma.alerteParent.createMany).toHaveBeenCalledTimes(1);
    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as {
      parentId: string;
      empreinte: string;
      niveau: string;
    }[];
    expect(data.length).toBe(2);
    expect(data[0].empreinte).toContain("devoir-retard-devoir-1-eleve-1-parent-1");
    expect(mockPrisma.alerteParent.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it("utilise ATTENTION pour 1-3 jours de retard", async () => {
    await onDevoirEnRetard(event(2));

    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as {
      niveau: string;
    }[];
    expect(data[0].niveau).toBe(NiveauAlerteParent.ATTENTION);
  });

  it("utilise URGENT pour 4+ jours de retard", async () => {
    await onDevoirEnRetard(event(5));

    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as {
      niveau: string;
    }[];
    expect(data[0].niveau).toBe(NiveauAlerteParent.URGENT);
  });

  it("ne crée rien si le devoir est introuvable", async () => {
    mockPrisma.devoir.findFirst.mockResolvedValue(null);

    await onDevoirEnRetard(event(2));

    expect(mockPrisma.alerteParent.createMany).not.toHaveBeenCalled();
  });

  it("ne crée rien s'il n'y a aucun élève", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([]);

    await onDevoirEnRetard(event(2));

    expect(mockPrisma.alerteParent.createMany).not.toHaveBeenCalled();
  });

  it("est idempotent : l'empreinte est déterministe", async () => {
    await onDevoirEnRetard(event(3));
    const data1 = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as {
      empreinte: string;
    }[];

    vi.clearAllMocks();
    mockPrisma.devoir.findFirst.mockResolvedValue({
      titre: "DS n°3",
      matiere: { nom: "Mathématiques" },
    });
    mockPrisma.eleve.findMany.mockResolvedValue([
      {
        id: "eleve-1",
        nom: "Doe",
        prenom: "John",
        siteId: "site-1",
        parents: [{ parentId: "parent-1" }],
      },
    ]);
    mockPrisma.alerteParent.createMany.mockResolvedValue({ count: 0 });

    await onDevoirEnRetard(event(3));
    const data2 = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as {
      empreinte: string;
    }[];

    expect(data1[0].empreinte).toBe(data2[0].empreinte);
  });
});
