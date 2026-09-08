import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    anneesScolaires: { findFirst: vi.fn() },
    chapitre: { findFirst: vi.fn() },
    competence: { findFirst: vi.fn() },
    planificationChapitre: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    planificationCompetence: {
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

import prisma from "@/lib/prisma";
import { onChapitreCreated } from "./chapitre-created";
import { onCompetenceCreated } from "./competence-created";

const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
  anneesScolaires: { findFirst: ReturnType<typeof vi.fn> };
  chapitre: { findFirst: ReturnType<typeof vi.fn> };
  competence: { findFirst: ReturnType<typeof vi.fn> };
  planificationChapitre: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  planificationCompetence: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
  };
};

function drainedEvent(over: Record<string, unknown> = {}) {
  return {
    id: "ev",
    tenantId: "tenant-ambouli",
    siteId: "site-ambouli",
    eventType: "curriculum.imported" as const,
    aggregateType: "Chapitre",
    aggregateId: "chap-1",
    payload: {},
    occurredAt: new Date(),
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
});

describe("onChapitreCreated", () => {
  it("crée une planification chapitre + compétences", async () => {
    mockPrisma.chapitre.findFirst.mockResolvedValue({
      id: "chap-1",
      ordre: 3,
      competences: [{ id: "comp-1" }, { id: "comp-2" }],
    });
    mockPrisma.planificationChapitre.findFirst.mockResolvedValue(null);

    await onChapitreCreated(
      drainedEvent({
        eventType: "chapitre.created",
        payload: { chapitreId: "chap-1" },
      })
    );

    expect(mockPrisma.planificationChapitre.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.planificationChapitre.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ chapitreId: "chap-1", semaineDebut: 4, semaineFin: 5, heuresPrevues: 4 });
  });

  it("ne recrée pas si une planification existe", async () => {
    mockPrisma.chapitre.findFirst.mockResolvedValue({
      id: "chap-1",
      ordre: 0,
      competences: [{ id: "comp-1" }],
    });
    mockPrisma.planificationChapitre.findFirst.mockResolvedValue({ id: "pc-1" });

    await onChapitreCreated(
      drainedEvent({
        eventType: "chapitre.created",
        payload: { chapitreId: "chap-1" },
      })
    );

    expect(mockPrisma.planificationChapitre.create).not.toHaveBeenCalled();
  });
});

describe("onCompetenceCreated", () => {
  it("crée une PlanificationCompetence si le chapitre est déjà planifié", async () => {
    mockPrisma.planificationChapitre.findFirst.mockResolvedValue({
      semaineDebut: 2,
      semaineFin: 3,
    });
    mockPrisma.planificationCompetence.findFirst.mockResolvedValue(null);

    await onCompetenceCreated(
      drainedEvent({
        eventType: "competence.created",
        payload: { competenceId: "comp-1", chapitreId: "chap-1" },
      })
    );

    expect(mockPrisma.planificationCompetence.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.planificationCompetence.create.mock.calls[0][0].data).toMatchObject({
      competenceId: "comp-1",
      semaineDebut: 2,
      semaineFin: 3,
    });
  });

  it("ne crée rien si le chapitre n'a pas encore de planification", async () => {
    mockPrisma.planificationChapitre.findFirst.mockResolvedValue(null);

    await onCompetenceCreated(
      drainedEvent({
        eventType: "competence.created",
        payload: { competenceId: "comp-1", chapitreId: "chap-1" },
      })
    );

    expect(mockPrisma.planificationCompetence.create).not.toHaveBeenCalled();
  });
});
