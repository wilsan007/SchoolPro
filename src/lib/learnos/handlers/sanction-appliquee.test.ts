import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    alerteParent: { createMany: vi.fn() },
    sanction: { updateMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { onSanctionAppliquee } from "./sanction-appliquee";
import { NiveauAlerteParent } from "@prisma/client";

const mockPrisma = prisma as unknown as {
  alerteParent: { createMany: ReturnType<typeof vi.fn> };
  sanction: { updateMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.alerteParent.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.sanction.updateMany.mockResolvedValue({ count: 0 });
});

function event(typeSanction: string, parentIds: string[] = ["parent-1", "parent-2"]) {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "sanction.appliquee" as const,
    aggregateType: "Sanction",
    aggregateId: "sanction-1",
    payload: {
      sanctionId: "sanction-1",
      incidentId: "incident-1",
      eleveId: "eleve-1",
      parentIds,
      siteId: "site-1",
      prenom: "John",
      nom: "Doe",
      classeNom: "Terminale A",
      typeSanction,
      gravite: 3,
      description: "Exclusion de 3 jours",
      dateDebut: "2027-03-16T08:00:00Z",
      dateFin: "2027-03-19T18:00:00Z",
    },
    occurredAt: new Date(),
  };
}

describe("onSanctionAppliquee", () => {
  it("crée des alertes URGENT pour une exclusion temporaire", async () => {
    await onSanctionAppliquee(event("EXCLUSION_TEMP"));

    expect(mockPrisma.alerteParent.createMany).toHaveBeenCalledTimes(1);
    const call = mockPrisma.alerteParent.createMany.mock.calls[0][0];
    const data = call.data as { niveau: string; empreinte: string }[];
    expect(data.length).toBe(2);
    expect(data[0].niveau).toBe(NiveauAlerteParent.URGENT);
    expect(data[0].empreinte).toBe("sanction-sanction-1-parent-1");
    expect(call.skipDuplicates).toBe(true);
  });

  it("crée des alertes URGENT pour des travaux d'intérêt général", async () => {
    await onSanctionAppliquee(event("TRAVAUX_INTERET_GENERAL"));

    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as { niveau: string }[];
    expect(data[0].niveau).toBe(NiveauAlerteParent.URGENT);
  });

  it("crée des alertes ATTENTION pour un exclusion de cours", async () => {
    await onSanctionAppliquee(event("EXCLUSION_COURS"));

    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as { niveau: string }[];
    expect(data[0].niveau).toBe(NiveauAlerteParent.ATTENTION);
  });

  it("crée des alertes ATTENTION pour une convocation des parents", async () => {
    await onSanctionAppliquee(event("CONVOCATION_PARENTS"));

    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as { niveau: string }[];
    expect(data[0].niveau).toBe(NiveauAlerteParent.ATTENTION);
  });

  it("marque la sanction comme parent-notifié quand des alertes sont créées", async () => {
    await onSanctionAppliquee(event("EXCLUSION_TEMP"));

    expect(mockPrisma.sanction.updateMany).toHaveBeenCalledWith({
      where: { id: "sanction-1", incident: { tenantId: "tenant-1" } },
      data: { parentNotifie: true },
    });
  });

  it("ne fait rien pour un simple avertissement", async () => {
    await onSanctionAppliquee(event("AVERTISSEMENT"));

    expect(mockPrisma.alerteParent.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.sanction.updateMany).not.toHaveBeenCalled();
  });

  it("ne fait rien pour un blâme", async () => {
    await onSanctionAppliquee(event("BLAME"));

    expect(mockPrisma.alerteParent.createMany).not.toHaveBeenCalled();
  });

  it("ne fait rien sans parents liés", async () => {
    await onSanctionAppliquee(event("EXCLUSION_TEMP", []));

    expect(mockPrisma.alerteParent.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.sanction.updateMany).not.toHaveBeenCalled();
  });
});
