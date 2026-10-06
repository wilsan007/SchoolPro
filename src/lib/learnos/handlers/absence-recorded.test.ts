import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    // `annee-scolaire` lit désormais la liste des années (`findMany`) et la
    // filtre en mémoire : la liste simulée découle de l'année posée par
    // `findFirst`, pour que chaque cas continue de ne décrire qu'UNE année.
    anneesScolaires: (() => {
      const findFirst = vi.fn();
      const findMany = vi.fn(async (...args: unknown[]) => {
        const annee = await (findFirst as (...a: unknown[]) => Promise<unknown>)(...args);
        return annee ? [annee] : [];
      });
      return { findFirst, findMany };
    })(),
    eleve: { findFirst: vi.fn() },
    absence: { groupBy: vi.fn() },
    alerteParent: { createMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { onAbsenceRecorded } from "./absence-recorded";
import { NiveauAlerteParent } from "@prisma/client";

const mockPrisma = prisma as unknown as {
  anneesScolaires: { findFirst: ReturnType<typeof vi.fn> };
  eleve: { findFirst: ReturnType<typeof vi.fn> };
  absence: { groupBy: ReturnType<typeof vi.fn> };
  alerteParent: { createMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
    id: "annee-2025-2026",
    dateDebut: new Date("2025-09-01"),
    dateFin: new Date("2026-06-30"),
  });
  mockPrisma.eleve.findFirst.mockResolvedValue({
    id: "eleve-1",
    siteId: "site-1",
    parents: [{ parentId: "parent-1" }, { parentId: "parent-2" }],
  });
  mockPrisma.absence.groupBy.mockResolvedValue(comptage(3, 0));
  mockPrisma.alerteParent.createMany.mockResolvedValue({ count: 0 });
});

/** Réponse de `groupBy({ by: ["isRetard"] })` pour un élève donné. */
function comptage(absences: number, retards: number) {
  return [
    { isRetard: false, _count: { _all: absences } },
    { isRetard: true, _count: { _all: retards } },
  ];
}

function event(over: Record<string, unknown> = {}) {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "absence.recorded" as const,
    aggregateType: "Absence",
    aggregateId: "abs-1",
    payload: {
      absenceId: "abs-1",
      eleveId: "eleve-1",
      classeId: "classe-1",
      date: "2025-09-15T08:00:00.000Z",
      isRetard: false,
      motif: "INJUSTIFIE",
    },
    occurredAt: new Date(),
    ...over,
  };
}

/**
 * Même événement, mais pour un retard. `event({ payload: … })` REMPLACE le
 * payload entier — un payload partiel perdait `motif`, et le handler sortait
 * sur ce motif manquant plutôt que sur la règle testée.
 */
function eventRetard() {
  return event({
    payload: {
      absenceId: "abs-1",
      eleveId: "eleve-1",
      classeId: "classe-1",
      date: "2025-09-15T08:00:00.000Z",
      isRetard: true,
      motif: "INJUSTIFIE",
    },
  });
}

describe("onAbsenceRecorded", () => {
  it("crée une alerte par parent quand le seuil est atteint", async () => {
    await onAbsenceRecorded(event());

    expect(mockPrisma.alerteParent.createMany).toHaveBeenCalledTimes(1);
    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as unknown[];
    expect(data.length).toBe(2);
    expect(data[0]).toMatchObject({
      tenantId: "tenant-1",
      eleveId: "eleve-1",
      parentId: "parent-1",
      niveau: NiveauAlerteParent.ATTENTION,
      cle: "absence.frequence",
      empreinte: expect.stringContaining("absence-freq-eleve-1-parent-1"),
    });
    expect(mockPrisma.alerteParent.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it("passe en URGENT à partir de 5 absences", async () => {
    mockPrisma.absence.groupBy.mockResolvedValue(comptage(5, 0));

    await onAbsenceRecorded(event());

    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as { niveau: string }[];
    expect(data[0].niveau).toBe(NiveauAlerteParent.URGENT);
  });

  it("ne crée rien en dessous du seuil", async () => {
    mockPrisma.absence.groupBy.mockResolvedValue(comptage(1, 0));

    await onAbsenceRecorded(event());

    expect(mockPrisma.alerteParent.createMany).not.toHaveBeenCalled();
  });

  it("compte les retards pour un tiers d'absence", async () => {
    // Deux absences et trois retards = trois absences équivalentes : le seuil
    // d'attention est atteint, alors que deux absences seules ne suffisaient pas.
    mockPrisma.absence.groupBy.mockResolvedValue(comptage(2, 3));

    await onAbsenceRecorded(eventRetard());

    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as { niveau: string; params: Record<string, number> }[];
    expect(data[0].niveau).toBe(NiveauAlerteParent.ATTENTION);
    expect(data[0].params).toMatchObject({ count: 2, retards: 3 });
  });

  it("n'alerte pas sur un retard isolé", async () => {
    mockPrisma.absence.groupBy.mockResolvedValue(comptage(0, 2));

    await onAbsenceRecorded(eventRetard());

    expect(mockPrisma.alerteParent.createMany).not.toHaveBeenCalled();
  });

  it("ignore les absences non injustifiées", async () => {
    await onAbsenceRecorded(event({ payload: { motif: "MALADIE" } }));

    expect(mockPrisma.absence.groupBy).not.toHaveBeenCalled();
    expect(mockPrisma.alerteParent.createMany).not.toHaveBeenCalled();
  });
});
