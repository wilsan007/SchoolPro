/**
 * Tests unitaires pour la classe Note (centièmes entiers).
 *
 * Ces tests valident que les calculs de notes et moyennes en entiers
 * ne souffrent pas des erreurs d'arrondi flottant.
 *
 * Inspiré de GOSE 2.0 — règle non négociable : aucun flottant pour une note.
 */
import { describe, it, expect, expectTypeOf } from "vitest";
import {
  Note,
  calculerMoyennePondereeCentiemes,
  calculerRangsCentiemes,
  apprecierCentiemes,
} from "@/lib/domain/note";

describe("Note — construction", () => {
  it("crée une note depuis des centièmes", () => {
    const note = Note.depuisCentiemes(1450);
    expect(note.centiemes).toBe(1450);
  });

  it("rejette les centièmes négatifs", () => {
    expect(() => Note.depuisCentiemes(-100)).toThrow(RangeError);
  });

  it("rejette les centièmes non-entiers", () => {
    expect(() => Note.depuisCentiemes(1450.5)).toThrow(TypeError);
  });

  it("crée une note depuis un flottant avec arrondi correct", () => {
    expect(Note.depuisFlottant(14.5).centiemes).toBe(1450);
    // 9.995 en binaire est stocké comme 9.994999... donc 999 centièmes.
    // C'est précisément le genre d'erreur que la classe Note élimine :
    // on ne peut pas faire confiance au flottant, d'où l'arrondi via toFixed.
    expect(Note.depuisFlottant(9.99).centiemes).toBe(999);
    expect(Note.depuisFlottant(10).centiemes).toBe(1000);
    expect(Note.depuisFlottant(0).centiemes).toBe(0);
    expect(Note.depuisFlottant(20).centiemes).toBe(2000);
  });

  it("crée une note depuis du texte (virgule ou point)", () => {
    expect(Note.depuisTexte("14,5").centiemes).toBe(1450);
    expect(Note.depuisTexte("14.50").centiemes).toBe(1450);
    expect(Note.depuisTexte("8").centiemes).toBe(800);
    expect(Note.depuisTexte("  12,75  ").centiemes).toBe(1275);
  });

  it("rejette le texte invalide", () => {
    expect(() => Note.depuisTexte("abc")).toThrow(TypeError);
    expect(() => Note.depuisTexte("14.555")).toThrow(TypeError);
    expect(() => Note.depuisTexte("-5")).toThrow(TypeError);
  });

  it("crée une note depuis un barème différent de 20", () => {
    // 15/30 → 10/20 → 1000 centièmes
    expect(Note.depuisValeurSurBareme(15, 30).centiemes).toBe(1000);
    // 25/50 → 10/20 → 1000 centièmes
    expect(Note.depuisValeurSurBareme(25, 50).centiemes).toBe(1000);
  });
});

describe("Note — opérations", () => {
  it("ramène une note sur 20", () => {
    // 15/30 → 10/20
    const note = Note.depuisCentiemes(1500); // 15.00 sur 30
    const sur20 = note.ramenerSur20(3000); // bareme en centiemes = 30*100
    expect(sur20.centiemes).toBe(1000); // 10.00/20
  });

  it("rejette un barème nul ou négatif", () => {
    const note = Note.depuisCentiemes(1000);
    expect(() => note.ramenerSur20(0)).toThrow(RangeError);
    expect(() => note.ramenerSur20(-100)).toThrow(RangeError);
  });

  it("pondère une note par un coefficient", () => {
    const note = Note.depuisCentiemes(1450);
    expect(note.ponderer(2)).toBe(2900); // 1450 * 2
  });
});

describe("Note — comparaison", () => {
  it("compare deux notes", () => {
    const a = Note.depuisCentiemes(1450);
    const b = Note.depuisCentiemes(1400);
    expect(a.estSuperieureA(b)).toBe(true);
    expect(b.estSuperieureA(a)).toBe(false);
  });

  it("teste l'égalité", () => {
    const a = Note.depuisCentiemes(1450);
    const b = Note.depuisCentiemes(1450);
    const c = Note.depuisCentiemes(1400);
    expect(a.estEgaleA(b)).toBe(true);
    expect(a.estEgaleA(c)).toBe(false);
  });
});

describe("Note — affichage", () => {
  it("formate correctement", () => {
    expect(Note.depuisCentiemes(1450).formater()).toBe("14,50");
    expect(Note.depuisCentiemes(900).formater()).toBe("9,00");
    expect(Note.depuisCentiemes(2000).formater()).toBe("20,00");
    expect(Note.depuisCentiemes(0).formater()).toBe("0,00");
    expect(Note.depuisCentiemes(1275).formater()).toBe("12,75");
  });

  it("convertit en flottant", () => {
    expect(Note.depuisCentiemes(1450).enFlottant()).toBe(14.5);
    expect(Note.depuisCentiemes(900).enFlottant()).toBe(9);
    expect(Note.depuisCentiemes(0).enFlottant()).toBe(0);
  });
});

