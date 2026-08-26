import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    eleve: { findMany: vi.fn() },
    studentLearningProfile: { groupBy: vi.fn() },
    absence: { groupBy: vi.fn() },
    incident: { groupBy: vi.fn() },
    facture: { groupBy: vi.fn() },
    recommandation: { groupBy: vi.fn() },
    planProgression: { groupBy: vi.fn() },
    bulletin: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
}));

vi.mock("@/lib/annee-scolaire", () => ({
  anneeActiveId: vi.fn().mockResolvedValue(null),
  anneeActive: vi.fn().mockResolvedValue(null),
  getAnneeCourante: vi.fn().mockResolvedValue(null),
  getAnneeCouranteLibelle: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/demo-now", () => ({
  getDemoNow: vi.fn().mockResolvedValue(new Date()),
  getDemoDate: vi.fn().mockResolvedValue(null),
}));

import prisma from "@/lib/prisma";
import { calculerRisqueDecrochage } from "@/lib/learnos/risque-decrochage";

const mockPrisma = prisma as unknown as Record<
  string,
  Record<string, ReturnType<typeof vi.fn>>
>;

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: empty results for all signals.
  mockPrisma.eleve.findMany.mockResolvedValue([]);
  mockPrisma.studentLearningProfile.groupBy.mockResolvedValue([]);
  mockPrisma.absence.groupBy.mockResolvedValue([]);
  mockPrisma.incident.groupBy.mockResolvedValue([]);
  mockPrisma.facture.groupBy.mockResolvedValue([]);
  mockPrisma.recommandation.groupBy.mockResolvedValue([]);
  mockPrisma.planProgression.groupBy.mockResolvedValue([]);
  mockPrisma.bulletin.findMany.mockResolvedValue([]);
});

/**
 * Helper : configure tous les signaux pour un unique élève "e1".
 *
 * Les appels groupBy de studentLearningProfile et absence sont consommés
 * dans l'ordre du Promise.all : d'abord "baisse" puis "total", d'abord
 * "recentes" puis "precedentes".
 */
function setupUnEleveAvecSignaux(opts: {
  nbBaisse?: number;
  totalCompetences?: number;
  absencesRecentes?: number;
  absencesPrecedentes?: number;
  incidents?: number;
  impayes?: number;
  recosNonResolues?: number;
  plansActifs?: number;
  bulletins?: { moyenne: number; periode: number }[];
}) {
  const {
    nbBaisse = 0,
    totalCompetences = 0,
    absencesRecentes = 0,
    absencesPrecedentes = 0,
    incidents = 0,
    impayes = 0,
    recosNonResolues = 0,
    plansActifs = 0,
    bulletins = [],
  } = opts;

  mockPrisma.eleve.findMany.mockResolvedValue([
    {
      id: "e1",
      nom: "Doe",
      prenom: "John",
      classeId: "c1",
      classe: { nom: "6A" },
    },
  ]);

  // studentLearningProfile.groupBy : 1er appel = trend "baisse", 2e = total.
  mockPrisma.studentLearningProfile.groupBy
    .mockResolvedValueOnce(
      nbBaisse > 0
        ? [{ eleveId: "e1", _count: { eleveId: nbBaisse } }]
        : []
    )
    .mockResolvedValueOnce(
      totalCompetences > 0
        ? [{ eleveId: "e1", _count: { eleveId: totalCompetences } }]
        : []
    );

  // absence.groupBy : 1er appel = recentes, 2e = precedentes.
  mockPrisma.absence.groupBy
    .mockResolvedValueOnce(
      absencesRecentes > 0
        ? [{ eleveId: "e1", _count: { eleveId: absencesRecentes } }]
        : []
    )
    .mockResolvedValueOnce(
      absencesPrecedentes > 0
        ? [{ eleveId: "e1", _count: { eleveId: absencesPrecedentes } }]
        : []
    );

  mockPrisma.incident.groupBy.mockResolvedValue(
    incidents > 0 ? [{ eleveId: "e1", _count: { eleveId: incidents } }] : []
  );
  mockPrisma.facture.groupBy.mockResolvedValue(
    impayes > 0 ? [{ eleveId: "e1", _count: { eleveId: impayes } }] : []
  );
  mockPrisma.recommandation.groupBy.mockResolvedValue(
    recosNonResolues > 0
      ? [{ eleveId: "e1", _count: { eleveId: recosNonResolues } }]
      : []
  );
  mockPrisma.planProgression.groupBy.mockResolvedValue(
    plansActifs > 0 ? [{ eleveId: "e1", _count: { eleveId: plansActifs } }] : []
  );
  mockPrisma.bulletin.findMany.mockResolvedValue(
    bulletins.map((b) => ({
      eleveId: "e1",
      moyenneGenerale: b.moyenne,
      periode: { numero: b.periode },
    }))
  );
}

