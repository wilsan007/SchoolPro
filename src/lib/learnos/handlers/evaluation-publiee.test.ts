import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    eleve: { findMany: vi.fn() },
    alerteParent: { createMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { onEvaluationPubliee } from "./evaluation-publiee";
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
      parents: [{ parentId: "parent-2" }, { parentId: "parent-3" }],
    },
  ]);
  mockPrisma.alerteParent.createMany.mockResolvedValue({ count: 0 });
});

function event() {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "evaluation.publiee" as const,
    aggregateType: "Evaluation",
    aggregateId: "eval-1",
    payload: {
      evaluationId: "eval-1",
      classeId: "classe-1",
      matiereId: "matiere-1",
      matiereNom: "Mathématiques",
      periodeId: "periode-1",
      intitule: "DS n°1",
      eleveIds: ["eleve-1", "eleve-2"],
    },
    occurredAt: new Date(),
  };
}

describe("onEvaluationPubliee", () => {
  it("crée une alerte par parent d'élève concerné", async () => {
    await onEvaluationPubliee(event());

    expect(mockPrisma.eleve.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["eleve-1", "eleve-2"] } }),
      })
    );

    expect(mockPrisma.alerteParent.createMany).toHaveBeenCalledTimes(1);
    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as {
      parentId: string;
      empreinte: string;
      niveau: string;
      params: { matiereNom: string; intitule: string };
    }[];
    expect(data.length).toBe(3);
    expect(data[0].niveau).toBe(NiveauAlerteParent.INFO);
    expect(data[0].empreinte).toContain("eval-pub-eval-1-eleve-1-parent-1");
    expect(data[0].params).toMatchObject({ matiereNom: "Mathématiques", intitule: "DS n°1" });
    expect(mockPrisma.alerteParent.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });
});
