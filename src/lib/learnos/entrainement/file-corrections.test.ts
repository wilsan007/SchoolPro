import { describe, it, expect, vi, beforeEach } from "vitest";

import { chargerFileCorrections, type CorrectionDeLaFile } from "./file-corrections";

vi.mock("@/lib/prisma", () => ({
  default: {
    correctionAssistee: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/annee-scolaire", () => ({
  getAnneeCouranteLibelle: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

const mockPrisma = prisma as unknown as {
  correctionAssistee: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

const tenantId = "t1";
const claims = { tenantId } as any;

const uneCorrection = (over: Record<string, unknown> = {}): CorrectionDeLaFile => ({
  id: "ca-1",
  statut: "A_VALIDER",
  score: 3,
  maxScore: 5,
  confiance: 0.8,
  motifs: [],
  details: [],
  erreurs: [],
  explication: "",
  questionVerification: null,
  reponse: "Ma réponse",
  modele: "provider/model",
  grilleVersion: 1,
  createdAt: new Date("2026-10-14T09:00:00Z"),
  eleve: { id: "ele-1", nom: "Dupont", prenom: "Marie", classe: { nom: "6eA" } },
  question: {
    id: "q-1",
    enonce: "Énoncé",
    bareme: 5,
    grille: { criteres: [] },
    grilleVersion: 1,
    competence: { libelle: "Compétence" },
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAnneeCouranteLibelle).mockResolvedValue(null);
});

describe("chargerFileCorrections", () => {
  it("retourne les corrections en attente dans le périmètre de l'appelant", async () => {
    mockPrisma.correctionAssistee.findMany.mockResolvedValue([uneCorrection()]);

    const res = await chargerFileCorrections(tenantId, claims);

    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("ca-1");
    expect(mockPrisma.correctionAssistee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId }),
        orderBy: [{ statut: "desc" }, { createdAt: "asc" }],
        take: 100,
      })
    );
  });

  it("filtre par statut quand on ne demande pas TOUS", async () => {
    mockPrisma.correctionAssistee.findMany.mockResolvedValue([]);

    await chargerFileCorrections(tenantId, claims, undefined, "A_VALIDER");

    const where = mockPrisma.correctionAssistee.findMany.mock.calls[0]?.[0]?.where as any;
    expect(where.statut).toBe("A_VALIDER");
  });

  it("passe TOUS (A_VALIDER et INCERTAINE) par défaut", async () => {
    mockPrisma.correctionAssistee.findMany.mockResolvedValue([]);

    await chargerFileCorrections(tenantId, claims);

    const where = mockPrisma.correctionAssistee.findMany.mock.calls[0]?.[0]?.where as any;
    expect(where.statut).toEqual({ in: ["A_VALIDER", "INCERTAINE"] });
  });

  it("applique le périmètre classe de l'enseignant restreint", async () => {
    mockPrisma.correctionAssistee.findMany.mockResolvedValue([]);

    await chargerFileCorrections(
      tenantId,
      claims,
      { classeIds: ["c1", "c2"], isRestricted: true }
    );

    const where = mockPrisma.correctionAssistee.findMany.mock.calls[0]?.[0]?.where as any;
    expect(where.eleve.classeId).toEqual({ in: ["c1", "c2"] });
  });
});
