import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    learningEvidence: { deleteMany: vi.fn() },
  },
}));

vi.mock("@/lib/learnos/learning-twin", () => ({
  recalculerProfilsApresPreuve: vi.fn(),
}));

vi.mock("@/lib/learnos/recommendation-engine", () => ({
  recalculerRecommandationsApresProfil: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { onNoteDeleted } from "./note-deleted";
import { recalculerProfilsApresPreuve } from "@/lib/learnos/learning-twin";
import { recalculerRecommandationsApresProfil } from "@/lib/learnos/recommendation-engine";

const mockPrisma = prisma as unknown as {
  learningEvidence: { deleteMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.learningEvidence.deleteMany.mockResolvedValue({ count: 1 });
});

function event(over: Record<string, unknown> = {}) {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "note.deleted" as const,
    aggregateType: "note",
    aggregateId: "note-1",
    payload: {
      noteId: "note-1",
      eleveId: "eleve-1",
      classeId: "classe-1",
      matiereId: "matiere-1",
      valeur: 14,
      noteMax: 20,
      coefficient: 1,
      type: "DEVOIR",
      intitule: "Devoir 1",
      date: "2025-09-15T08:00:00.000Z",
      supprimeParId: "user-1",
    },
    occurredAt: new Date(),
    ...over,
  };
}

describe("onNoteDeleted", () => {
  it("supprime toutes les preuves liées à la note", async () => {
    await onNoteDeleted(event());

    expect(mockPrisma.learningEvidence.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", sourceType: "note", sourceId: "note-1" },
    });
  });

  it("recalcule les profils après suppression", async () => {
    await onNoteDeleted(event());

    expect(recalculerProfilsApresPreuve).toHaveBeenCalledTimes(1);
  });

  it("recalcule les recommandations après profil", async () => {
    await onNoteDeleted(event());

    expect(recalculerRecommandationsApresProfil).toHaveBeenCalledTimes(1);
  });

  it("lève une erreur si le payload est incomplet", async () => {
    await expect(
      onNoteDeleted(event({ payload: { noteId: "note-1" } }))
    ).rejects.toThrow("note.deleted incomplet");
  });

  it("est idempotent : deleteMany ne fait rien si déjà supprimé", async () => {
    mockPrisma.learningEvidence.deleteMany.mockResolvedValueOnce({ count: 0 });

    await onNoteDeleted(event());

    expect(mockPrisma.learningEvidence.deleteMany).toHaveBeenCalledTimes(1);
    expect(recalculerProfilsApresPreuve).toHaveBeenCalledTimes(1);
  });
});
