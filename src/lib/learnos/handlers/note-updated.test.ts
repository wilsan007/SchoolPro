import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    learningEvidence: { upsert: vi.fn(), deleteMany: vi.fn() },
    evaluationCompetence: { findMany: vi.fn() },
    eleve: { findFirst: vi.fn() },
    alerteParent: { createMany: vi.fn() },
  },
}));

vi.mock("@/lib/learnos/evidence-engine", () => ({
  ingererNoteCommePreuve: vi.fn(),
  evidenceTypeFromNote: vi.fn(() => "DEVOIR"),
  calculerSignal: vi.fn(() => ({
    masterySignal: 0.5,
    confidence: 0.75,
    weight: 1,
  })),
  evidenceId: vi.fn(() => "evidence-id-1"),
}));

vi.mock("@/lib/learnos/learning-twin", () => ({
  recalculerProfilsApresPreuve: vi.fn(),
}));

vi.mock("@/lib/learnos/recommendation-engine", () => ({
  recalculerRecommandationsApresProfil: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { onNoteUpdated } from "./note-updated";
import { ingererNoteCommePreuve } from "@/lib/learnos/evidence-engine";
import { recalculerProfilsApresPreuve } from "@/lib/learnos/learning-twin";
import { recalculerRecommandationsApresProfil } from "@/lib/learnos/recommendation-engine";

const mockPrisma = prisma as unknown as {
  learningEvidence: { deleteMany: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
  evaluationCompetence: { findMany: ReturnType<typeof vi.fn> };
  eleve: { findFirst: ReturnType<typeof vi.fn> };
  alerteParent: { createMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.learningEvidence.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.evaluationCompetence.findMany.mockResolvedValue([]);
  mockPrisma.learningEvidence.upsert.mockResolvedValue({});
  mockPrisma.eleve.findFirst.mockResolvedValue(null);
  mockPrisma.alerteParent.createMany.mockResolvedValue({ count: 0 });
});

function event(over: Record<string, unknown> = {}) {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "note.updated" as const,
    aggregateType: "note",
    aggregateId: "note-1",
    payload: {
      noteId: "note-1",
      eleveId: "eleve-1",
      classeId: "classe-1",
      matiereId: "matiere-1",
      periodeId: null,
      evaluationId: "eval-1",
      valeurAncienne: 15,
      noteMaxAncienne: 20,
      valeur: 12,
      noteMax: 20,
      coefficient: 1,
      type: "DEVOIR",
      intitule: "Devoir 1",
      date: "2025-09-15T08:00:00.000Z",
      modifieeParId: "user-1",
    },
    occurredAt: new Date(),
    ...over,
  };
}

describe("onNoteUpdated", () => {
  it("supprime l'ancienne preuve puis réingère la note", async () => {
    await onNoteUpdated(event());

    expect(mockPrisma.learningEvidence.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", sourceType: "note", sourceId: "note-1" },
    });
    expect(ingererNoteCommePreuve).toHaveBeenCalledTimes(1);
  });

  it("recalcule les profils après réingestion", async () => {
    await onNoteUpdated(event());

    expect(recalculerProfilsApresPreuve).toHaveBeenCalledTimes(1);
  });

  it("recalcule les recommandations après profil", async () => {
    await onNoteUpdated(event());

    expect(recalculerRecommandationsApresProfil).toHaveBeenCalledTimes(1);
  });

  it("lève une erreur si le payload est incomplet", async () => {
    await expect(
      onNoteUpdated(event({ payload: { noteId: "note-1" } }))
    ).rejects.toThrow("note.updated incomplet");
  });

  it("crée une alerte parent si la baisse est ≥ 4 points sur 20", async () => {
    mockPrisma.eleve.findFirst.mockResolvedValue({
      id: "eleve-1",
      siteId: "site-1",
      prenom: "Ahmed",
      nom: "Ali",
      parents: [{ parentId: "parent-1" }],
    });

    await onNoteUpdated(
      event({
        payload: {
          noteId: "note-1",
          eleveId: "eleve-1",
          classeId: "classe-1",
          matiereId: "matiere-1",
          periodeId: null,
          evaluationId: "eval-1",
          valeurAncienne: 16,
          noteMaxAncienne: 20,
          valeur: 10,
          noteMax: 20,
          coefficient: 1,
          type: "DEVOIR",
          intitule: "Devoir 1",
          date: "2025-09-15T08:00:00.000Z",
          modifieeParId: "user-1",
        },
      })
    );

    expect(mockPrisma.alerteParent.createMany).toHaveBeenCalledTimes(1);
    const data = mockPrisma.alerteParent.createMany.mock.calls[0][0].data as unknown[];
    expect(data.length).toBe(1);
    expect(data[0]).toMatchObject({
      tenantId: "tenant-1",
      eleveId: "eleve-1",
      parentId: "parent-1",
      cle: "note.baisse",
    });
  });

  it("ne crée pas d'alerte si la baisse est faible", async () => {
    await onNoteUpdated(
      event({
        payload: {
          noteId: "note-1",
          eleveId: "eleve-1",
          classeId: "classe-1",
          matiereId: "matiere-1",
          periodeId: null,
          evaluationId: "eval-1",
          valeurAncienne: 13,
          noteMaxAncienne: 20,
          valeur: 12,
          noteMax: 20,
          coefficient: 1,
          type: "DEVOIR",
          intitule: "Devoir 1",
          date: "2025-09-15T08:00:00.000Z",
          modifieeParId: "user-1",
        },
      })
    );

    expect(mockPrisma.alerteParent.createMany).not.toHaveBeenCalled();
  });

  it("est idempotent : un second appel produit la même séquence", async () => {
    await onNoteUpdated(event());
    await onNoteUpdated(event());

    expect(mockPrisma.learningEvidence.deleteMany).toHaveBeenCalledTimes(2);
    expect(ingererNoteCommePreuve).toHaveBeenCalledTimes(2);
    expect(recalculerProfilsApresPreuve).toHaveBeenCalledTimes(2);
    expect(recalculerRecommandationsApresProfil).toHaveBeenCalledTimes(2);
  });
});
