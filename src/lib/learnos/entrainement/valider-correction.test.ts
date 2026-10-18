import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  ErreurValidation,
  validerCorrection,
  type ResultatValidation,
} from "./valider-correction";
import {
  parseGrille,
  scoreDepuisCriteres,
  totalGrille,
} from "./grille-correction";
import { compterEcarts } from "./fiabilite-correcteur";

// --- Mocks ---------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  default: {
    correctionAssistee: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    learningEvidence: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/learnos/learning-twin", () => ({
  recalculerProfil: vi.fn(),
}));
vi.mock("@/lib/learnos/recommendation-engine", () => ({
  recalculerRecommandation: vi.fn(),
}));
vi.mock("@/lib/learnos/plan-engine", () => ({
  synchroniserEtapes: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { recalculerProfil } from "@/lib/learnos/learning-twin";
import { recalculerRecommandation } from "@/lib/learnos/recommendation-engine";
import { synchroniserEtapes } from "@/lib/learnos/plan-engine";

const mockPrisma = prisma as unknown as {
  correctionAssistee: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  learningEvidence: {
    upsert: ReturnType<typeof vi.fn>;
  };
};

const tenantId = "t1";
const claims = { tenantId } as any;
const maintenant = new Date("2026-10-14T10:00:00Z");

const GRILLE_BRUTE = {
  criteres: [
    { id: "c1", libelle: "Problématique claire", points: 2 },
    { id: "c2", libelle: "Plan en trois parties", points: 2 },
    { id: "c3", libelle: "Exemple pertinent", points: 1 },
  ],
};
const GRILLE = parseGrille(GRILLE_BRUTE)!;

const correctionBase = {
  id: "ca-1",
  statut: "A_VALIDER",
  tenantId,
  eleveId: "ele-1",
  siteId: "site-1",
  criteresReussis: ["c1", "c3"],
  question: {
    id: "q-1",
    grille: GRILLE_BRUTE,
    competenceId: "comp-1",
    competence: { chapitre: { matiereId: "mat-1" } },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.learningEvidence.upsert.mockResolvedValue({ id: "ev-1" });
  vi.mocked(recalculerProfil).mockResolvedValue({
    masteryScore: 0,
    confidenceScore: 0,
    masteryStatus: "UNKNOWN",
    evidenceCount: 0,
    lastEvidenceAt: null,
    trend: "indetermine",
  });
  vi.mocked(recalculerRecommandation).mockResolvedValue(null);
  vi.mocked(synchroniserEtapes).mockResolvedValue({ validees: 0, rouvertes: 0 });
});

describe("validerCorrection — règle de score", () => {
  it("recalcule le score depuis les critères retenus par l'enseignant (règle 2)", async () => {
    mockPrisma.correctionAssistee.findFirst.mockResolvedValue(correctionBase);
    mockPrisma.correctionAssistee.update.mockResolvedValue({});

    const retenus = ["c1", "c2"];
    const res = await validerCorrection(tenantId, claims, {
      correctionId: "ca-1",
      criteresValides: retenus,
      valideParId: "prof-1",
    });

    const ids = GRILLE.criteres.map((c) => c.id);
    const proposes = correctionBase.criteresReussis as string[];
    expect(res).toEqual({
      score: scoreDepuisCriteres(GRILLE, retenus),
      maxScore: totalGrille(GRILLE),
      ecarts: compterEcarts(proposes, retenus, ids),
      evidenceId: "ev-1",
    } as ResultatValidation);
    expect(mockPrisma.correctionAssistee.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scoreValide: scoreDepuisCriteres(GRILLE, retenus),
          criteresValides: retenus,
        }),
      })
    );
  });

  it("désactive un critère proposé par le modèle et compte un écart", async () => {
    mockPrisma.correctionAssistee.findFirst.mockResolvedValue(correctionBase);
    mockPrisma.correctionAssistee.update.mockResolvedValue({});

    const retenus = ["c1"];
    const res = await validerCorrection(tenantId, claims, {
      correctionId: "ca-1",
      criteresValides: retenus,
      valideParId: "prof-1",
    });

    const ids = GRILLE.criteres.map((c) => c.id);
    const proposes = correctionBase.criteresReussis as string[];
    expect(res!.score).toBe(scoreDepuisCriteres(GRILLE, retenus));
    expect(res!.ecarts).toBe(compterEcarts(proposes, retenus, ids));
  });

  it("rejette la proposition sans produire de preuve (criteresValides = null)", async () => {
    mockPrisma.correctionAssistee.findFirst.mockResolvedValue(correctionBase);
    mockPrisma.correctionAssistee.update.mockResolvedValue({});

    const res = await validerCorrection(tenantId, claims, {
      correctionId: "ca-1",
      criteresValides: null,
      valideParId: "prof-1",
    });

    expect(res).toBeNull();
    expect(mockPrisma.correctionAssistee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statut: "REJETEE" }),
      })
    );
    expect(mockPrisma.learningEvidence.upsert).not.toHaveBeenCalled();
  });
});

