import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    eleve: { findMany: vi.fn() },
    alerteParent: { createMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { onDevoirCorrige } from "./devoir-corrige";
import { NiveauAlerteParent } from "@prisma/client";

const mockPrisma = prisma as unknown as {
  eleve: { findMany: ReturnType<typeof vi.fn> };
  alerteParent: { createMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
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

function event() {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "devoir.corrige" as const,
    aggregateType: "Devoir",
    aggregateId: "devoir-1",
    payload: {
      devoirId: "devoir-1",
      classeId: "classe-1",
      matiereId: "matiere-1",
      matiereNom: "Mathématiques",
      titre: "DS n°2",
    },
    occurredAt: new Date(),
  };
}

describe("onDevoirCorrige", () => {
  it("crée une alerte par parent d'élève de la classe", async () => {
    await onDevoirCorrige(event());

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
    expect(data[0].niveau).toBe(NiveauAlerteParent.INFO);
    expect(data[0].empreinte).toContain("devoir-corrige-devoir-1-eleve-1-parent-1");
    expect(mockPrisma.alerteParent.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });
});
