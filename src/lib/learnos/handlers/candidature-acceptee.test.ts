import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    alerteParent: { createMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { onCandidatureAcceptee } from "./candidature-acceptee";
import { NiveauAlerteParent } from "@prisma/client";

const mockPrisma = prisma as unknown as {
  alerteParent: { createMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.alerteParent.createMany.mockResolvedValue({ count: 0 });
});

function event() {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "candidature.acceptee" as const,
    aggregateType: "Candidature",
    aggregateId: "cand-1",
    payload: {
      candidatureId: "cand-1",
      eleveId: "eleve-1",
      parentId: "parent-1" as string | null,
      siteId: "site-1",
      prenom: "John",
      nom: "Doe",
      matricule: "ECL-2027-0001",
      classeNom: "Terminale A",
    },
    occurredAt: new Date(),
  };
}

describe("onCandidatureAcceptee", () => {
  it("crée une alerte INFO pour le parent", async () => {
    await onCandidatureAcceptee(event());

    expect(mockPrisma.alerteParent.createMany).toHaveBeenCalledTimes(1);
    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as { niveau: string; empreinte: string }[];
    expect(data.length).toBe(1);
    expect(data[0].niveau).toBe(NiveauAlerteParent.INFO);
    expect(data[0].empreinte).toContain("candidature-accept-cand-1-eleve-1-parent-1");
    expect(mockPrisma.alerteParent.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it("ne fait rien si parentId est null", async () => {
    const e = event();
    e.payload.parentId = null;
    await onCandidatureAcceptee(e);
    expect(mockPrisma.alerteParent.createMany).not.toHaveBeenCalled();
  });
});
