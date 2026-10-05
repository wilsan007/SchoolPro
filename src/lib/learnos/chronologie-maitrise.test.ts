import { describe, it, expect } from "vitest";
import {
  competencesDisponibles,
  construireChronologie,
  matieresDisponibles,
  type PreuveChronologie,
} from "@/lib/learnos/chronologie-maitrise";

const MATHS = { id: "m-maths", nom: "Mathématiques" };
const HISTOIRE = { id: "m-hist", nom: "Histoire" };

let compteur = 0;

// Midi UTC : le jour civil reste le même quel que soit le fuseau du poste.
function preuve(
  jour: string,
  mastery: number | null,
  options: {
    confidence?: number;
    matiere?: typeof MATHS | null;
    competence?: { id: string; code: string; matiere: typeof MATHS } | null;
    type?: string;
  } = {}
): PreuveChronologie {
  const c = options.competence ?? null;
  return {
    id: `p${++compteur}`,
    masterySignal: mastery,
    confidence: options.confidence ?? 0.75,
    occurredAt: `${jour}T12:00:00.000Z`,
    evidenceType: options.type ?? "DEVOIR",
    competence: c
      ? { id: c.id, code: c.code, libelle: `Libellé ${c.code}`, chapitre: { matiere: c.matiere } }
      : null,
    matiere: options.matiere === undefined ? (c ? null : MATHS) : options.matiere,
  };
}

const FRACTIONS = { id: "c-frac", code: "M1", matiere: MATHS };
const GEOMETRIE = { id: "c-geo", code: "M2", matiere: MATHS };

const TOUT = { matiereId: null, competenceId: null };

describe("construireChronologie", () => {
  it("résume les preuves d'un même jour en un seul point moyen", () => {
    const serie = construireChronologie(
      [preuve("2025-11-15", 0.66), preuve("2025-11-15", 0.76), preuve("2025-11-15", 0.71)],
      TOUT
    );
    expect(serie).toHaveLength(1);
    expect(serie[0].mastery).toBe(71);
    expect(serie[0].nbPreuves).toBe(3);
  });

  it("donne une clé unique à chaque point, y compris pour des preuves du même jour", () => {
    const preuves = [
      preuve("2025-11-15", 0.4, { competence: FRACTIONS }),
      preuve("2025-11-15", 0.9, { competence: FRACTIONS }),
      preuve("2025-11-20", 0.6, { competence: FRACTIONS }),
    ];
    for (const filtre of [TOUT, { matiereId: MATHS.id, competenceId: FRACTIONS.id }]) {
      const cles = construireChronologie(preuves, filtre).map((p) => p.cle);
      expect(new Set(cles).size).toBe(cles.length);
    }
  });

  it("trace un point par preuve quand une compétence est choisie", () => {
    const serie = construireChronologie(
      [
        preuve("2025-11-15", 0.4, { competence: FRACTIONS, type: "QUIZ" }),
        preuve("2025-11-15", 0.9, { competence: FRACTIONS, type: "EXAMEN" }),
        preuve("2025-11-15", 0.2, { competence: GEOMETRIE }),
      ],
      { matiereId: MATHS.id, competenceId: FRACTIONS.id }
    );
    expect(serie.map((p) => p.mastery)).toEqual([40, 90]);
    expect(serie.map((p) => p.evidenceType)).toEqual(["QUIZ", "EXAMEN"]);
    expect(serie[0].competence).toEqual({ code: "M1", libelle: "Libellé M1" });
  });

  it("filtre par matière, que celle-ci vienne de la preuve ou de sa compétence", () => {
    const serie = construireChronologie(
      [
        preuve("2025-10-01", 0.5, { matiere: MATHS }),
        preuve("2025-10-02", 0.7, { competence: FRACTIONS }),
        preuve("2025-10-03", 0.1, { matiere: HISTOIRE }),
      ],
      { matiereId: MATHS.id, competenceId: null }
    );
    expect(serie.map((p) => p.mastery)).toEqual([50, 70]);
    expect(serie.every((p) => p.matieres.join() === "Mathématiques")).toBe(true);
  });

  it("écarte les preuves sans signal au lieu de les compter à zéro", () => {
    const serie = construireChronologie(
      [preuve("2025-11-15", 0.8), preuve("2025-11-15", null)],
      TOUT
    );
    expect(serie[0].mastery).toBe(80);
    expect(serie[0].nbPreuves).toBe(1);
  });

  it("rend les points dans l'ordre chronologique quelle que soit l'entrée", () => {
    const serie = construireChronologie(
      [preuve("2025-12-01", 0.3), preuve("2025-09-25", 0.9), preuve("2025-10-06", 0.6)],
      TOUT
    );
    expect(serie.map((p) => p.mastery)).toEqual([90, 60, 30]);
  });

  it("liste les matières couvertes par un jour en vue globale", () => {
    const serie = construireChronologie(
      [preuve("2025-11-15", 0.6, { matiere: MATHS }), preuve("2025-11-15", 0.8, { matiere: HISTOIRE })],
      TOUT
    );
    expect(serie[0].matieres).toEqual(["Histoire", "Mathématiques"]);
    expect(serie[0].competence).toBeNull();
    expect(serie[0].evidenceType).toBeNull();
  });
});

describe("options de filtre", () => {
  const preuves = [
    preuve("2025-10-01", 0.5, { matiere: HISTOIRE }),
    preuve("2025-10-02", 0.7, { competence: GEOMETRIE }),
    preuve("2025-10-03", 0.7, { competence: FRACTIONS }),
    preuve("2025-10-04", 0.7, { competence: FRACTIONS }),
  ];

  it("propose chaque matière une fois, triée par nom", () => {
    expect(matieresDisponibles(preuves).map((m) => m.nom)).toEqual(["Histoire", "Mathématiques"]);
  });

  it("ne propose que les compétences de la matière choisie", () => {
    expect(competencesDisponibles(preuves, MATHS.id).map((c) => c.code)).toEqual(["M1", "M2"]);
    expect(competencesDisponibles(preuves, HISTOIRE.id)).toEqual([]);
  });
});
