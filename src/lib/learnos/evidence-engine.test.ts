import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    evaluationCompetence: { findMany: vi.fn() },
    learningEvidence: { upsert: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import {
  calculerSignal,
  evidenceTypeFromNote,
  evidenceId,
  ingererNoteCommePreuve,
} from "@/lib/learnos/evidence-engine";
import type { DrainedEvent } from "@/lib/learnos/event-bus";

const mockPrisma = prisma as unknown as {
  evaluationCompetence: { findMany: ReturnType<typeof vi.fn> };
  learningEvidence: { upsert: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.evaluationCompetence.findMany.mockResolvedValue([]);
  mockPrisma.learningEvidence.upsert.mockResolvedValue({});
});

afterEach(() => vi.restoreAllMocks());

function evenement(payload: Record<string, unknown>): DrainedEvent {
  return {
    id: "ev1",
    tenantId: "tenant1",
    siteId: "site1",
    eventType: "note.recorded",
    aggregateType: "note",
    aggregateId: "note1",
    occurredAt: new Date("2026-01-15"),
    payload: {
      noteId: "note1",
      eleveId: "eleve1",
      classeId: "classe1",
      matiereId: "matiere1",
      periodeId: "periode1",
      evaluationId: "eval1",
      valeur: 14,
      noteMax: 20,
      coefficient: 2,
      type: "CONTROLE",
      intitule: "DS n°1",
      date: "2026-01-15T00:00:00.000Z",
      saisieParId: "user1",
      ...payload,
    },
  };
}

describe("nature pédagogique déduite du type administratif", () => {
  it("associe chaque type de note de l'ERP à une nature pédagogique", () => {
    expect(evidenceTypeFromNote("EXAMEN")).toBe("EXAMEN");
    expect(evidenceTypeFromNote("CONTROLE")).toBe("DEVOIR");
    expect(evidenceTypeFromNote("DEVOIR")).toBe("DEVOIR");
    expect(evidenceTypeFromNote("INTERROGATION")).toBe("QUIZ");
    expect(evidenceTypeFromNote("PROJET")).toBe("PROJET");
    expect(evidenceTypeFromNote("ORAL")).toBe("ORAL");
    expect(evidenceTypeFromNote("TP")).toBe("EXERCICE");
  });
});

describe("calcul du signal", () => {
  it("normalise le score sur 0..1", () => {
    expect(calculerSignal({ valeur: 14, noteMax: 20, coefficient: 1, evidenceType: "DEVOIR" }).masterySignal).toBeCloseTo(0.7);
    expect(calculerSignal({ valeur: 0, noteMax: 20, coefficient: 1, evidenceType: "DEVOIR" }).masterySignal).toBe(0);
    expect(calculerSignal({ valeur: 20, noteMax: 20, coefficient: 1, evidenceType: "DEVOIR" }).masterySignal).toBe(1);
  });

  // Une note bonifiée au-delà du barème produirait un signal > 1 qui fausserait
  // toute agrégation ultérieure.
  it("borne une note supérieure au barème", () => {
    const s = calculerSignal({ valeur: 22, noteMax: 20, coefficient: 1, evidenceType: "DEVOIR" });
    expect(s.masterySignal).toBe(1);
  });

  // Distinction structurante : un score bas est un signal BAS, pas un signal
  // PEU FIABLE. Les confondre empêcherait de distinguer « ne maîtrise pas » de
  // « nous n'en savons pas assez » — deux situations aux réponses opposées.
  it("garde la maîtrise et la confiance indépendantes", () => {
    const faible = calculerSignal({ valeur: 2, noteMax: 20, coefficient: 1, evidenceType: "EXAMEN" });
    const fort = calculerSignal({ valeur: 18, noteMax: 20, coefficient: 1, evidenceType: "EXAMEN" });

    expect(faible.masterySignal).toBeLessThan(fort.masterySignal);
    // Même production, même fiabilité : seul le niveau change.
    expect(faible.confidence).toBe(fort.confidence);
  });

  it("fait davantage confiance à un examen qu'à une interrogation", () => {
    const examen = calculerSignal({ valeur: 14, noteMax: 20, coefficient: 1, evidenceType: "EXAMEN" });
    const quiz = calculerSignal({ valeur: 14, noteMax: 20, coefficient: 1, evidenceType: "QUIZ" });

    expect(examen.confidence).toBeGreaterThan(quiz.confidence);
    // …sans que cela change ce que le score dit du niveau.
    expect(examen.masterySignal).toBe(quiz.masterySignal);
  });

  it("fait davantage confiance à un barème fin qu'à un barème grossier", () => {
    const sur20 = calculerSignal({ valeur: 14, noteMax: 20, coefficient: 1, evidenceType: "DEVOIR" });
    const sur2 = calculerSignal({ valeur: 1.4, noteMax: 2, coefficient: 1, evidenceType: "DEVOIR" });

    expect(sur20.masterySignal).toBeCloseTo(sur2.masterySignal);
    expect(sur20.confidence).toBeGreaterThan(sur2.confidence);
  });

  // Un barème nul signifie « aucune information », et surtout pas « échec » :
  // renvoyer 0 en maîtrise AVEC une confiance nulle empêche de le confondre.
  it("traite un barème absurde comme une absence d'information, pas comme un échec", () => {
    for (const noteMax of [0, -5, NaN]) {
      const s = calculerSignal({ valeur: 10, noteMax, coefficient: 1, evidenceType: "DEVOIR" });
      expect(s.confidence).toBe(0);
      expect(s.weight).toBe(0);
    }
  });

  it("reprend le coefficient de l'enseignant comme poids, en le bornant", () => {
    expect(calculerSignal({ valeur: 10, noteMax: 20, coefficient: 3, evidenceType: "DEVOIR" }).weight).toBe(3);
    // Une saisie aberrante ne doit pas écraser toutes les autres preuves.
    expect(calculerSignal({ valeur: 10, noteMax: 20, coefficient: 999, evidenceType: "DEVOIR" }).weight).toBe(10);
    expect(calculerSignal({ valeur: 10, noteMax: 20, coefficient: -1, evidenceType: "DEVOIR" }).weight).toBe(0);
  });

  // Propriété non négociable : le déterminisme est la raison pour laquelle ce
  // moteur n'appelle aucun modèle (LEARNOS §38).
  it("rend exactement le même résultat à entrée identique", () => {
    const entree = { valeur: 13.5, noteMax: 20, coefficient: 2, evidenceType: "DEVOIR" as const };
    expect(calculerSignal(entree)).toEqual(calculerSignal(entree));
  });
});

describe("identifiant de preuve", () => {
  it("est stable pour une même source", () => {
    expect(evidenceId("note", "n1", "c1")).toBe(evidenceId("note", "n1", "c1"));
  });

  it("distingue deux compétences de la même note", () => {
    expect(evidenceId("note", "n1", "c1")).not.toBe(evidenceId("note", "n1", "c2"));
  });

  // Sans identifiant dérivé, deux traitements du même événement créeraient deux
  // preuves : PostgreSQL considère les NULL comme distincts, donc une contrainte
  // d'unicité sur competenceId ne les aurait pas empêchés.
  it("reste stable en l'absence de compétence rattachée", () => {
    expect(evidenceId("note", "n1", null)).toBe(evidenceId("note", "n1", null));
    expect(evidenceId("note", "n1", null)).not.toBe(evidenceId("note", "n2", null));
  });
});

describe("ingestion d'une note", () => {
  it("produit une preuve de granularité matière quand le curriculum ne dit rien", async () => {
    await ingererNoteCommePreuve(evenement({}));

    expect(mockPrisma.learningEvidence.upsert).toHaveBeenCalledTimes(1);
    const appel = mockPrisma.learningEvidence.upsert.mock.calls[0][0];
    expect(appel.create.competenceId).toBeNull();
    expect(appel.create.matiereId).toBe("matiere1");
    expect(appel.create.masterySignal).toBeCloseTo(0.7);
  });

  it("produit une preuve par compétence rattachée à l'évaluation", async () => {
    mockPrisma.evaluationCompetence.findMany.mockResolvedValue([
      { competenceId: "c1", poids: 0.6 },
      { competenceId: "c2", poids: 0.4 },
    ]);

    await ingererNoteCommePreuve(evenement({}));

    expect(mockPrisma.learningEvidence.upsert).toHaveBeenCalledTimes(2);
    const ids = mockPrisma.learningEvidence.upsert.mock.calls.map((c) => c[0].create.competenceId);
    expect(ids).toEqual(["c1", "c2"]);
  });

  it("répartit le poids entre les compétences d'une même évaluation", async () => {
    mockPrisma.evaluationCompetence.findMany.mockResolvedValue([
      { competenceId: "c1", poids: 0.6 },
      { competenceId: "c2", poids: 0.4 },
    ]);

    await ingererNoteCommePreuve(evenement({ coefficient: 2 }));

    const poids = mockPrisma.learningEvidence.upsert.mock.calls.map((c) => c[0].create.weight);
    expect(poids[0]).toBeCloseTo(1.2); // 2 × 0,6
    expect(poids[1]).toBeCloseTo(0.8); // 2 × 0,4
  });

  // La livraison des événements est « au moins une fois » : rejouer le même
  // fait doit mettre à jour la preuve, jamais en créer une seconde.
  it("est idempotent — un rejeu vise le même identifiant", async () => {
    await ingererNoteCommePreuve(evenement({}));
    await ingererNoteCommePreuve(evenement({}));

    const premier = mockPrisma.learningEvidence.upsert.mock.calls[0][0].where.id;
    const second = mockPrisma.learningEvidence.upsert.mock.calls[1][0].where.id;
    expect(second).toBe(premier);
  });

  it("propage tenant et site pour l'isolation", async () => {
    await ingererNoteCommePreuve(evenement({}));

    const appel = mockPrisma.learningEvidence.upsert.mock.calls[0][0];
    expect(appel.create.tenantId).toBe("tenant1");
    expect(appel.create.siteId).toBe("site1");
  });

  it("ne cherche pas de compétence quand la note n'est liée à aucune évaluation", async () => {
    await ingererNoteCommePreuve(evenement({ evaluationId: null }));

    expect(mockPrisma.evaluationCompetence.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.learningEvidence.upsert).toHaveBeenCalledTimes(1);
  });

  it("borne la recherche de rattachements au tenant de l'événement", async () => {
    await ingererNoteCommePreuve(evenement({}));

    expect(mockPrisma.evaluationCompetence.findMany.mock.calls[0][0].where.tenantId).toBe("tenant1");
  });

  // Un score seul ne dit pas POURQUOI l'élève a échoué. Inventer un type
  // d'erreur ici produirait une donnée fausse mais crédible — pire que rien.
  it("laisse le type d'erreur non renseigné : le score seul ne le dit pas", async () => {
    await ingererNoteCommePreuve(evenement({ valeur: 3 }));

    const appel = mockPrisma.learningEvidence.upsert.mock.calls[0][0];
    expect(appel.create.errorType).toBeNull();
    expect(appel.create.errorConfidence).toBeNull();
  });

  it("conserve la note brute et le barème pour la traçabilité", async () => {
    await ingererNoteCommePreuve(evenement({ valeur: 12, noteMax: 20 }));

    const appel = mockPrisma.learningEvidence.upsert.mock.calls[0][0];
    expect(appel.create.rawScore).toBe(12);
    expect(appel.create.maxScore).toBe(20);
    expect(appel.create.sourceType).toBe("note");
    expect(appel.create.sourceId).toBe("note1");
  });

  // Un payload amputé signale un défaut de publication, pas une situation
  // métier : mieux vaut échouer (l'événement est retenté, l'anomalie remonte)
  // qu'écrire une preuve incohérente.
  it("refuse un payload incomplet au lieu d'écrire une preuve douteuse", async () => {
    await expect(
      ingererNoteCommePreuve({ ...evenement({}), payload: { eleveId: "e1" } })
    ).rejects.toThrow(/incomplet/);

    expect(mockPrisma.learningEvidence.upsert).not.toHaveBeenCalled();
  });
});
