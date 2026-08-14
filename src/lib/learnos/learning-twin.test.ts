import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    learningEvidence: { findMany: vi.fn() },
    competence: { findFirst: vi.fn() },
    studentLearningProfile: { findMany: vi.fn(), upsert: vi.fn() },
    eleve: { findFirst: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import {
  calculerProfil,
  poidsRecence,
  statutDeMaitrise,
  etatDesPrerequis,
  recalculerProfil,
  recalculerProfilsApresPreuve,
  DEMI_VIE_JOURS,
  CONFIANCE_MINIMALE,
  type PreuveAgregeable,
} from "@/lib/learnos/learning-twin";
import type { DrainedEvent } from "@/lib/learnos/event-bus";

const mockPrisma = prisma as unknown as {
  learningEvidence: { findMany: ReturnType<typeof vi.fn> };
  competence: { findFirst: ReturnType<typeof vi.fn> };
  studentLearningProfile: {
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  eleve: { findFirst: ReturnType<typeof vi.fn> };
};

const MAINTENANT = new Date("2026-06-01T00:00:00Z");

/** Preuve datée en jours avant la référence, pour lire les tests d'un coup d'œil. */
function preuve(
  masterySignal: number,
  ilYAJours = 0,
  over: Partial<PreuveAgregeable> = {}
): PreuveAgregeable {
  return {
    masterySignal,
    confidence: 0.75,
    weight: 1,
    occurredAt: new Date(MAINTENANT.getTime() - ilYAJours * 86_400_000),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.learningEvidence.findMany.mockResolvedValue([]);
  mockPrisma.competence.findFirst.mockResolvedValue(null);
  mockPrisma.studentLearningProfile.findMany.mockResolvedValue([]);
  mockPrisma.studentLearningProfile.upsert.mockResolvedValue({});
  mockPrisma.eleve.findFirst.mockResolvedValue({ siteId: "site1" });
});

afterEach(() => vi.restoreAllMocks());

describe("pondération par récence", () => {
  it("vaut 1 aujourd'hui et 0,5 après une demi-vie", () => {
    expect(poidsRecence(MAINTENANT, MAINTENANT)).toBe(1);
    const uneDemiVie = new Date(MAINTENANT.getTime() - DEMI_VIE_JOURS * 86_400_000);
    expect(poidsRecence(uneDemiVie, MAINTENANT)).toBeCloseTo(0.5, 5);
  });

  // Une date de saisie erronée ne doit pas donner plus de poids qu'une preuve
  // du jour.
  it("ne récompense pas une preuve datée dans le futur", () => {
    const futur = new Date(MAINTENANT.getTime() + 30 * 86_400_000);
    expect(poidsRecence(futur, MAINTENANT)).toBe(1);
  });
});

describe("agrégation", () => {
  it("ne conclut rien sans preuve", () => {
    const p = calculerProfil([], MAINTENANT);
    expect(p.masteryStatus).toBe("UNKNOWN");
    expect(p.confidenceScore).toBe(0);
    expect(p.trend).toBe("indetermine");
  });

  it("moyenne les signaux pondérés", () => {
    const p = calculerProfil([preuve(0.8), preuve(0.6)], MAINTENANT);
    expect(p.masteryScore).toBeCloseTo(0.7, 5);
    expect(p.evidenceCount).toBe(2);
  });

  it("donne plus de poids à une preuve récente qu'à une ancienne", () => {
    // Même couple de scores, ordre chronologique inversé.
    const progression = calculerProfil([preuve(0.4, 120), preuve(0.9, 1)], MAINTENANT);
    const regression = calculerProfil([preuve(0.9, 120), preuve(0.4, 1)], MAINTENANT);

    expect(progression.masteryScore).toBeGreaterThan(regression.masteryScore);
  });

  it("pèse davantage une preuve de fort coefficient", () => {
    const p = calculerProfil(
      [preuve(1, 0, { weight: 4 }), preuve(0, 0, { weight: 1 })],
      MAINTENANT
    );
    expect(p.masteryScore).toBeCloseTo(0.8, 5);
  });

  it("pèse davantage une preuve fiable qu'une preuve incertaine", () => {
    const p = calculerProfil(
      [preuve(1, 0, { confidence: 0.9 }), preuve(0, 0, { confidence: 0.1 })],
      MAINTENANT
    );
    expect(p.masteryScore).toBeGreaterThan(0.8);
  });

  it("retient la date de la preuve la plus récente", () => {
    const p = calculerProfil([preuve(0.5, 30), preuve(0.5, 2)], MAINTENANT);
    expect(p.lastEvidenceAt?.toISOString()).toBe(
      new Date(MAINTENANT.getTime() - 2 * 86_400_000).toISOString()
    );
  });

  // Des preuves sans poids (barème aberrant, coefficient nul) n'apprennent
  // rien : c'est « aucune information », surtout pas « maîtrise nulle ».
  it("traite des preuves sans poids comme une absence d'information", () => {
    const p = calculerProfil([preuve(0.9, 0, { weight: 0 })], MAINTENANT);
    expect(p.masteryStatus).toBe("UNKNOWN");
    expect(p.confidenceScore).toBe(0);
  });
});

describe("confiance", () => {
  it("croît avec le nombre de preuves, puis sature", () => {
    const avec = (n: number) =>
      calculerProfil(Array.from({ length: n }, () => preuve(0.7)), MAINTENANT).confidenceScore;

    expect(avec(1)).toBeLessThan(avec(3));
    expect(avec(3)).toBeLessThan(avec(10));
    expect(avec(10)).toBeLessThan(1); // jamais de certitude absolue

    // Rendements décroissants : à incrément ÉGAL (une preuve de plus), le gain
    // s'amenuise. Comparer des incréments de tailles différentes ne dirait rien.
    expect(avec(10) - avec(9)).toBeLessThan(avec(2) - avec(1));
  });

  // Deux notes ne suffisent pas à déclarer une difficulté : c'est le
  // calibrage qui protège des conclusions hâtives.
  it("reste sous le seuil de conclusion avec deux preuves seulement", () => {
    const p = calculerProfil([preuve(0.2), preuve(0.25)], MAINTENANT);
    expect(p.confidenceScore).toBeLessThan(CONFIANCE_MINIMALE);
    expect(p.masteryStatus).toBe("UNKNOWN");
  });

  it("s'affaiblit quand les preuves vieillissent", () => {
    const recentes = calculerProfil([preuve(0.7, 1), preuve(0.7, 2), preuve(0.7, 3)], MAINTENANT);
    const anciennes = calculerProfil(
      [preuve(0.7, 300), preuve(0.7, 310), preuve(0.7, 320)],
      MAINTENANT
    );
    expect(anciennes.confidenceScore).toBeLessThan(recentes.confidenceScore);
  });

  // Parti pris central : on ne baisse pas la maîtrise au seul motif que
  // l'élève n'a pas repratiqué — ce serait inventer une régression non
  // observée. C'est la confiance qui décroît, pas le score.
  it("le vieillissement érode la confiance, jamais la maîtrise", () => {
    const recentes = calculerProfil([preuve(0.7, 1), preuve(0.7, 2), preuve(0.7, 3)], MAINTENANT);
    const anciennes = calculerProfil(
      [preuve(0.7, 300), preuve(0.7, 310), preuve(0.7, 320)],
      MAINTENANT
    );
    expect(anciennes.masteryScore).toBeCloseTo(recentes.masteryScore, 5);
    expect(anciennes.confidenceScore).toBeLessThan(recentes.confidenceScore);
  });
});

describe("récence — la date du devoir, jamais celle de l'écriture", () => {
  // Bug trouvé par la validation de bout en bout : le jumeau pondérait sur
  // `createdAt`, l'horodatage d'insertion de la ligne. Toute preuve
  // fraîchement calculée paraissait donc datée du jour, et la pondération par
  // récence était inopérante en production. Les tests unitaires ne pouvaient
  // pas le voir : ils passaient déjà la date du devoir.
  it("distingue deux preuves identiques que seule la date du devoir sépare", () => {
    const recente = calculerProfil([preuve(0.9, 1), preuve(0.9, 2)], MAINTENANT);
    const ancienne = calculerProfil([preuve(0.9, 200), preuve(0.9, 210)], MAINTENANT);

    // Même maîtrise, mais on est bien moins sûr de la seconde.
    expect(ancienne.masteryScore).toBeCloseTo(recente.masteryScore, 5);
    expect(ancienne.confidenceScore).toBeLessThan(recente.confidenceScore * 0.6);
  });

  it("date la dernière preuve d'après le devoir, pas d'après l'écriture", () => {
    const p = calculerProfil([preuve(0.5, 30), preuve(0.5, 3)], MAINTENANT);
    const attendu = new Date(MAINTENANT.getTime() - 3 * 86_400_000);
    expect(p.lastEvidenceAt?.toISOString()).toBe(attendu.toISOString());
  });
});

describe("tendance", () => {
  // Affirmer « stable » sur deux notes serait une conclusion ; on n'a rien
  // observé.
  it("reste indéterminée sous quatre preuves", () => {
    expect(calculerProfil([preuve(0.5), preuve(0.5), preuve(0.5)], MAINTENANT).trend).toBe(
      "indetermine"
    );
  });

  it("détecte une progression", () => {
    const p = calculerProfil(
      [preuve(0.3, 40), preuve(0.35, 30), preuve(0.7, 10), preuve(0.8, 2)],
      MAINTENANT
    );
    expect(p.trend).toBe("hausse");
  });

  it("détecte une dégradation", () => {
    const p = calculerProfil(
      [preuve(0.85, 40), preuve(0.8, 30), preuve(0.5, 10), preuve(0.4, 2)],
      MAINTENANT
    );
    expect(p.trend).toBe("baisse");
  });

  it("ne voit pas d'évolution dans une simple fluctuation", () => {
    const p = calculerProfil(
      [preuve(0.6, 40), preuve(0.65, 30), preuve(0.62, 10), preuve(0.63, 2)],
      MAINTENANT
    );
    expect(p.trend).toBe("stable");
  });
});

describe("statut de maîtrise", () => {
  it("refuse de conclure sous le seuil de confiance", () => {
    expect(statutDeMaitrise(0.95, 0.2, "stable")).toBe("UNKNOWN");
    expect(statutDeMaitrise(0.05, 0.2, "stable")).toBe("UNKNOWN");
  });

  it("échelonne les paliers de maîtrise", () => {
    expect(statutDeMaitrise(0.2, 0.8, "stable")).toBe("EMERGING");
    expect(statutDeMaitrise(0.45, 0.8, "stable")).toBe("DEVELOPING");
    expect(statutDeMaitrise(0.65, 0.8, "stable")).toBe("PROFICIENT");
    expect(statutDeMaitrise(0.9, 0.8, "stable")).toBe("MASTERED");
  });

  // Distinction utile en pratique : une compétence acquise qui se dégrade
  // appelle un rappel, pas une reprise depuis le début.
  it("distingue une compétence qui se dégrade d'une compétence jamais acquise", () => {
    expect(statutDeMaitrise(0.85, 0.8, "baisse")).toBe("NEEDS_REVIEW");
    expect(statutDeMaitrise(0.2, 0.8, "baisse")).toBe("EMERGING");
  });

  // Verrou anti-triche : sans regard adulte, « acquis » reste hors d'atteinte,
  // faute de quoi la faible fiabilité de l'entraînement autonome se
  // contournerait par le volume.
  it("plafonne à PROFICIENT sans aucune preuve supervisée", () => {
    expect(statutDeMaitrise(0.95, 0.9, "stable", false)).toBe("PROFICIENT");
    expect(statutDeMaitrise(0.95, 0.9, "stable", true)).toBe("MASTERED");
  });

  it("laisse les statuts inférieurs inchangés sans supervision", () => {
    expect(statutDeMaitrise(0.65, 0.8, "stable", false)).toBe("PROFICIENT");
    expect(statutDeMaitrise(0.2, 0.8, "stable", false)).toBe("EMERGING");
  });
});

describe("supervision", () => {
  it("plafonne le profil composé uniquement de séances autonomes", () => {
    const preuves = [0, 1, 2, 3].map((i) =>
      preuve(0.95, i * 5, { weight: 3, confidence: 0.9, supervisee: false })
    );
    expect(calculerProfil(preuves, MAINTENANT).masteryStatus).toBe("PROFICIENT");
  });

  it("débloque MASTERED dès qu'une seule preuve supervisée s'ajoute", () => {
    const preuves = [
      ...[0, 1, 2].map((i) => preuve(0.95, i * 5, { weight: 3, confidence: 0.9, supervisee: false })),
      preuve(0.95, 1, { weight: 3, confidence: 0.9 }),
    ];
    expect(calculerProfil(preuves, MAINTENANT).masteryStatus).toBe("MASTERED");
  });

  it("ne compte pas comme supervisée une preuve sans poids effectif", () => {
    const preuves = [
      ...[0, 1, 2].map((i) => preuve(0.95, i * 5, { weight: 3, confidence: 0.9, supervisee: false })),
      // Coefficient nul : cette preuve ne pèse rien, elle ne peut rien attester.
      preuve(0.95, 1, { weight: 0, confidence: 0.9 }),
    ];
    expect(calculerProfil(preuves, MAINTENANT).masteryStatus).toBe("PROFICIENT");
  });
});

describe("état des prérequis", () => {
  it("ne renvoie rien quand la compétence n'a pas de prérequis", async () => {
    mockPrisma.competence.findFirst.mockResolvedValue({ prerequis: [] });
    expect(await etatDesPrerequis("t1", "e1", "c1")).toEqual([]);
  });

  // On ne présume pas d'un savoir qu'on n'a jamais mesuré.
  it("ne présume pas acquis un prérequis jamais évalué", async () => {
    mockPrisma.competence.findFirst.mockResolvedValue({
      prerequis: [{ id: "p1", code: "FRAC", libelle: "Fractions" }],
    });
    mockPrisma.studentLearningProfile.findMany.mockResolvedValue([]);

    const etat = await etatDesPrerequis("t1", "e1", "c1");

    expect(etat[0].acquis).toBe(false);
    expect(etat[0].masteryScore).toBeNull();
  });

  it("ne tient pas pour acquis un prérequis mesuré mais peu fiable", async () => {
    mockPrisma.competence.findFirst.mockResolvedValue({
      prerequis: [{ id: "p1", code: "FRAC", libelle: "Fractions" }],
    });
    mockPrisma.studentLearningProfile.findMany.mockResolvedValue([
      { competenceId: "p1", masteryScore: 0.9, masteryStatus: "UNKNOWN" },
    ]);

    const etat = await etatDesPrerequis("t1", "e1", "c1");
    expect(etat[0].acquis).toBe(false);
  });

  it("reconnaît un prérequis solidement acquis", async () => {
    mockPrisma.competence.findFirst.mockResolvedValue({
      prerequis: [{ id: "p1", code: "FRAC", libelle: "Fractions" }],
    });
    mockPrisma.studentLearningProfile.findMany.mockResolvedValue([
      { competenceId: "p1", masteryScore: 0.72, masteryStatus: "PROFICIENT" },
    ]);

    const etat = await etatDesPrerequis("t1", "e1", "c1");
    expect(etat[0].acquis).toBe(true);
    expect(etat[0].code).toBe("FRAC");
  });
});

describe("recalcul du profil", () => {
  it("repart de toutes les preuves, ce qui rend le recalcul idempotent", async () => {
    mockPrisma.learningEvidence.findMany.mockResolvedValue([
      { masterySignal: 0.8, confidence: 0.75, weight: 1, occurredAt: MAINTENANT },
    ]);

    await recalculerProfil("t1", "e1", "c1", MAINTENANT);
    await recalculerProfil("t1", "e1", "c1", MAINTENANT);

    const a = mockPrisma.studentLearningProfile.upsert.mock.calls[0][0];
    const b = mockPrisma.studentLearningProfile.upsert.mock.calls[1][0];
    expect(b.create.masteryScore).toBe(a.create.masteryScore);
    expect(b.where).toEqual(a.where);
  });

  it("hérite le site de l'élève, seule source de vérité du rattachement", async () => {
    mockPrisma.eleve.findFirst.mockResolvedValue({ siteId: "siteB" });
    await recalculerProfil("t1", "e1", "c1", MAINTENANT);
    expect(mockPrisma.studentLearningProfile.upsert.mock.calls[0][0].create.siteId).toBe("siteB");
  });

  it("borne la lecture des preuves au tenant et à l'élève", async () => {
    await recalculerProfil("t1", "e1", "c1", MAINTENANT);
    expect(mockPrisma.learningEvidence.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: "t1",
      eleveId: "e1",
      competenceId: "c1",
    });
  });
});

describe("branchement sur une note enregistrée", () => {
  function evenement(): DrainedEvent {
    return {
      id: "ev1",
      tenantId: "t1",
      siteId: "site1",
      eventType: "note.recorded",
      aggregateType: "note",
      aggregateId: "note1",
      occurredAt: MAINTENANT,
      payload: { noteId: "note1", eleveId: "e1" },
    };
  }

  // Il ne redéduit pas les compétences visées : il lit les preuves que le
  // moteur vient d'écrire. Une seule logique de rattachement, donc pas de
  // divergence possible entre les deux étapes.
  it("recalcule un profil par compétence touchée par la note", async () => {
    mockPrisma.learningEvidence.findMany
      .mockResolvedValueOnce([{ competenceId: "c1" }, { competenceId: "c2" }])
      .mockResolvedValue([]);

    await recalculerProfilsApresPreuve(evenement());

    const competences = mockPrisma.studentLearningProfile.upsert.mock.calls.map(
      (c) => c[0].create.competenceId
    );
    expect(competences).toEqual(["c1", "c2"]);
  });

  // Un profil se tient par compétence : une preuve de granularité « matière »
  // n'en alimente aucun.
  it("ignore les preuves sans compétence rattachée", async () => {
    mockPrisma.learningEvidence.findMany.mockResolvedValue([]);

    await recalculerProfilsApresPreuve(evenement());

    expect(mockPrisma.learningEvidence.findMany.mock.calls[0][0].where.competenceId).toEqual({
      not: null,
    });
    expect(mockPrisma.studentLearningProfile.upsert).not.toHaveBeenCalled();
  });

  it("ne fait rien sur un payload amputé", async () => {
    await recalculerProfilsApresPreuve({ ...evenement(), payload: {} });
    expect(mockPrisma.studentLearningProfile.upsert).not.toHaveBeenCalled();
  });
});
