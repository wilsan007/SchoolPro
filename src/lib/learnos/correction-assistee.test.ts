import { describe, it, expect } from "vitest";

import {
  LONGUEUR_MAX_REPONSE,
  SEUIL_CONFIANCE,
  construireProposition,
} from "@/lib/learnos/entrainement/correction-assistee";
import { parseGrille } from "@/lib/learnos/entrainement/grille-correction";

/**
 * Ces tests portent les trois règles non négociables de la correction assistée
 * (AGENTS.md) :
 *   1. le modèle ne décide pas ;
 *   2. le score se recalcule depuis la grille, il ne se lit pas ;
 *   3. dans le doute, on s'abstient — jamais « fausse » par défaut.
 */

const GRILLE = parseGrille({
  criteres: [
    { id: "c1", libelle: "Problématique claire", points: 2 },
    { id: "c2", libelle: "Plan en trois parties", points: 2 },
    { id: "c3", libelle: "Exemple pertinent", points: 1 },
  ],
})!;

function sortie(over: Record<string, unknown> = {}) {
  return {
    criteres: [
      { id: "c1", reussi: true, justification: "ok", confiance: 0.9 },
      { id: "c2", reussi: false, justification: "deux parties", confiance: 0.9 },
      { id: "c3", reussi: true, justification: "ok", confiance: 0.9 },
    ],
    confianceGlobale: 0.9,
    ...over,
  };
}

describe("construireProposition — règle 2 : le score se recalcule", () => {
  it("calcule le score depuis les critères réussis, avec les points de la GRILLE", () => {
    const p = construireProposition(GRILLE, sortie())!;
    expect(p.criteresReussis).toEqual(["c1", "c3"]);
    expect(p.score).toBe(3);
    expect(p.maxScore).toBe(5);
  });

  it("ignore un total annoncé par le modèle, quel qu'il soit", () => {
    for (const champ of ["score", "total", "note", "scoreTotal"]) {
      const p = construireProposition(GRILLE, sortie({ [champ]: 999 }))!;
      expect(p.score).toBe(3);
    }
  });

  it("ignore un critère fabriqué : il ne rapporte rien", () => {
    const p = construireProposition(
      GRILLE,
      sortie({
        criteres: [
          { id: "c1", reussi: true, confiance: 0.9 },
          { id: "c2", reussi: true, confiance: 0.9 },
          { id: "c3", reussi: true, confiance: 0.9 },
          { id: "inventé", reussi: true, confiance: 0.9 },
        ],
      })
    )!;
    expect(p.score).toBe(5);
    expect(p.criteresReussis).not.toContain("inventé");
    expect(p.motifs).toContain("critere_inconnu_ignore");
  });

  it("ne compte pas deux fois un critère répété", () => {
    const p = construireProposition(
      GRILLE,
      sortie({
        criteres: [
          { id: "c1", reussi: true, confiance: 0.9 },
          { id: "c1", reussi: true, confiance: 0.9 },
          { id: "c2", reussi: false, confiance: 0.9 },
          { id: "c3", reussi: false, confiance: 0.9 },
        ],
      })
    )!;
    expect(p.score).toBe(2);
  });

  it("ne dépasse jamais le barème de la grille", () => {
    const p = construireProposition(
      GRILLE,
      sortie({
        criteres: GRILLE.criteres.map((c) => ({ id: c.id, reussi: true, confiance: 0.95 })),
      })
    )!;
    expect(p.score).toBeLessThanOrEqual(p.maxScore);
  });

  it("accepte la sortie d'un appel d'outil sous forme de chaîne JSON", () => {
    const p = construireProposition(GRILLE, JSON.stringify(sortie()))!;
    expect(p.score).toBe(3);
  });
});

