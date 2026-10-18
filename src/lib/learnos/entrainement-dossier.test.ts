import { describe, it, expect } from "vitest";
import { ErrorType } from "@prisma/client";

import {
  MAX_ETAPES,
  MAX_PARTIES,
  TYPES_ERREUR_GRILLE,
  corrigerEtape,
  corrigerEtapeDetaillee,
  grilleCoherente,
  parseGrille,
  parseStructure,
  scoreDepuisCriteres,
  totalGrille,
  vueEleve,
  type EtapeQuestion,
} from "@/lib/learnos/entrainement";

// ------------------------------------------------------------
// Fabriques
// ------------------------------------------------------------

function saisie(partie: string | undefined, reponse = "12", enonce = "Combien ?"): Record<string, unknown> {
  return {
    ...(partie ? { partie } : {}),
    enonce,
    format: "SAISIE_COURTE",
    reponse,
    points: 1,
  };
}

const PARTIES = [
  { id: "p1", titre: "Dérivée", but: "Calculer f'(x)." },
  { id: "p2", titre: "Variations" },
  { id: "p3", titre: "Extremum" },
];

function dossier(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    parties: PARTIES,
    etapes: [saisie("p1"), saisie("p1"), saisie("p2"), saisie("p3")],
    ...over,
  };
}

function appariement(): EtapeQuestion {
  return {
    enonce: "Relie",
    format: "APPARIEMENT",
    paires: [
      { id: "p1", gauche: "1/2", droite: "0,5" },
      { id: "p2", gauche: "1/4", droite: "0,25" },
      { id: "p3", gauche: "3/5", droite: "0,6" },
    ],
    reponse: "p1:p1|p2:p2|p3:p3",
    points: 1,
  };
}

function faite(index: number) {
  return { index, reponse: "12", correcte: true, tentatives: 1, credit: 1, erreur: null, dureeMs: 5000 };
}

// ------------------------------------------------------------
// parseStructure — dossier
// ------------------------------------------------------------

