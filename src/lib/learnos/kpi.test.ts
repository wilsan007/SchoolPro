import { describe, it, expect } from "vitest";
import { construireKpi } from "@/lib/learnos/kpi";

/**
 * La logique de sens est ce qui distingue un indicateur utile d'un indicateur
 * trompeur : l'inverser signalerait les situations saines et masquerait les
 * problèmes réels.
 */
describe("sens d'alerte", () => {
  it("alerte quand un indicateur « plus c'est haut, mieux c'est » passe sous le seuil", () => {
    expect(construireKpi("c", 62, "pourcentage", "hautEstBon", 80, undefined).alerte).toBe(true);
    expect(construireKpi("c", 85, "pourcentage", "hautEstBon", 80, undefined).alerte).toBe(false);
  });

  it("alerte quand un indicateur « plus c'est bas, mieux c'est » dépasse le seuil", () => {
    expect(construireKpi("c", 3, "nombre", "basEstBon", 0, undefined).alerte).toBe(true);
    expect(construireKpi("c", 0, "nombre", "basEstBon", 0, undefined).alerte).toBe(false);
  });

  // Un indicateur sans seuil est informatif, pas actionnable : il ne doit
  // jamais crier.
  it("n'alerte jamais sans seuil défini", () => {
    expect(construireKpi("c", 999, "nombre", "basEstBon", undefined, undefined).alerte).toBe(false);
  });
});

describe("variation", () => {
  // `null` et non `0` : afficher « stable » sans historique serait une
  // conclusion qu'on n'a pas les moyens de tirer.
  it("reste indéterminée sans historique", () => {
    expect(construireKpi("c", 62, "pourcentage", "hautEstBon", 80, undefined).variation).toBeNull();
  });

  it("mesure l'écart avec la dernière photographie", () => {
    expect(construireKpi("c", 62, "pourcentage", "hautEstBon", 80, 71).variation).toBe(-9);
    expect(construireKpi("c", 80, "pourcentage", "hautEstBon", 80, 71).variation).toBe(9);
  });
});