describe("calculerRisqueDecrochage", () => {
  // ── Synthèse vide ──────────────────────────────────────────────────────

  it("retourne une synthèse vide quand aucun élève", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([]);

    const result = await calculerRisqueDecrochage("tenant1", {} as any);

    expect(result.totalEleves).toBe(0);
    expect(result.risqueEleve).toBe(0);
    expect(result.risqueModere).toBe(0);
    expect(result.risqueFaible).toBe(0);
    expect(result.decrochageSilencieux).toBe(0);
    expect(result.eleves).toEqual([]);
  });

  // ── Score de risque : mastery en baisse ────────────────────────────────

  it("calcule correctement le score de risque pour un élève avec mastery en baisse", async () => {
    // 5 competences en baisse sur 10 → masteryBaisse = 0.5
    // Score = 0.4 * 0.5 * 100 = 20
    setupUnEleveAvecSignaux({
      nbBaisse: 5,
      totalCompetences: 10,
    });

    const result = await calculerRisqueDecrochage("tenant1", {} as any);
    const eleve = result.eleves[0];

    expect(eleve).toBeDefined();
    expect(eleve.signaux.masteryBaisse).toBe(0.5);
    expect(eleve.score).toBe(20);
    expect(eleve.niveau).toBe("FAIBLE");
  });

  // ── Décrochage silencieux ──────────────────────────────────────────────

  it("détecte le décrochage silencieux (mastery en baisse + moyenne >= 8)", async () => {
    // 3 competences en baisse sur 5 → nbBaisse = 3 >= SEUIL_COMPETENCES_BAISSE (2)
    // Bulletins : derniere = 9.5 (>= 8), precedente = 11 → notes en baisse
    // → decrochageSilencieux = true
    setupUnEleveAvecSignaux({
      nbBaisse: 3,
      totalCompetences: 5,
      bulletins: [
        { moyenne: 9.5, periode: 2 },
        { moyenne: 11, periode: 1 },
      ],
    });

    const result = await calculerRisqueDecrochage("tenant1", {} as any);
    const eleve = result.eleves[0];

    expect(eleve.decrochageSilencieux).toBe(true);
    expect(eleve.moyenneActuelle).toBe(9.5);
    expect(result.decrochageSilencieux).toBe(1);
  });

  it("ne détecte pas le décrochage silencieux quand la moyenne est < 8", async () => {
    // Mastery en baisse + notes en baisse, mais moyenne < 8 → échec visible,
    // pas un décrochage silencieux.
    setupUnEleveAvecSignaux({
      nbBaisse: 3,
      totalCompetences: 5,
      bulletins: [
        { moyenne: 6, periode: 2 },
        { moyenne: 10, periode: 1 },
      ],
    });

    const result = await calculerRisqueDecrochage("tenant1", {} as any);

    expect(result.eleves[0].decrochageSilencieux).toBe(false);
  });

  it("détecte le décrochage silencieux via hausse d'absences (sans notes en baisse)", async () => {
    // Pas de bulletins → pas de notes en baisse, MAIS absences qui augmentent.
    // 3 competences en baisse + absences recentes > precedentes + moyenne >= 8.
    setupUnEleveAvecSignaux({
      nbBaisse: 3,
      totalCompetences: 5,
      absencesRecentes: 10,
      absencesPrecedentes: 3,
      bulletins: [{ moyenne: 10, periode: 1 }],
    });

    const result = await calculerRisqueDecrochage("tenant1", {} as any);

    expect(result.eleves[0].decrochageSilencieux).toBe(true);
  });

  // ── Classification des niveaux ─────────────────────────────────────────

  it("classifie correctement les niveaux (FAIBLE, MODERE, ELEVE)", async () => {
    // Trois élèves avec intensités de signaux différentes.
    mockPrisma.eleve.findMany.mockResolvedValue([
      { id: "e1", nom: "A", prenom: "A", classeId: "c1", classe: { nom: "6A" } },
      { id: "e2", nom: "B", prenom: "B", classeId: "c1", classe: { nom: "6A" } },
      { id: "e3", nom: "C", prenom: "C", classeId: "c1", classe: { nom: "6A" } },
    ]);

    // e1 : masteryBaisse = 1.0 (10/10), absencesHausse = 1.0 (20/20)
    //   → score = (0.4*1 + 0.25*1) * 100 = 65 → ELEVE
    // e2 : masteryBaisse = 0.5 (5/10), absencesHausse = 0.5 (10/20)
    //   → score = (0.4*0.5 + 0.25*0.5) * 100 = 32.5 → 33 → MODERE
    // e3 : masteryBaisse = 0.1 (1/10), absencesHausse = 0
    //   → score = 0.4*0.1*100 = 4 → FAIBLE
    mockPrisma.studentLearningProfile.groupBy
      .mockResolvedValueOnce([
        { eleveId: "e1", _count: { eleveId: 10 } },
        { eleveId: "e2", _count: { eleveId: 5 } },
        { eleveId: "e3", _count: { eleveId: 1 } },
      ]) // baisse
      .mockResolvedValueOnce([
        { eleveId: "e1", _count: { eleveId: 10 } },
        { eleveId: "e2", _count: { eleveId: 10 } },
        { eleveId: "e3", _count: { eleveId: 10 } },
      ]); // total

    mockPrisma.absence.groupBy
      .mockResolvedValueOnce([
        { eleveId: "e1", _count: { eleveId: 20 } },
        { eleveId: "e2", _count: { eleveId: 10 } },
      ]) // recentes
      .mockResolvedValueOnce([]); // precedentes

    const result = await calculerRisqueDecrochage("tenant1", {} as any);

    const e1 = result.eleves.find((e) => e.eleveId === "e1")!;
    const e2 = result.eleves.find((e) => e.eleveId === "e2")!;
    const e3 = result.eleves.find((e) => e.eleveId === "e3")!;

    expect(e1.score).toBe(65);
    expect(e1.niveau).toBe("ELEVE");

    expect(e2.score).toBe(33);
    expect(e2.niveau).toBe("MODERE");

    expect(e3.score).toBe(4);
    expect(e3.niveau).toBe("FAIBLE");

    // Vérifie les compteurs agrégés.
    expect(result.risqueEleve).toBe(1);
    expect(result.risqueModere).toBe(1);
    expect(result.risqueFaible).toBe(1);
  });

  // ── Poids des signaux ──────────────────────────────────────────────────

  it("applique les bons poids (40% mastery, 25% absences, 15% incidents, 10% impayés, 10% plan)", async () => {
    // Tous les signaux à 1.0 → score = (0.4 + 0.25 + 0.15 + 0.1 + 0.1) * 100 = 100
    setupUnEleveAvecSignaux({
      nbBaisse: 10,
      totalCompetences: 10, // masteryBaisse = 1.0
      absencesRecentes: 20, // absencesHausse = 20/20 = 1.0
      incidents: 5, // incidents = 5/5 = 1.0
      impayes: 3, // impayes = 3/3 = 1.0
      recosNonResolues: 2, // a recos non résolues
      plansActifs: 0, // ET pas de plan actif → pasDePlanActif = 1
    });

    const result = await calculerRisqueDecrochage("tenant1", {} as any);
    const eleve = result.eleves[0];

    expect(eleve.score).toBe(100);
    expect(eleve.niveau).toBe("ELEVE");
    expect(eleve.signaux.masteryBaisse).toBe(1);
    expect(eleve.signaux.absencesHausse).toBe(1);
    expect(eleve.signaux.incidents).toBe(1);
    expect(eleve.signaux.impayes).toBe(1);
    expect(eleve.signaux.pasDePlanActif).toBe(1);
  });

  it("vérifie la contribution individuelle de chaque poids", async () => {
    // Mastery seul (1.0) → 40 points.
    setupUnEleveAvecSignaux({
      nbBaisse: 10,
      totalCompetences: 10,
    });
    let result = await calculerRisqueDecrochage("tenant1", {} as any);
    expect(result.eleves[0].score).toBe(40);

    vi.clearAllMocks();
    // Absences seules (1.0) → 25 points.
    setupUnEleveAvecSignaux({
      totalCompetences: 10,
      absencesRecentes: 20,
    });
    result = await calculerRisqueDecrochage("tenant1", {} as any);
    expect(result.eleves[0].score).toBe(25);

    vi.clearAllMocks();
    // Incidents seuls (1.0) → 15 points.
    setupUnEleveAvecSignaux({
      totalCompetences: 10,
      incidents: 5,
    });
    result = await calculerRisqueDecrochage("tenant1", {} as any);
    expect(result.eleves[0].score).toBe(15);

    vi.clearAllMocks();
    // Impayés seuls (1.0) → 10 points.
    setupUnEleveAvecSignaux({
      totalCompetences: 10,
      impayes: 3,
    });
    result = await calculerRisqueDecrochage("tenant1", {} as any);
    expect(result.eleves[0].score).toBe(10);

    vi.clearAllMocks();
    // Plan manquant seul (1.0) → 10 points.
    setupUnEleveAvecSignaux({
      totalCompetences: 10,
      recosNonResolues: 2,
      plansActifs: 0,
    });
    result = await calculerRisqueDecrochage("tenant1", {} as any);
    expect(result.eleves[0].score).toBe(10);
  });
});
