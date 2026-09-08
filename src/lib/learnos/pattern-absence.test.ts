import { describe, it, expect } from "vitest";
import { periodeDuMois, detecterConcentration } from "./pattern-absence";

// On teste les fonctions pures exportées indirectement via les utilitaires.
// Les fonctions de base de données sont testées via l'intégration.

describe("pattern-absence — utilitaires purs", () => {
  describe("periodeDuMois", () => {
    it("retourne 'Début' pour les jours 1-10", () => {
      expect(periodeDuMois(1)).toBe("Début");
      expect(periodeDuMois(5)).toBe("Début");
      expect(periodeDuMois(10)).toBe("Début");
    });

    it("retourne 'Milieu' pour les jours 11-20", () => {
      expect(periodeDuMois(11)).toBe("Milieu");
      expect(periodeDuMois(15)).toBe("Milieu");
      expect(periodeDuMois(20)).toBe("Milieu");
    });

    it("retourne 'Fin' pour les jours 21-31", () => {
      expect(periodeDuMois(21)).toBe("Fin");
      expect(periodeDuMois(25)).toBe("Fin");
      expect(periodeDuMois(31)).toBe("Fin");
    });
  });

  describe("detecterConcentration", () => {
    it("retourne vide si total < seuil minimum", () => {
      const dist = new Map([["Lundi", 2]]);
      const resultats = detecterConcentration(dist, 2);
      expect(resultats).toEqual([]);
    });

    it("détecte une concentration récurrente ≥ 40%", () => {
      const dist = new Map([
        ["Lundi", 5],
        ["Mardi", 2],
        ["Mercredi", 1],
      ]);
      const resultats = detecterConcentration(dist, 8);
      const lundi = resultats.find((r) => r.valeur === "Lundi");
      expect(lundi).toBeDefined();
      expect(lundi!.count).toBe(5);
      expect(lundi!.concentration).toBeCloseTo(0.625, 3);
      expect(lundi!.recurrent).toBe(true);
    });

    it("marque non-récurrent si concentration < 40%", () => {
      const dist = new Map([
        ["Lundi", 3],
        ["Mardi", 3],
        ["Mercredi", 3],
      ]);
      const resultats = detecterConcentration(dist, 9);
      // Chaque jour = 33%, sous le seuil de 40%
      for (const r of resultats) {
        expect(r.recurrent).toBe(false);
      }
    });

    it("marque non-récurrent si count < 3 même avec concentration élevée", () => {
      const dist = new Map([
        ["Lundi", 2],
        ["Mardi", 1],
      ]);
      const resultats = detecterConcentration(dist, 3);
      const lundi = resultats.find((r) => r.valeur === "Lundi");
      expect(lundi!.concentration).toBeCloseTo(0.667, 2);
      expect(lundi!.recurrent).toBe(false); // count < 3
    });

    it("trie par count décroissant", () => {
      const dist = new Map([
        ["Mercredi", 1],
        ["Lundi", 5],
        ["Mardi", 3],
      ]);
      const resultats = detecterConcentration(dist, 9);
      expect(resultats[0].valeur).toBe("Lundi");
      expect(resultats[1].valeur).toBe("Mardi");
      expect(resultats[2].valeur).toBe("Mercredi");
    });
  });
});
