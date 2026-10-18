import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  ErreurCorrection,
  soumettreCorrection,
} from "./soumettre-correction";
import { parseGrille, scoreDepuisCriteres, totalGrille } from "./grille-correction";
import type { AiResult } from "@/lib/ai/provider";

// --- Mocks ---------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  default: {
    question: { findFirst: vi.fn() },
    eleve: { findFirst: vi.fn() },
    correctionAssistee: { create: vi.fn() },
  },
}));

vi.mock("@/lib/ai/router", () => ({
  routeAi: vi.fn(),
}));

vi.mock("./budget-ia", () => ({
  ACTION_CORRECTION: "correction.assistee",
  budgetDuJour: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { routeAi } from "@/lib/ai/router";
import { budgetDuJour } from "./budget-ia";

const mockPrisma = prisma as unknown as {
  question: { findFirst: ReturnType<typeof vi.fn> };
  eleve: { findFirst: ReturnType<typeof vi.fn> };
  correctionAssistee: { create: ReturnType<typeof vi.fn> };
};

const tenantId = "t1";
const claims = { tenantId } as any;
const actorId = "prof-1";

const GRILLE_BRUTE = {
  criteres: [
    { id: "c1", libelle: "Problématique claire", points: 2 },
    { id: "c2", libelle: "Plan en trois parties", points: 2 },
    { id: "c3", libelle: "Exemple pertinent", points: 1 },
  ],
};
const GRILLE = parseGrille(GRILLE_BRUTE)!;

const questionValide = {
  id: "q-1",
  enonce: "Énoncé",
  grille: GRILLE_BRUTE,
  grilleVersion: 1,
  siteId: "site-1",
  actif: true,
};

const eleveValide = { id: "ele-1", tenantId, siteId: "site-1" };

const propositionValide = JSON.stringify({
  criteres: [
    { id: "c1", reussi: true, justification: "ok", confiance: 0.9 },
    { id: "c2", reussi: false, justification: "deux parties", confiance: 0.9 },
    { id: "c3", reussi: true, justification: "ok", confiance: 0.9 },
  ],
  confianceGlobale: 0.9,
});

/**
 * Réponse IA complète : `AiResult` exige l'identité de l'appel d'outil et la
 * traçabilité du modèle (LEARNOS §37/§40). Un mock partiel ne compile pas — et
 * ne doit pas : c'est le contrat que le routeur doit honorer.
 */
function resultatIa(partiel: Partial<AiResult>): AiResult {
  return {
    content: null,
    toolCalls: [],
    meta: {
      providerName: "provider",
      modelName: "model",
      modelVersion: "v1",
      promptVersion: "correction-assistee-v1",
      latencyMs: 12,
      tokensIn: 100,
      tokensOut: 50,
      cached: false,
    },
    ...partiel,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(budgetDuJour).mockResolvedValue({ utilise: 0, plafond: 200, restant: 200, epuise: false } as any);
  vi.mocked(routeAi).mockResolvedValue(
    resultatIa({
      toolCalls: [{ id: "call-1", name: "proposer_correction", arguments: propositionValide }],
    })
  );
  mockPrisma.question.findFirst.mockResolvedValue(questionValide);
  mockPrisma.eleve.findFirst.mockResolvedValue(eleveValide);
  mockPrisma.correctionAssistee.create.mockResolvedValue({ id: "ca-1" });
});

describe("soumettreCorrection — cas d'erreur (métier → HTTP)", () => {
  it("reponse_vide → 400", async () => {
    await expect(
      soumettreCorrection(tenantId, claims, { eleveId: "ele-1", questionId: "q-1", reponse: "" }, actorId)
    ).rejects.toMatchObject(new ErreurCorrection("Production vide.", "reponse_vide"));
  });

  it("question_introuvable → 404", async () => {
    mockPrisma.question.findFirst.mockResolvedValue(null);
    await expect(
      soumettreCorrection(tenantId, claims, { eleveId: "ele-1", questionId: "q-x", reponse: "réponse" }, actorId)
    ).rejects.toMatchObject(new ErreurCorrection("Question introuvable.", "question_introuvable"));
  });

  it("sans_grille → 422", async () => {
    mockPrisma.question.findFirst.mockResolvedValue({ ...questionValide, grille: null });
    await expect(
      soumettreCorrection(tenantId, claims, { eleveId: "ele-1", questionId: "q-1", reponse: "réponse" }, actorId)
    ).rejects.toMatchObject(new ErreurCorrection("Cette question n'a pas de grille.", "sans_grille"));
  });

  it("eleve_introuvable → 404", async () => {
    mockPrisma.eleve.findFirst.mockResolvedValue(null);
    await expect(
      soumettreCorrection(tenantId, claims, { eleveId: "ele-x", questionId: "q-1", reponse: "réponse" }, actorId)
    ).rejects.toMatchObject(new ErreurCorrection("Élève introuvable.", "eleve_introuvable"));
  });

  it("budget_epuise → 429 (contrôlé avant l'appel IA)", async () => {
    vi.mocked(budgetDuJour).mockResolvedValue({ utilise: 200, plafond: 200, restant: 0, epuise: true } as any);
    await expect(
      soumettreCorrection(tenantId, claims, { eleveId: "ele-1", questionId: "q-1", reponse: "réponse" }, actorId)
    ).rejects.toMatchObject(
      new ErreurCorrection("Budget quotidien de corrections assistées épuisé.", "budget_epuise")
    );
    expect(routeAi).not.toHaveBeenCalled();
  });

  it("sortie_inexploitable → 502 quand le modèle ne retourne rien d'utilisable", async () => {
    vi.mocked(routeAi).mockResolvedValue(
      resultatIa({ content: "ceci n'est pas exploitable" })
    );
    await expect(
      soumettreCorrection(tenantId, claims, { eleveId: "ele-1", questionId: "q-1", reponse: "réponse" }, actorId)
    ).rejects.toMatchObject(
      new ErreurCorrection("Sortie du modèle inexploitable.", "sortie_inexploitable")
    );
  });
});

describe("soumettreCorrection — nominal", () => {
  it("crée la correction et retourne la proposition + le modèle", async () => {
    const res = await soumettreCorrection(
      tenantId,
      claims,
      { eleveId: "ele-1", questionId: "q-1", reponse: "Ma réponse" },
      actorId
    );

    expect(res.correctionId).toBe("ca-1");
    expect(res.proposition).toBeDefined();
    expect(res.modele).toBe("provider/model");
    expect(mockPrisma.correctionAssistee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId,
          eleveId: "ele-1",
          questionId: "q-1",
          grilleVersion: 1,
          statut: "A_VALIDER",
          // La note vient de la grille, jamais d'un total annoncé par le modèle :
          // le modèle a désigné c1 et c3, soit 2 + 1 = 3 sur 5.
          score: scoreDepuisCriteres(GRILLE, ["c1", "c3"]),
          maxScore: totalGrille(GRILLE),
        }),
      })
    );
    // L'élève est vérifié avant l'appel IA, le budget avant l'appel IA.
    const ordre = [
      mockPrisma.eleve.findFirst.mock.invocationCallOrder[0],
      vi.mocked(budgetDuJour).mock.invocationCallOrder[0],
      vi.mocked(routeAi).mock.invocationCallOrder[0],
    ];
    expect(ordre[0]).toBeLessThan(ordre[2]);
    expect(ordre[1]).toBeLessThan(ordre[2]);
  });
});
