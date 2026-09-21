import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/learnos/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/learnos/events")>();
  return { ...actual, publishEvent: vi.fn() };
});

import { publishEvent } from "@/lib/learnos/events";
import { onEleveChangeClasse } from "./eleve-change-classe";

const mockPublish = publishEvent as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

function event(eleveIds: string[] = ["eleve-1", "eleve-2"]) {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "eleve.change.classe" as const,
    aggregateType: "Eleve",
    aggregateId: "eleve-1",
    payload: {
      eleveIds,
      ancienneClasseId: "classe-a",
      ancienneClasseNom: "5ème A",
      nouvelleClasseId: "classe-b",
      nouvelleClasseNom: "5ème B",
      siteId: "site-1",
      dateChangement: "2027-03-15T10:00:00Z",
    },
    occurredAt: new Date(),
  };
}

describe("onEleveChangeClasse", () => {
  it("publie un recalcul de KPI global", async () => {
    await onEleveChangeClasse(event());

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const call = mockPublish.mock.calls[0][0];
    expect(call.eventType).toBe("kpi.recalculer");
    expect(call.tenantId).toBe("tenant-1");
    expect(call.payload.perimetre).toBe("global");
    expect(call.payload.type).toBe("eleve_change_classe");
    expect(call.payload.nouvelleClasseId).toBe("classe-b");
    expect(call.payload.eleveIds).toEqual(["eleve-1", "eleve-2"]);
  });

  it("lève une erreur si le payload est incomplet", async () => {
    const mauvais = event([]);
    await expect(onEleveChangeClasse(mauvais)).rejects.toThrow(/incomplet/);
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
