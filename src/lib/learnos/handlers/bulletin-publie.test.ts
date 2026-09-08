import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    bulletin: { findMany: vi.fn() },
    alerteParent: { createMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { onBulletinPublie } from "./bulletin-publie";
import { NiveauAlerteParent } from "@prisma/client";

const mockPrisma = prisma as unknown as {
  bulletin: { findMany: ReturnType<typeof vi.fn> };
  alerteParent: { createMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.bulletin.findMany.mockResolvedValue([
    {
      id: "b1",
      eleve: {
        id: "eleve-1",
        nom: "Doe",
        prenom: "John",
        siteId: "site-1",
        parents: [{ parentId: "parent-1" }, { parentId: "parent-2" }],
      },
    },
    {
      id: "b2",
      eleve: {
        id: "eleve-2",
        nom: "Smith",
        prenom: "Jane",
        siteId: "site-1",
        parents: [{ parentId: "parent-3" }],
      },
    },
  ]);
  mockPrisma.alerteParent.createMany.mockResolvedValue({ count: 0 });
});

function event() {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "bulletin.publie" as const,
    aggregateType: "Periode",
    aggregateId: "periode-1",
    payload: {
      classeId: "classe-1",
      periodeId: "periode-1",
      periodeNom: "Trimestre 1",
      anneeLibelle: "2025-2026",
    },
    occurredAt: new Date(),
  };
}

describe("onBulletinPublie", () => {
  it("crée une alerte par parent d'élève publié", async () => {
    await onBulletinPublie(event());

    expect(mockPrisma.alerteParent.createMany).toHaveBeenCalledTimes(1);
    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as {
      parentId: string;
      empreinte: string;
      niveau: string;
    }[];
    expect(data.length).toBe(3);
    expect(data[0].niveau).toBe(NiveauAlerteParent.INFO);
    expect(data[0].empreinte).toContain("bulletin-pub-eleve-1-parent-1-periode-1");
    expect(mockPrisma.alerteParent.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });
});
