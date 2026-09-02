import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    seuilsRecommandation: { findMany: vi.fn() },
    competence: { findFirst: vi.fn(), findMany: vi.fn() },
    studentLearningProfile: { findFirst: vi.fn(), findMany: vi.fn() },
    recommandation: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    learningEvidence: { findMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import {
  evaluerBande,
  statutParDefaut,
  formuler,
  resoudreSeuils,
  compterCompetencesEnAval,
  recalculerRecommandation,
  reinitialiserCaches,
  SEUILS_PAR_DEFAUT,
  type Seuils,
} from "@/lib/learnos/recommendation-engine";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

const SEUILS: Seuils = { ...SEUILS_PAR_DEFAUT };

beforeEach(() => {
  vi.clearAllMocks();
  // Les caches vivent le temps d'un drainage : sans remise à zéro, un test
  // hériterait des valeurs mémoïsées par le précédent.
  reinitialiserCaches();
  mockPrisma.seuilsRecommandation.findMany.mockResolvedValue([]);
  mockPrisma.competence.findFirst.mockResolvedValue({
    libelle: "Équations du 1er degré",
    chapitre: { niveau: "5ème", matiereId: "m1" },
    prerequis: [],
  });
  mockPrisma.competence.findMany.mockResolvedValue([]);
  mockPrisma.studentLearningProfile.findFirst.mockResolvedValue(null);
  mockPrisma.studentLearningProfile.findMany.mockResolvedValue([]);
  mockPrisma.recommandation.findFirst.mockResolvedValue(null);
  mockPrisma.recommandation.upsert.mockResolvedValue({});
  mockPrisma.recommandation.create.mockResolvedValue({});
  mockPrisma.recommandation.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.recommandation.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.learningEvidence.findMany.mockResolvedValue([]);
});

afterEach(() => vi.restoreAllMocks());

describe("bandes", () => {
  const bande = (m: number, c = 0.8) =>
    evaluerBande({ masteryScore: m, confidenceScore: c, trend: "stable" }, SEUILS);

  it("couvre tout le spectre, y compris le haut", () => {
    expect(bande(0.2)).toBe("CRITIQUE");
    expect(bande(0.45)).toBe("FRAGILE");
    expect(bande(0.65)).toBe("CONSOLIDE");
    expect(bande(0.85)).toBe("AVANCE");
    expect(bande(0.95)).toBe("EXCELLENCE");
  });

  // Sans ce verrou, un 2/20 sur une interrogation surprise suffirait à
  // déclarer une difficulté avérée.
  it("se tait sous le seuil de confiance, quel que soit le score", () => {
    expect(bande(0.1, 0.3)).toBeNull();
    expect(bande(0.95, 0.3)).toBeNull();
  });

  // `null` = « nous ne savons pas » ; `CONSOLIDE` = « tout va bien ». Les deux
  // n'appellent pas la même suite.
  it("distingue l'ignorance de la satisfaction", () => {
    expect(bande(0.65, 0.3)).toBeNull();
    expect(bande(0.65, 0.8)).toBe("CONSOLIDE");
  });
});

describe("statut par défaut", () => {
  // L'obligation se déduit de la structure du savoir, pas d'un seuil arbitraire.
  it("ne rend obligatoire une bande critique que si elle bloque la suite", () => {
    expect(statutParDefaut("CRITIQUE", 0, SEUILS)).toBe("RECOMMANDEE");
    expect(statutParDefaut("CRITIQUE", 1, SEUILS)).toBe("RECOMMANDEE");
    expect(statutParDefaut("CRITIQUE", 2, SEUILS)).toBe("OBLIGATOIRE");
    expect(statutParDefaut("CRITIQUE", 7, SEUILS)).toBe("OBLIGATOIRE");
  });

  // Proposer sans contraindre : c'est ce qui rend l'enrichissement acceptable
  // pour un élève déjà à l'aise.
  it("ne contraint jamais un élève des bandes hautes", () => {
    expect(statutParDefaut("AVANCE", 99, SEUILS)).toBe("PROPOSEE");
    expect(statutParDefaut("EXCELLENCE", 99, SEUILS)).toBe("PROPOSEE");
  });

  it("recommande sans imposer sur une bande fragile", () => {
    expect(statutParDefaut("FRAGILE", 99, SEUILS)).toBe("RECOMMANDEE");
  });
});

describe("formulation", () => {
  it("nomme le prérequis manquant plutôt que de constater l'échec", () => {
    const f = formuler(
      "CRITIQUE",
      "Équations",
      [{ competenceId: "p1", code: "FRAC", libelle: "Fractions", masteryScore: 0.2, acquis: false }],
      3
    );
    expect(f.motif).toContain("Fractions");
    expect(f.actionProposee).toContain("Fractions");
    expect(f.regleDeclenchee).toBe("critique_prerequis_manquant");
  });

  it("mentionne l'ampleur du blocage à défaut de prérequis identifié", () => {
    const f = formuler("CRITIQUE", "Équations", [], 4);
    expect(f.motif).toContain("4");
    expect(f.regleDeclenchee).toBe("critique_sans_prerequis");
  });

  it("formule les bandes hautes comme une ouverture, pas comme un défaut", () => {
    expect(formuler("AVANCE", "Équations", [], 0).actionProposee).toContain("Approfondissement");
    expect(formuler("EXCELLENCE", "Équations", [], 0).actionProposee).toMatch(/Défi|tutorat/);
  });

  // Une justification qui change d'une exécution à l'autre n'en est pas une.
  it("est reproductible", () => {
    const a = formuler("FRAGILE", "Équations", [], 1);
    const b = formuler("FRAGILE", "Équations", [], 1);
    expect(a).toEqual(b);
  });
});

describe("résolution des seuils", () => {
  it("fonctionne sans configuration préalable", async () => {
    const s = await resoudreSeuils("t1", {});
    expect(s).toEqual(SEUILS_PAR_DEFAUT);
  });

  // 0,55 de maîtrise ne dit pas la même chose en CE1 et en terminale.
  it("retient la ligne la plus spécifique", async () => {
    mockPrisma.seuilsRecommandation.findMany.mockResolvedValue([
      { niveau: null, matiereId: null, seuilCritique: 0.1, seuilFragile: 0.2, seuilConsolide: 0.3, seuilAvance: 0.4, confianceMinimale: 0.5, prerequisBloquantsMin: 1 },
      { niveau: "5ème", matiereId: "m1", seuilCritique: 0.9, seuilFragile: 0.92, seuilConsolide: 0.94, seuilAvance: 0.96, confianceMinimale: 0.6, prerequisBloquantsMin: 3 },
      { niveau: "5ème", matiereId: null, seuilCritique: 0.5, seuilFragile: 0.6, seuilConsolide: 0.7, seuilAvance: 0.8, confianceMinimale: 0.55, prerequisBloquantsMin: 2 },
    ]);

    const s = await resoudreSeuils("t1", { niveau: "5ème", matiereId: "m1" });
    expect(s.seuilCritique).toBe(0.9);
    expect(s.prerequisBloquantsMin).toBe(3);
  });
});

describe("comptage des compétences en aval", () => {
  it("renvoie zéro quand rien ne dépend de la compétence", async () => {
    mockPrisma.competence.findMany.mockResolvedValue([]);
    expect(await compterCompetencesEnAval("t1", "c1")).toBe(0);
  });

  // S'arrêter aux dépendances directes sous-estimerait l'urgence d'un prérequis
  // situé bas dans la progression : A → B → {C, D} bloque bien trois compétences.
  it("suit la chaîne au-delà des dépendances directes", async () => {
    mockPrisma.competence.findMany
      .mockResolvedValueOnce([{ id: "B" }])
      .mockResolvedValueOnce([{ id: "C" }, { id: "D" }])
      .mockResolvedValue([]);

    expect(await compterCompetencesEnAval("t1", "A")).toBe(3);
  });

  // Un graphe mal saisi ne doit pas faire boucler le calcul indéfiniment.
  it("résiste à un cycle dans le graphe", async () => {
    mockPrisma.competence.findMany.mockResolvedValue([{ id: "A" }, { id: "B" }]);
    const n = await compterCompetencesEnAval("t1", "A");
    expect(n).toBe(1); // B seul : A est déjà vue
  });
});

describe("recalcul", () => {
  function profil(
    masteryScore: number,
    confidenceScore = 0.8,
    prerequis: unknown[] | null = null
  ) {
    mockPrisma.studentLearningProfile.findFirst.mockResolvedValue({
      masteryScore,
      confidenceScore,
      trend: "stable",
      siteId: "site1",
      prerequisiteStatus: prerequis,
    });
  }

  it("ne recommande rien sans profil", async () => {
    expect(await recalculerRecommandation("t1", "e1", "c1")).toBeNull();
    expect(mockPrisma.recommandation.create).not.toHaveBeenCalled();
    expect(mockPrisma.recommandation.updateMany).not.toHaveBeenCalled();
  });

  // Le silence de la bande consolidée est la condition de l'attention portée
  // au reste : un système qui recommande à tout le monde n'est plus lu.
  it("n'écrit rien pour un élève dans la bande consolidée", async () => {
    profil(0.65);
    const bande = await recalculerRecommandation("t1", "e1", "c1");

    expect(bande).toBe("CONSOLIDE");
    expect(mockPrisma.recommandation.create).not.toHaveBeenCalled();
    expect(mockPrisma.recommandation.updateMany).not.toHaveBeenCalled();
  });

  it("recommande aussi bien vers le haut que vers le bas", async () => {
    profil(0.95);
    await recalculerRecommandation("t1", "e1", "c1");

    const donnees = mockPrisma.recommandation.create.mock.calls[0][0].data;
    expect(donnees.niveau).toBe("EXCELLENCE");
    expect(donnees.statut).toBe("PROPOSEE");
  });

  it("rend obligatoire un blocage structurel", async () => {
    profil(0.2);
    mockPrisma.competence.findMany
      .mockResolvedValueOnce([{ id: "B" }, { id: "C" }])
      .mockResolvedValue([]);

    await recalculerRecommandation("t1", "e1", "c1");

    const donnees = mockPrisma.recommandation.create.mock.calls[0][0].data;
    expect(donnees.statut).toBe("OBLIGATOIRE");
    expect(donnees.competencesBloquees).toBe(2);
  });

  // Sans cela, le système ressusciterait indéfiniment une recommandation qu'un
  // enseignant a délibérément écartée.
  it("respecte une décision humaine au lieu de la réécrire", async () => {
    profil(0.2);
    mockPrisma.recommandation.findFirst.mockResolvedValue({ id: "r1", statut: "ECARTEE" });

    await recalculerRecommandation("t1", "e1", "c1");

    expect(mockPrisma.recommandation.updateMany.mock.calls[0][0].data.statut).toBe("ECARTEE");
  });

  it("conserve de même une recommandation acceptée", async () => {
    profil(0.2);
    mockPrisma.recommandation.findFirst.mockResolvedValue({ id: "r1", statut: "ACCEPTEE" });

    await recalculerRecommandation("t1", "e1", "c1");

    expect(mockPrisma.recommandation.updateMany.mock.calls[0][0].data.statut).toBe("ACCEPTEE");
  });

  // On conserve l'historique plutôt que de le supprimer : il dira plus tard
  // quels accompagnements fonctionnent.
  it("marque résolue — sans l'effacer — une recommandation dont l'objectif est atteint", async () => {
    profil(0.7);
    mockPrisma.recommandation.findFirst.mockResolvedValue({ id: "r1", statut: "OBLIGATOIRE" });

    await recalculerRecommandation("t1", "e1", "c1");

    expect(mockPrisma.recommandation.deleteMany).not.toHaveBeenCalled();
    const appel = mockPrisma.recommandation.updateMany.mock.calls[0][0];
    // Le `where` inclut `tenantId` : c'est le motif du remplacement d'upsert
    // par updateMany (la contrainte unique ne couvrait pas tenantId).
    expect(appel.where.tenantId).toBe("t1");
    expect(appel.data.resolueLe).toBeInstanceOf(Date);
  });

  it("retire une recommandation que la confiance ne justifie plus", async () => {
    profil(0.2, 0.2);
    mockPrisma.recommandation.findFirst.mockResolvedValue({ id: "r1", statut: "RECOMMANDEE" });

    await recalculerRecommandation("t1", "e1", "c1");

    expect(mockPrisma.recommandation.deleteMany).toHaveBeenCalled();
  });

  it("n'efface pas une décision humaine même si la confiance retombe", async () => {
    profil(0.2, 0.2);
    mockPrisma.recommandation.findFirst.mockResolvedValue({ id: "r1", statut: "ACCEPTEE" });

    await recalculerRecommandation("t1", "e1", "c1");

    expect(mockPrisma.recommandation.deleteMany).not.toHaveBeenCalled();
  });

  it("nomme le prérequis manquant dans le motif enregistré", async () => {
    profil(0.2, 0.8, [
      { competenceId: "p1", code: "FRAC", libelle: "Fractions", masteryScore: 0.2, acquis: false },
    ]);

    await recalculerRecommandation("t1", "e1", "c1");

    const donnees = mockPrisma.recommandation.create.mock.calls[0][0].data;
    expect(donnees.motif).toContain("Fractions");
    expect(donnees.regleDeclenchee).toBe("critique_prerequis_manquant");
  });

  it("propage tenant et site pour l'isolation", async () => {
    profil(0.2);
    await recalculerRecommandation("t1", "e1", "c1");

    const donnees = mockPrisma.recommandation.create.mock.calls[0][0].data;
    expect(donnees.tenantId).toBe("t1");
    expect(donnees.siteId).toBe("site1");
  });
});
