import { describe, it, expect } from "vitest";

import { parseStructure } from "@/lib/learnos/entrainement";
import {
  depuisParties,
  depuisStructure,
  etapeVierge,
  partiesVierges,
  versStructure,
  type EtapeSaisie,
  type PartieSaisie,
} from "@/components/learnos/EditeurQuestion";

/**
 * L'éditeur promet de ne produire que des structures que le serveur accepte
 * (cf. l'en-tête d'`EditeurQuestion`). Ces tests tiennent cette promesse pour le
 * dossier : ce que `versStructure` écrit, `parseStructure` doit le lire.
 */

function etape(partie: string, enonce: string, reponse = "1"): EtapeSaisie {
  return { ...etapeVierge("SAISIE_COURTE", partie), enonce, reponse };
}

const PARTIES: PartieSaisie[] = [
  { id: "p1", titre: "Dérivée", but: "Calculer f'(x)" },
  { id: "p2", titre: "Variations" },
  { id: "p3", titre: "Extremum" },
];

describe("versStructure — dossier", () => {
  it("produit une structure que parseStructure accepte", () => {
    const structure = versStructure(
      [etape("p1", "a"), etape("p1", "b"), etape("p2", "c"), etape("p3", "d")],
      PARTIES
    );
    const lue = parseStructure(structure);
    expect(lue).not.toBeNull();
    expect(lue?.parties).toHaveLength(3);
    expect(lue?.etapes.map((e) => e.partie)).toEqual(["p1", "p1", "p2", "p3"]);
  });

  it("range les étapes partie par partie, même saisies dans le désordre", () => {
    // L'enseignant a ajouté une étape de la partie 1 après celles des parties 2 et 3 :
    // le serveur exige des parties contiguës, l'éditeur ne doit pas lui laisser le soin d'y veiller.
    const structure = versStructure(
      [etape("p2", "c"), etape("p3", "d"), etape("p1", "a"), etape("p1", "b")],
      PARTIES
    );
    expect(structure.etapes.map((e) => e.enonce)).toEqual(["a", "b", "c", "d"]);
    expect(parseStructure(structure)).not.toBeNull();
  });

  it("conserve l'ordre de saisie à l'intérieur d'une même partie", () => {
    const structure = versStructure(
      [etape("p1", "z"), etape("p2", "y"), etape("p1", "x"), etape("p3", "w")],
      PARTIES
    );
    expect(structure.etapes.map((e) => e.enonce)).toEqual(["z", "x", "y", "w"]);
  });

  it("omet le but vide et rogne les titres", () => {
    const structure = versStructure(
      [etape("p1", "a"), etape("p2", "b")],
      [
        { id: "p1", titre: "  Dérivée  ", but: "   " },
        { id: "p2", titre: "Suite" },
      ]
    );
    expect(structure.parties?.[0]).toEqual({ id: "p1", titre: "Dérivée" });
  });

  it("ne produit aucune partie pour un exercice ordinaire", () => {
    const structure = versStructure([etape("p1", "a"), etape("p1", "b")]);
    expect(structure.parties).toBeUndefined();
    expect(structure.etapes.every((e) => !("partie" in e))).toBe(true);
    expect(parseStructure(structure)).not.toBeNull();
  });

  it("traite une liste de parties vide comme un exercice ordinaire", () => {
    const structure = versStructure([etape("p1", "a")], []);
    expect(structure.parties).toBeUndefined();
  });

  it("produit une structure refusée par le serveur quand une partie est laissée vide", () => {
    // Le serveur reste le juge : une partie sans étape est refusée, pas devinée.
    const structure = versStructure([etape("p1", "a"), etape("p1", "b")], PARTIES);
    expect(parseStructure(structure)).toBeNull();
  });
});

describe("relecture d'un dossier", () => {
  it("relit parties et étapes sans rien perdre, et les réécrit à l'identique", () => {
    const origine = versStructure(
      [etape("p1", "a"), etape("p2", "b"), etape("p3", "c")],
      PARTIES
    );
    const reecrite = versStructure(depuisStructure(origine), depuisParties(origine));
    expect(reecrite).toEqual(origine);
  });

  it("ne relit aucune partie hors dossier", () => {
    expect(depuisParties({ etapes: [] })).toEqual([]);
    expect(depuisParties(null)).toEqual([]);
    expect(depuisParties({ parties: "n'importe quoi" })).toEqual([]);
  });

  it("ignore une partie sans identifiant plutôt que de planter", () => {
    expect(depuisParties({ parties: [{ titre: "x" }, { id: "p1", titre: "ok" }] })).toEqual([
      { id: "p1", titre: "ok", but: undefined },
    ]);
  });

  it("démarre un dossier avec deux parties", () => {
    expect(partiesVierges()).toHaveLength(2);
  });
});
