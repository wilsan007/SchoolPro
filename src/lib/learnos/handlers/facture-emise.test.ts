import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    facture: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/echeancier", () => ({
  getEcheancierPourFacture: vi.fn(),
  creerEcheancier: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { getEcheancierPourFacture, creerEcheancier } from "@/lib/echeancier";
import { onFactureEmise } from "./facture-emise";

const mockPrisma = prisma as unknown as {
  facture: { findFirst: ReturnType<typeof vi.fn> };
};

const mockGetEcheancier = getEcheancierPourFacture as ReturnType<typeof vi.fn>;
const mockCreerEcheancier = creerEcheancier as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.facture.findFirst.mockResolvedValue({
    id: "facture-1",
    echeance: new Date("2026-01-15"),
  });
  mockGetEcheancier.mockResolvedValue(null);
  mockCreerEcheancier.mockResolvedValue({ id: "echeancier-1" });
});

function event(over: Record<string, unknown> = {}) {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "facture.emise" as const,
    aggregateType: "Facture",
    aggregateId: "facture-1",
    payload: {
      factureId: "facture-1",
      eleveId: "eleve-1",
      montant: 1000,
      devise: "DJF",
      echeance: "2026-01-15T00:00:00.000Z",
    },
    occurredAt: new Date(),
    ...over,
  };
}

describe("onFactureEmise", () => {
  it("crée un échéancier par défaut si aucun n'existe", async () => {
    await onFactureEmise(event());

    expect(mockGetEcheancier).toHaveBeenCalledWith("facture-1");
    expect(mockCreerEcheancier).toHaveBeenCalledTimes(1);
    const [factureId, nb, date, intervalle] = mockCreerEcheancier.mock.calls[0];
    expect(factureId).toBe("facture-1");
    expect(nb).toBe(1);
    expect(date).toEqual(new Date("2026-01-15"));
    expect(intervalle).toBe(0);
  });

  it("ne recrée pas d'échéancier s'il en existe déjà", async () => {
    mockGetEcheancier.mockResolvedValue({ id: "echeancier-existant" });

    await onFactureEmise(event());

    expect(mockCreerEcheancier).not.toHaveBeenCalled();
  });

  it("utilise la date par défaut 30 jours si pas d'échéance", async () => {
    mockPrisma.facture.findFirst.mockResolvedValue({
      id: "facture-1",
      echeance: null,
    });

    await onFactureEmise(event());

    const [, , date] = mockCreerEcheancier.mock.calls[0];
    const dans30Jours = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    expect(Math.abs(date.getTime() - dans30Jours.getTime())).toBeLessThan(1000);
  });
});