describe("validerCorrection — erreurs métier", () => {
  it("introuvable si la correction n'existe pas", async () => {
    mockPrisma.correctionAssistee.findFirst.mockResolvedValue(null);

    await expect(
      validerCorrection(tenantId, claims, {
        correctionId: "ca-inconnu",
        criteresValides: ["c1"],
        valideParId: "prof-1",
      })
    ).rejects.toMatchObject(
      new ErreurValidation("Correction introuvable.", "introuvable")
    );
  });

  it("deja_traitee si déjà validée", async () => {
    mockPrisma.correctionAssistee.findFirst.mockResolvedValue({
      ...correctionBase,
      statut: "VALIDEE",
    });

    await expect(
      validerCorrection(tenantId, claims, {
        correctionId: "ca-1",
        criteresValides: ["c1"],
        valideParId: "prof-1",
      })
    ).rejects.toMatchObject(
      new ErreurValidation("Correction déjà traitée.", "deja_traitee")
    );
  });

  it("deja_traitee si déjà rejetée", async () => {
    mockPrisma.correctionAssistee.findFirst.mockResolvedValue({
      ...correctionBase,
      statut: "REJETEE",
    });

    await expect(
      validerCorrection(tenantId, claims, {
        correctionId: "ca-1",
        criteresValides: null,
        valideParId: "prof-1",
      })
    ).rejects.toMatchObject(
      new ErreurValidation("Correction déjà traitée.", "deja_traitee")
    );
  });

  it("critere_inconnu si l'enseignant coche un critère absent de la grille", async () => {
    mockPrisma.correctionAssistee.findFirst.mockResolvedValue(correctionBase);

    await expect(
      validerCorrection(tenantId, claims, {
        correctionId: "ca-1",
        criteresValides: ["c1", "inventé"],
        valideParId: "prof-1",
      })
    ).rejects.toMatchObject(
      new ErreurValidation("Critère inconnu de la grille.", "critere_inconnu")
    );
  });

  it("grille_perdue si la grille de la question a disparu", async () => {
    mockPrisma.correctionAssistee.findFirst.mockResolvedValue({
      ...correctionBase,
      question: { ...correctionBase.question, grille: {} },
    });

    await expect(
      validerCorrection(tenantId, claims, {
        correctionId: "ca-1",
        criteresValides: ["c1"],
        valideParId: "prof-1",
      })
    ).rejects.toMatchObject(
      new ErreurValidation("La grille de la question a disparu.", "grille_perdue")
    );
  });
});

describe("validerCorrection — effets de bord", () => {
  it("appelle les moteurs de profil, recommandation et étapes après une preuve", async () => {
    mockPrisma.correctionAssistee.findFirst.mockResolvedValue(correctionBase);
    mockPrisma.correctionAssistee.update.mockResolvedValue({});

    await validerCorrection(
      tenantId,
      claims,
      {
        correctionId: "ca-1",
        criteresValides: ["c1", "c3"],
        valideParId: "prof-1",
      },
      maintenant
    );

    expect(recalculerProfil).toHaveBeenCalledWith(
      tenantId,
      "ele-1",
      "comp-1",
      maintenant
    );
    expect(recalculerRecommandation).toHaveBeenCalledWith(
      tenantId,
      "ele-1",
      "comp-1",
      maintenant
    );
    expect(synchroniserEtapes).toHaveBeenCalledWith(
      tenantId,
      "ele-1",
      "comp-1",
      maintenant
    );
  });

  it("passe la date fournie (déterminisme) plutôt qu'Date.now()", async () => {
    mockPrisma.correctionAssistee.findFirst.mockResolvedValue(correctionBase);
    mockPrisma.correctionAssistee.update.mockResolvedValue({});

    await validerCorrection(
      tenantId,
      claims,
      { correctionId: "ca-1", criteresValides: ["c1"], valideParId: "prof-1" },
      maintenant
    );

    const update = mockPrisma.correctionAssistee.update.mock.calls[0]?.[0] as any;
    expect(update.data.valideeLe).toBe(maintenant);
  });
});