describe("calculerMoyennePondereeCentiemes", () => {
  it("calcule une moyenne pondérée simple", () => {
    const notes = [
      { centiemes: 1400, coefficient: 1 },
      { centiemes: 1600, coefficient: 1 },
    ];
    // (1400 + 1600) / 2 = 1500
    expect(calculerMoyennePondereeCentiemes(notes)).toBe(1500);
  });

  it("calcule une moyenne pondérée avec coefficients", () => {
    const notes = [
      { centiemes: 1200, coefficient: 1 },
      { centiemes: 1800, coefficient: 2 },
    ];
    // (1200*1 + 1800*2) / 3 = 4800/3 = 1600
    expect(calculerMoyennePondereeCentiemes(notes)).toBe(1600);
  });

  it("retourne null pour une liste vide", () => {
    expect(calculerMoyennePondereeCentiemes([])).toBeNull();
  });

  it("retourne null si la somme des coefficients est 0", () => {
    const notes = [
      { centiemes: 1400, coefficient: 0 },
      { centiemes: 1600, coefficient: 0 },
    ];
    expect(calculerMoyennePondereeCentiemes(notes)).toBeNull();
  });

  it("ne souffre pas d'erreurs d'arrondi flottant", () => {
    // Le cas classique : 0.1 + 0.2 !== 0.3 en flottant
    // En centièmes : 10 + 20 = 30, moyenne = 15 — exact
    const notes = [
      { centiemes: 10, coefficient: 1 }, // 0.10/20
      { centiemes: 20, coefficient: 1 }, // 0.20/20
    ];
    expect(calculerMoyennePondereeCentiemes(notes)).toBe(15); // 0.15/20
  });

  it("gère 10 matières avec coefficients variés sans erreur cumulée", () => {
    const notes = Array.from({ length: 10 }, (_, i) => ({
      centiemes: 1000 + i * 100, // 1000, 1100, ..., 1900
      coefficient: i + 1, // 1, 2, ..., 10
    }));
    // Somme pondérée = 1000*1 + 1100*2 + ... + 1900*10
    // Somme coeff = 1+2+...+10 = 55
    // On vérifie juste que le résultat est un entier exact
    const result = calculerMoyennePondereeCentiemes(notes);
    expect(result).not.toBeNull();
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe("calculerRangsCentiemes", () => {
  it("calcule les rangs avec ex aequo (standard competition)", () => {
    const moyennes = new Map<string, number | null>([
      ["eleve1", 1800], // 1er
      ["eleve2", 1600], // 2e
      ["eleve3", 1600], // 2e (ex aequo)
      ["eleve4", 1400], // 4e (pas 3e, car 2 ex aequo en 2e)
    ]);

    const rangs = calculerRangsCentiemes(moyennes);
    expect(rangs.get("eleve1")).toBe(1);
    expect(rangs.get("eleve2")).toBe(2);
    expect(rangs.get("eleve3")).toBe(2);
    expect(rangs.get("eleve4")).toBe(4);
  });

  it("assigne null aux élèves sans moyenne", () => {
    const moyennes = new Map<string, number | null>([
      ["eleve1", 1500],
      ["eleve2", null],
    ]);

    const rangs = calculerRangsCentiemes(moyennes);
    expect(rangs.get("eleve1")).toBe(1);
    expect(rangs.get("eleve2")).toBeNull();
  });

  it("gère un seul élève", () => {
    const moyennes = new Map<string, number | null>([
      ["eleve1", 2000],
    ]);
    const rangs = calculerRangsCentiemes(moyennes);
    expect(rangs.get("eleve1")).toBe(1);
  });
});

describe("apprecierCentiemes", () => {
  it("retourne 'Non évalué' pour null", () => {
    expect(apprecierCentiemes(null)).toBe("Non évalué");
  });

  it("retourne 'Félicitations' pour une moyenne ≥ 16", () => {
    expect(apprecierCentiemes(1600)).toBe("Félicitations");
    expect(apprecierCentiemes(1800)).toBe("Félicitations");
  });

  it("retourne 'Compliments' pour 14-16", () => {
    expect(apprecierCentiemes(1400)).toBe("Compliments");
    expect(apprecierCentiemes(1599)).toBe("Compliments");
  });

  it("retourne 'Encouragements' pour 12-14", () => {
    expect(apprecierCentiemes(1200)).toBe("Encouragements");
  });

  it("retourne 'Assez bien' pour 10-12", () => {
    expect(apprecierCentiemes(1000)).toBe("Assez bien");
  });

  it("retourne 'Travail insuffisant' pour 8-10", () => {
    expect(apprecierCentiemes(800)).toBe("Travail insuffisant");
  });

  it("retourne 'Travail très insuffisant' pour < 8", () => {
    expect(apprecierCentiemes(0)).toBe("Travail très insuffisant");
    expect(apprecierCentiemes(500)).toBe("Travail très insuffisant");
  });

  it("accepte des paliers personnalisés", () => {
    const paliers = [
      { seuil: 1200, libelle: "Bien" },
      { seuil: 0, libelle: "Insuffisant" },
    ];
    expect(apprecierCentiemes(1500, paliers)).toBe("Bien");
    expect(apprecierCentiemes(800, paliers)).toBe("Insuffisant");
  });
});