describe("parseStructure — dossier", () => {
  it("accepte un dossier cohérent et conserve les parties", () => {
    const lue = parseStructure(dossier());
    expect(lue?.etapes).toHaveLength(4);
    expect(lue?.parties?.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(lue?.etapes.map((e) => e.partie)).toEqual(["p1", "p1", "p2", "p3"]);
  });

  it("ne change rien pour un exercice ordinaire (sans parties)", () => {
    const lue = parseStructure({ etapes: [saisie(undefined), saisie(undefined)] });
    expect(lue).not.toBeNull();
    expect(lue?.parties).toBeUndefined();
    expect(lue?.etapes[0].partie).toBeUndefined();
  });

  it("refuse une étape qui désigne une partie inexistante", () => {
    expect(
      parseStructure(dossier({ etapes: [saisie("p1"), saisie("pX"), saisie("p2"), saisie("p3")] }))
    ).toBeNull();
  });

  it("refuse une étape sans partie dans un dossier", () => {
    expect(
      parseStructure(dossier({ etapes: [saisie("p1"), saisie(undefined), saisie("p2"), saisie("p3")] }))
    ).toBeNull();
  });

  it("refuse une partie rattachée sans que le dossier déclare de parties", () => {
    expect(parseStructure({ etapes: [saisie("p1"), saisie("p2")] })).toBeNull();
  });

  it("refuse une partie vide (déclarée, jamais atteinte)", () => {
    expect(parseStructure(dossier({ etapes: [saisie("p1"), saisie("p1"), saisie("p2")] }))).toBeNull();
  });

  it("refuse des étapes qui reviennent dans une partie déjà quittée", () => {
    expect(
      parseStructure(dossier({ etapes: [saisie("p1"), saisie("p2"), saisie("p1"), saisie("p3")] }))
    ).toBeNull();
  });

  it("refuse de sauter une partie", () => {
    expect(parseStructure(dossier({ etapes: [saisie("p1"), saisie("p3"), saisie("p3")] }))).toBeNull();
  });

  it("refuse un dossier à une seule partie : il ne découpe rien", () => {
    expect(parseStructure({ parties: [PARTIES[0]], etapes: [saisie("p1"), saisie("p1")] })).toBeNull();
  });

  it("refuse des identifiants de partie en double", () => {
    expect(
      parseStructure({
        parties: [
          { id: "p1", titre: "A" },
          { id: "p1", titre: "B" },
        ],
        etapes: [saisie("p1"), saisie("p1")],
      })
    ).toBeNull();
  });

  it("refuse une partie sans titre", () => {
    expect(
      parseStructure({
        parties: [
          { id: "p1", titre: "  " },
          { id: "p2", titre: "B" },
        ],
        etapes: [saisie("p1"), saisie("p2")],
      })
    ).toBeNull();
  });

  it("refuse plus de parties que le plafond", () => {
    const parties = Array.from({ length: MAX_PARTIES + 1 }, (_, i) => ({ id: `p${i}`, titre: `P${i}` }));
    expect(parseStructure({ parties, etapes: parties.map((p) => saisie(p.id)) })).toBeNull();
  });

  it("accepte exactement le plafond d'étapes et refuse une de plus", () => {
    const pile = Array.from({ length: MAX_ETAPES }, () => saisie(undefined));
    expect(parseStructure({ etapes: pile })).not.toBeNull();
    expect(parseStructure({ etapes: [...pile, saisie(undefined)] })).toBeNull();
  });

  it("valide chaque étape d'un dossier comme une étape ordinaire", () => {
    const sansReponse = { partie: "p2", enonce: "Combien ?", format: "SAISIE_COURTE", points: 1 };
    expect(
      parseStructure(dossier({ etapes: [saisie("p1"), saisie("p1"), sansReponse, saisie("p3")] }))
    ).toBeNull();
  });
});

// ------------------------------------------------------------
// vueEleve — dossier
// ------------------------------------------------------------

describe("vueEleve — dossier", () => {
  const exercice = {
    id: "ex1",
    ordre: 1,
    palier: "APPLICATION",
    regleDeclenchee: "exercice_test",
    motifParams: null,
    competence: { libelle: "Dérivation" },
    question: { enonce: "Étude de f", format: "ETAPES_GUIDEES" as const },
  };
  const structure = parseStructure(dossier())!;

  it("sert tous les titres de parties dès l'ouverture, et la partie courante", () => {
    const vue = vueEleve(exercice, structure, []);
    expect(vue.parties?.map((p) => p.titre)).toEqual(["Dérivée", "Variations", "Extremum"]);
    expect(vue.partieCourante).toBe(0);
  });

  it("avance de partie quand les étapes de la précédente sont closes", () => {
    const vue = vueEleve(exercice, structure, [faite(0), faite(1)]);
    expect(vue.etapeCourante).toBe(2);
    expect(vue.partieCourante).toBe(1);
  });

  it("ne sert que les étapes déjà atteintes, sans corrigé tant qu'elles sont ouvertes", () => {
    const vue = vueEleve(exercice, structure, []);
    expect(vue.etapes).toHaveLength(1);
    expect(vue.etapes[0].corrige).toBeNull();
  });

  it("n'expose aucune partie pour un exercice ordinaire", () => {
    const ordinaire = parseStructure({ etapes: [saisie(undefined)] })!;
    const vue = vueEleve(exercice, ordinaire, []);
    expect(vue.parties).toBeUndefined();
    expect(vue.partieCourante).toBeUndefined();
  });

  it("annonce partieCourante null une fois le dossier fini", () => {
    const vue = vueEleve(exercice, structure, [faite(0), faite(1), faite(2), faite(3)]);
    expect(vue.termine).toBe(true);
    expect(vue.partieCourante).toBeNull();
  });
});

// ------------------------------------------------------------
// corrigerEtapeDetaillee
// ------------------------------------------------------------

const ETAPE_12: EtapeQuestion = { enonce: "x", format: "SAISIE_COURTE", reponse: "12", points: 1 };

describe("corrigerEtapeDetaillee", () => {
  it("ne contredit jamais corrigerEtape sur la décision juste/fausse", () => {
    const cas: [EtapeQuestion, string][] = [
      [ETAPE_12, "12"],
      [ETAPE_12, "13"],
      [appariement(), "p1:p1|p2:p2|p3:p3"],
      [appariement(), "p1:p1|p2:p3|p3:p2"],
      [appariement(), ""],
    ];
    for (const [etape, reponse] of cas) {
      expect(corrigerEtapeDetaillee(etape, reponse).correcte).toBe(corrigerEtape(etape, reponse).correcte);
    }
  });

  it("qualifie une réponse vide de NON_EVALUEE, ni juste ni fausse", () => {
    const r = corrigerEtapeDetaillee(ETAPE_12, "   ");
    expect(r.statut).toBe("NON_EVALUEE");
    expect(r.correcte).toBe(false);
    expect(r.erreur).toBeNull();
  });

  it("qualifie une bonne réponse de JUSTE, quelle que soit la notation", () => {
    const r = corrigerEtapeDetaillee({ ...ETAPE_12, reponse: "0,5" }, "0.50");
    expect(r.statut).toBe("JUSTE");
    expect(r.proportion).toBe(1);
  });

  it("qualifie un appariement à moitié bon de PARTIELLE, sans le déclarer correct", () => {
    const r = corrigerEtapeDetaillee(appariement(), "p1:p1|p2:p3|p3:p2");
    expect(r.statut).toBe("PARTIELLE");
    expect(r.correcte).toBe(false);
    expect(r.proportion).toBeCloseTo(1 / 3, 5);
  });

  it("qualifie un appariement entièrement faux de FAUSSE", () => {
    const r = corrigerEtapeDetaillee(appariement(), "p1:p2|p2:p3|p3:p1");
    expect(r.statut).toBe("FAUSSE");
    expect(r.proportion).toBe(0);
  });

  it("ne qualifie jamais une saisie fausse de PARTIELLE", () => {
    expect(corrigerEtapeDetaillee(ETAPE_12, "13").statut).toBe("FAUSSE");
  });

  it("ne qualifie jamais une remise en ordre fausse de PARTIELLE", () => {
    const ordre: EtapeQuestion = {
      enonce: "x",
      format: "REMISE_EN_ORDRE",
      options: [
        { id: "a", texte: "1" },
        { id: "b", texte: "2" },
        { id: "c", texte: "3" },
      ],
      reponse: "a|b|c",
      points: 1,
    };
    expect(corrigerEtapeDetaillee(ordre, "a|c|b").statut).toBe("FAUSSE");
  });

  it("conserve l'erreur identifiée par corrigerEtape", () => {
    expect(corrigerEtapeDetaillee(ETAPE_12, "13").erreur).toBe("CALCULATION_ERROR");
  });
});


// ------------------------------------------------------------
// Grille de correction
// ------------------------------------------------------------

const GRILLE = {
  criteres: [
    { id: "c1", libelle: "Dérivée correcte", points: 1 },
    { id: "c2", libelle: "Annulation trouvée", points: 1 },
    { id: "c3", libelle: "Sens de variation", points: 2 },
  ],
  erreursAnticipees: [{ type: "CALCULATION_ERROR", description: "Oubli du facteur 2" }],
  explication: "La dérivée d'un trinôme s'annule au sommet.",
};

describe("parseGrille", () => {
  it("accepte une grille complète", () => {
    const lue = parseGrille(GRILLE);
    expect(lue?.criteres).toHaveLength(3);
    expect(lue?.erreursAnticipees[0].type).toBe("CALCULATION_ERROR");
    expect(lue?.explication).toContain("trinôme");
  });

  it("accepte une grille sans erreurs anticipées ni explication", () => {
    const lue = parseGrille({ criteres: GRILLE.criteres });
    expect(lue?.erreursAnticipees).toEqual([]);
    expect(lue?.explication).toBeUndefined();
  });

  it("refuse une grille sans critères", () => {
    expect(parseGrille({ criteres: [] })).toBeNull();
    expect(parseGrille({})).toBeNull();
    expect(parseGrille(null)).toBeNull();
  });

  it("refuse un critère à zéro point ou négatif", () => {
    expect(parseGrille({ criteres: [{ id: "c", libelle: "x", points: 0 }] })).toBeNull();
    expect(parseGrille({ criteres: [{ id: "c", libelle: "x", points: -1 }] })).toBeNull();
  });

  it("refuse des identifiants de critère en double", () => {
    expect(
      parseGrille({
        criteres: [
          { id: "c", libelle: "a", points: 1 },
          { id: "c", libelle: "b", points: 1 },
        ],
      })
    ).toBeNull();
  });

  it("refuse un type d'erreur inconnu", () => {
    expect(
      parseGrille({ criteres: GRILLE.criteres, erreursAnticipees: [{ type: "INVENTE", description: "x" }] })
    ).toBeNull();
  });

  it("refuse plus de vingt critères", () => {
    const criteres = Array.from({ length: 21 }, (_, i) => ({ id: `c${i}`, libelle: "x", points: 1 }));
    expect(parseGrille({ criteres })).toBeNull();
  });
});

describe("grille — barème et score", () => {
  const grille = parseGrille(GRILLE)!;

  it("totalise les points au centième, sans l'erreur du flottant", () => {
    expect(totalGrille(grille)).toBe(4);
    const flottante = parseGrille({
      criteres: [
        { id: "a", libelle: "x", points: 0.1 },
        { id: "b", libelle: "y", points: 0.2 },
      ],
    })!;
    // 0,1 + 0,2 vaut 0,30000000000000004 en flottant brut : le centième l'absorbe.
    expect(totalGrille(flottante)).toBe(0.3);
    expect(grilleCoherente(flottante, 0.3)).toBe(true);
  });

  it("détecte une grille qui ne totalise pas le barème", () => {
    expect(grilleCoherente(grille, 4)).toBe(true);
    expect(grilleCoherente(grille, 5)).toBe(false);
    expect(grilleCoherente(grille, 3)).toBe(false);
  });

  it("recalcule le score depuis les critères réussis", () => {
    expect(scoreDepuisCriteres(grille, ["c1", "c3"])).toBe(3);
    expect(scoreDepuisCriteres(grille, [])).toBe(0);
    expect(scoreDepuisCriteres(grille, ["c1", "c2", "c3"])).toBe(4);
  });

  it("ignore un critère fabriqué et ne compte pas deux fois un doublon", () => {
    expect(scoreDepuisCriteres(grille, ["c1", "c1", "zzz"])).toBe(1);
    expect(scoreDepuisCriteres(grille, ["c1", "c2", "c3", "c1", "c2", "c3"])).toBe(4);
  });
});

describe("types d'erreur de la grille", () => {
  it("reste inclus dans l'enum Prisma (aucune valeur orpheline)", () => {
    const valeurs = Object.values(ErrorType) as string[];
    for (const type of TYPES_ERREUR_GRILLE) {
      expect(valeurs).toContain(type);
    }
  });
});