describe("construireProposition — règle 3 : dans le doute, on s'abstient", () => {
  it("marque INCERTAINE une proposition à confiance globale basse", () => {
    const p = construireProposition(GRILLE, sortie({ confianceGlobale: SEUIL_CONFIANCE - 0.05 }))!;
    expect(p.statut).toBe("INCERTAINE");
    expect(p.motifs).toContain("confiance_insuffisante");
  });

  it("marque INCERTAINE si UN seul critère est à confiance basse : une somme douteuse l'est", () => {
    const p = construireProposition(
      GRILLE,
      sortie({
        criteres: [
          { id: "c1", reussi: true, confiance: 0.95 },
          { id: "c2", reussi: false, confiance: 0.3 },
          { id: "c3", reussi: true, confiance: 0.95 },
        ],
      })
    )!;
    expect(p.statut).toBe("INCERTAINE");
    expect(p.confiance).toBe(0.3);
  });
});

describe("construireProposition — règle 3 (suite)", () => {
  it("croit le modèle qui déclare hésiter", () => {
    const p = construireProposition(GRILLE, sortie({ ambigu: true, questionVerification: "Pourquoi ?" }))!;
    expect(p.statut).toBe("INCERTAINE");
    expect(p.motifs).toContain("ambigu_declare");
    expect(p.questionVerification).toBe("Pourquoi ?");
  });

  it("ne compte pas à zéro un critère que le modèle n'a pas évalué", () => {
    const p = construireProposition(
      GRILLE,
      sortie({ criteres: [{ id: "c1", reussi: true, confiance: 0.9 }] })
    )!;
    expect(p.statut).toBe("INCERTAINE");
    expect(p.motifs).toContain("critere_non_evalue");
    // c2 et c3 ne sont ni réussis ni « ratés » : ils sont absents du détail.
    expect(p.details.map((d) => d.id)).toEqual(["c1"]);
  });

  it("garde une proposition sûre à A_VALIDER, jamais validée d'office", () => {
    expect(construireProposition(GRILLE, sortie())!.statut).toBe("A_VALIDER");
  });

  it("n'expose jamais de statut VALIDEE : seul un adulte valide", () => {
    for (const confiance of [0.1, 0.5, 0.7, 0.99]) {
      const p = construireProposition(GRILLE, sortie({ confianceGlobale: confiance }))!;
      expect(["A_VALIDER", "INCERTAINE"]).toContain(p.statut);
    }
  });
});

describe("construireProposition — règle 1 : sortie validée, pas crue", () => {
  it("rend null pour du JSON invalide, sans lever", () => {
    expect(construireProposition(GRILLE, "ceci n'est pas du json")).toBeNull();
  });

  it("rend null pour un schéma non respecté", () => {
    expect(construireProposition(GRILLE, { criteres: "non" })).toBeNull();
    expect(construireProposition(GRILLE, { criteres: [], confianceGlobale: 0.9 })).toBeNull();
    expect(construireProposition(GRILLE, {})).toBeNull();
    expect(construireProposition(GRILLE, null)).toBeNull();
  });

  it("rend null pour une confiance hors [0,1]", () => {
    expect(construireProposition(GRILLE, sortie({ confianceGlobale: 1.5 }))).toBeNull();
    expect(construireProposition(GRILLE, sortie({ confianceGlobale: -0.1 }))).toBeNull();
  });

  it("rend null pour un type d'erreur inconnu", () => {
    expect(
      construireProposition(GRILLE, sortie({ erreurs: [{ type: "INVENTE", description: "x" }] }))
    ).toBeNull();
  });

  it("conserve les erreurs valides et l'explication", () => {
    const p = construireProposition(
      GRILLE,
      sortie({
        erreurs: [{ type: "ARGUMENT_UNJUSTIFIED", description: "affirme sans preuve" }],
        explication: "  Il manque une partie.  ",
      })
    )!;
    expect(p.erreurs).toEqual([{ type: "ARGUMENT_UNJUSTIFIED", description: "affirme sans preuve" }]);
    expect(p.explication).toBe("Il manque une partie.");
  });
});

describe("constantes", () => {
  it("borne la longueur d'une réponse et fixe un seuil raisonnable", () => {
    expect(LONGUEUR_MAX_REPONSE).toBeGreaterThan(0);
    expect(SEUIL_CONFIANCE).toBeGreaterThan(0);
    expect(SEUIL_CONFIANCE).toBeLessThan(1);
  });
});

