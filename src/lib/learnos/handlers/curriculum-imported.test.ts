import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    anneesScolaires: { findFirst: vi.fn() },
    chapitre: {
      findMany: vi.fn(),
    },
    planificationChapitre: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    planificationCompetence: {
      createMany: vi.fn(),
    },
  },
}));

import prisma from "@/lib/prisma";
import { onCurriculumImported } from "./curriculum-imported";

const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
  anneesScolaires: { findFirst: ReturnType<typeof vi.fn> };
  chapitre: { findMany: ReturnType<typeof vi.fn> };
  planificationChapitre: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  planificationCompetence: { createMany: ReturnType<typeof vi.fn> };
};

function event(over: Record<string, unknown> = {}) {
  return {
    id: "ev1",
    tenantId: "tenant-ambouli",
    siteId: "site-ambouli",
    eventType: "curriculum.imported" as const,
    aggregateType: "Matiere",
    aggregateId: "matiere-maths",
    payload: {
      matiereId: "matiere-maths",
      niveau: "6eme",
      chapitresCrees: 1,
      competencesCreees: 1,
    },
    occurredAt: new Date("2026-01-01"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
    id: "annee-2025-2026",
    libelle: "2025-2026",
    isCurrent: true,
  });
  mockPrisma.chapitre.findMany.mockResolvedValue([
    {
      id: "chap-1",
      ordre: 0,
      competences: [{ id: "comp-1" }],
    },
    {
      id: "chap-2",
      ordre: 1,
      competences: [{ id: "comp-2" }, { id: "comp-3" }],
    },
  ]);
  mockPrisma.planificationChapitre.findMany.mockResolvedValue([]);
  mockPrisma.planificationChapitre.create.mockResolvedValue({ id: "pc-1" });
  mockPrisma.planificationCompetence.createMany.mockResolvedValue({ count: 1 });
});

describe("onCurriculumImported", () => {
  it("crée une planification chapitre et compétence par chapitre importé", async () => {
    await onCurriculumImported(event());

    expect(mockPrisma.planificationChapitre.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.planificationCompetence.createMany).toHaveBeenCalledTimes(2);

    const firstCreate = mockPrisma.planificationChapitre.create.mock.calls[0][0].data;
    expect(firstCreate).toMatchObject({
      tenantId: "tenant-ambouli",
      anneeId: "annee-2025-2026",
      chapitreId: "chap-1",
      classeId: null,
      statut: "PREVU",
      heuresPrevues: 2,
    });

    const secondBatch = mockPrisma.planificationCompetence.createMany.mock.calls[1][0].data;
    expect(secondBatch).toHaveLength(2);
    expect(secondBatch[0]).toMatchObject({
      tenantId: "tenant-ambouli",
      anneeId: "annee-2025-2026",
      competenceId: "comp-2",
      classeId: null,
      statut: "PREVU",
    });
  });

  it("ne replanifie pas un chapitre déjà planifié", async () => {
    mockPrisma.planificationChapitre.findMany.mockResolvedValue([
      { chapitreId: "chap-1" },
    ]);

    await onCurriculumImported(event());

    expect(mockPrisma.planificationChapitre.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.planificationChapitre.create.mock.calls[0][0].data.chapitreId).toBe("chap-2");
  });

  it("n'appelle createMany s'il n'y a pas de compétences", async () => {
    mockPrisma.chapitre.findMany.mockResolvedValue([
      { id: "chap-sans-comp", ordre: 2, competences: [] },
    ]);

    await onCurriculumImported(event());

    expect(mockPrisma.planificationChapitre.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.planificationCompetence.createMany).not.toHaveBeenCalled();
  });
});
