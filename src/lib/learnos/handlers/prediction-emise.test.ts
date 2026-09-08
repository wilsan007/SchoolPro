import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    competence: { findMany: vi.fn() },
    eleve: { findMany: vi.fn() },
    alerteParent: { createMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { onPredictionEmise } from "./prediction-emise";
import { NiveauAlerteParent } from "@prisma/client";

const mockPrisma = prisma as unknown as {
  competence: { findMany: ReturnType<typeof vi.fn> };
  eleve: { findMany: ReturnType<typeof vi.fn> };
  alerteParent: { createMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.competence.findMany.mockResolvedValue([{ id: "comp-1", libelle: "Résoudre une équation" }]);
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
});

function event() {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "prediction.emise" as const,
    aggregateType: "Chapitre",
    aggregateId: "chap-1",
    payload: {
      chapitreId: "chap-1",
      anneeId: "annee-1",
      predictions: [
        { eleveId: "eleve-1", competenceId: "comp-1", difficultePredite: "CRITIQUE", probaReussite: 0.1 },
        { eleveId: "eleve-1", competenceId: "comp-1", difficultePredite: "MODERE", probaReussite: 0.7 },
      ],
    },
    occurredAt: new Date(),
  };
}

describe("onPredictionEmise", () => {
  it("crée une alerte URGENTe pour les prédictions CRITIQUE/DIFFICILE", async () => {
    await onPredictionEmise(event());

    expect(mockPrisma.alerteParent.createMany).toHaveBeenCalledTimes(1);
    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as { niveau: string; empreinte: string }[];
    expect(data.length).toBe(1);
    expect(data[0].niveau).toBe(NiveauAlerteParent.URGENT);
    expect(data[0].empreinte).toContain("prediction-chap-1-eleve-1-comp-1-parent-1");
  });
});
