import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    recommandation: { findMany: vi.fn() },
    anneesScolaires: { findFirst: vi.fn() },
    studentIntervention: { findMany: vi.fn() },
    studentLearningProfile: { findMany: vi.fn() },
    ficheRH: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
}));

vi.mock("@/lib/learnos/recommendation-engine", () => ({
  compterCompetencesEnAval: vi.fn().mockResolvedValue(0),
}));

import prisma from "@/lib/prisma";
import { simulerRemediation } from "@/lib/learnos/simulation-remediation";

const mockPrisma = prisma as unknown as Record<
  string,
  Record<string, ReturnType<typeof vi.fn>>
>;

/** Construit une recommandation OBLIGATOIRE pour un élève × compétence. */
function reco(eleveId: string, competenceId: string, libelle: string) {
  return {
    eleveId,
    competenceId,
    competence: {
      id: competenceId,
      libelle,
      chapitre: { matiere: { id: "m1", nom: "Maths" } },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults : résultats vides.
  mockPrisma.recommandation.findMany.mockResolvedValue([]);
  mockPrisma.anneesScolaires.findFirst.mockResolvedValue(null);
  mockPrisma.studentIntervention.findMany.mockResolvedValue([]);
  mockPrisma.studentLearningProfile.findMany.mockResolvedValue([]);
  mockPrisma.ficheRH.findMany.mockResolvedValue([]);
});

describe("simulerRemediation", () => {
  // ── Scénarios vides ────────────────────────────────────────────────────

  it("retourne des scénarios vides quand aucune recommandation", async () => {
    mockPrisma.recommandation.findMany.mockResolvedValue([]);

    const result = await simulerRemediation("tenant1", {} as any);

    expect(result.scenarios).toEqual([]);
    expect(result.scenariosPriorises).toEqual([]);
    expect(result.totalElevesARisque).toBe(0);
    expect(result.totalElevesSauvables).toBe(0);
    expect(result.coutTotalOptimal).toBe(0);
    // Les deltas par type sont renseignés avec le défaut 0.2 et échantillon 0.
    expect(result.deltaMoyenParType).toHaveLength(3);
    for (const d of result.deltaMoyenParType) {
      expect(d.delta).toBe(0.2);
      expect(d.echantillon).toBe(0);
    }
  });

  // ── Δ mastery moyen depuis l'historique ────────────────────────────────

  it("calcule le delta mastery moyen depuis les interventions passées", async () => {
    mockPrisma.recommandation.findMany.mockResolvedValue([
      reco("e1", "c1", "Fractions"),
    ]);
    // Deux interventions "remediation" : Δ = 0.3 et 0.3 → moyen = 0.3
    mockPrisma.studentIntervention.findMany.mockResolvedValue([
      { interventionType: "remediation", masteryBefore: 0.3, masteryAfter: 0.6 },
      { interventionType: "remediation", masteryBefore: 0.4, masteryAfter: 0.7 },
    ]);
    mockPrisma.studentLearningProfile.findMany.mockResolvedValue([
      { eleveId: "e1", competenceId: "c1", masteryScore: 0.4 },
    ]);
    mockPrisma.ficheRH.findMany.mockResolvedValue([{ tarifHoraire: 10 }]);

    const result = await simulerRemediation("tenant1", {} as any);

    const deltaRemediation = result.deltaMoyenParType.find(
      (d) => d.type === "remediation"
    );
    expect(deltaRemediation).toBeDefined();
    expect(deltaRemediation!.delta).toBeCloseTo(0.3, 5);
    expect(deltaRemediation!.echantillon).toBe(2);
  });

  // ── Δ par défaut quand pas d'historique ────────────────────────────────

  it("utilise le delta par défaut (0.2) quand pas de données historiques", async () => {
    mockPrisma.recommandation.findMany.mockResolvedValue([
      reco("e1", "c1", "Fractions"),
    ]);
    mockPrisma.studentIntervention.findMany.mockResolvedValue([]);
    mockPrisma.studentLearningProfile.findMany.mockResolvedValue([
      { eleveId: "e1", competenceId: "c1", masteryScore: 0.4 },
    ]);
    mockPrisma.ficheRH.findMany.mockResolvedValue([{ tarifHoraire: 10 }]);

    const result = await simulerRemediation("tenant1", {} as any);

    // Le scénario utilise le Δ par défaut.
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].deltaMoyenApplique).toBe(0.2);
    expect(result.scenarios[0].typeIntervention).toBe("remediation");

    // Tous les types ont le delta par défaut et aucun échantillon.
    for (const d of result.deltaMoyenParType) {
      expect(d.delta).toBe(0.2);
      expect(d.echantillon).toBe(0);
    }
  });

  // ── Tri par ROI décroissant ────────────────────────────────────────────

  it("trie les scénarios par ROI décroissant", async () => {
    mockPrisma.recommandation.findMany.mockResolvedValue([
      // c1 : 2 élèves concernés
      reco("e1", "c1", "Fractions"),
      reco("e2", "c1", "Fractions"),
      // c2 : 1 élève concerné
      reco("e3", "c2", "Équations"),
    ]);
    mockPrisma.studentIntervention.findMany.mockResolvedValue([]);
    // c1 : e1 (0.4 + 0.2 = 0.6 >= 0.55 → sauvé), e2 (0.2 + 0.2 = 0.4 < 0.55 → non)
    // c2 : e3 (0.4 + 0.2 = 0.6 >= 0.55 → sauvé)
    mockPrisma.studentLearningProfile.findMany.mockResolvedValue([
      { eleveId: "e1", competenceId: "c1", masteryScore: 0.4 },
      { eleveId: "e2", competenceId: "c1", masteryScore: 0.2 },
      { eleveId: "e3", competenceId: "c2", masteryScore: 0.4 },
    ]);
    mockPrisma.ficheRH.findMany.mockResolvedValue([{ tarifHoraire: 10 }]);

    const result = await simulerRemediation("tenant1", {} as any);

    // Coûts : c1 = 2 × 10 × 2 = 40, c2 = 1 × 10 × 2 = 20
    // ROI : c1 = 1/40 = 0.025, c2 = 1/20 = 0.05
    // → c2 (ROI plus élevé) doit venir en premier.
    expect(result.scenariosPriorises).toHaveLength(2);
    expect(result.scenariosPriorises[0].competenceId).toBe("c2");
    expect(result.scenariosPriorises[1].competenceId).toBe("c1");
    expect(result.scenariosPriorises[0].roi).toBeGreaterThan(
      result.scenariosPriorises[1].roi
    );
  });

  // ── Comptage des élèves sauvables ──────────────────────────────────────

  it("compte correctement les élèves sauvables (union, pas somme)", async () => {
    // e1 est à risque sur c1 ET c2, mais ne doit être compté qu'une fois.
    // e2 est à risque sur c1 seulement et n'est pas sauvable.
    mockPrisma.recommandation.findMany.mockResolvedValue([
      reco("e1", "c1", "Fractions"),
      reco("e1", "c2", "Équations"),
      reco("e2", "c1", "Fractions"),
    ]);
    mockPrisma.studentIntervention.findMany.mockResolvedValue([]);
    // e1 : sauvé sur c1 (0.4 + 0.2 = 0.6) ET sur c2 (0.4 + 0.2 = 0.6)
    // e2 : non sauvé sur c1 (0.2 + 0.2 = 0.4 < 0.55)
    mockPrisma.studentLearningProfile.findMany.mockResolvedValue([
      { eleveId: "e1", competenceId: "c1", masteryScore: 0.4 },
      { eleveId: "e1", competenceId: "c2", masteryScore: 0.4 },
      { eleveId: "e2", competenceId: "c1", masteryScore: 0.2 },
    ]);
    mockPrisma.ficheRH.findMany.mockResolvedValue([{ tarifHoraire: 10 }]);

    const result = await simulerRemediation("tenant1", {} as any);

    expect(result.totalElevesARisque).toBe(2); // e1 et e2
    expect(result.totalElevesSauvables).toBe(1); // e1 seul, compté une fois
  });

  // ── Coût total optimal ─────────────────────────────────────────────────

  it("ne compte dans le coût optimal que les scénarios qui sauvent au moins un élève", async () => {
    mockPrisma.recommandation.findMany.mockResolvedValue([
      reco("e1", "c1", "Fractions"), // e1 sauvé
      reco("e2", "c2", "Équations"), // e2 non sauvé (mastery trop basse)
    ]);
    mockPrisma.studentIntervention.findMany.mockResolvedValue([]);
    mockPrisma.studentLearningProfile.findMany.mockResolvedValue([
      { eleveId: "e1", competenceId: "c1", masteryScore: 0.4 }, // 0.6 >= 0.55 → sauvé
      { eleveId: "e2", competenceId: "c2", masteryScore: 0.1 }, // 0.3 < 0.55 → non
    ]);
    mockPrisma.ficheRH.findMany.mockResolvedValue([{ tarifHoraire: 10 }]);

    const result = await simulerRemediation("tenant1", {} as any);

    // c1 coûte 1 × 10 × 2 = 20 (sauve 1 élève → inclus)
    // c2 coûte 1 × 10 × 2 = 20 (sauve 0 élève → exclu)
    expect(result.coutTotalOptimal).toBe(20);
  });
});
