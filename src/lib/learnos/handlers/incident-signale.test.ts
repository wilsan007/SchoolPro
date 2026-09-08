import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    alerteParent: { createMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { onIncidentSignale } from "./incident-signale";
import { NiveauAlerteParent } from "@prisma/client";

const mockPrisma = prisma as unknown as {
  alerteParent: { createMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.alerteParent.createMany.mockResolvedValue({ count: 0 });
});

function event(gravite: number) {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "incident.signale" as const,
    aggregateType: "Incident",
    aggregateId: "incident-1",
    payload: {
      incidentId: "incident-1",
      eleveId: "eleve-1",
      parentIds: ["parent-1", "parent-2"],
      siteId: "site-1",
      prenom: "John",
      nom: "Doe",
      classeNom: "Terminale A",
      type: "BAGARRE",
      gravite,
      description: "Incident grave",
      date: "2027-03-15T10:00:00Z",
    },
    occurredAt: new Date(),
  };
}

describe("onIncidentSignale", () => {
  it("crée des alertes ATTENTION pour gravite 2", async () => {
    await onIncidentSignale(event(2));

    expect(mockPrisma.alerteParent.createMany).toHaveBeenCalledTimes(1);
    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as { niveau: string }[];
    expect(data.length).toBe(2);
    expect(data[0].niveau).toBe(NiveauAlerteParent.ATTENTION);
    expect(mockPrisma.alerteParent.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it("crée des alertes URGENT pour gravite 3", async () => {
    await onIncidentSignale(event(3));

    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as { niveau: string }[];
    expect(data[0].niveau).toBe(NiveauAlerteParent.URGENT);
  });

  it("ne fait rien si gravite 1", async () => {
    await onIncidentSignale(event(1));
    expect(mockPrisma.alerteParent.createMany).not.toHaveBeenCalled();
  });
});
