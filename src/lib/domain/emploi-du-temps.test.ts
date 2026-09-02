import { describe, it, expect } from "vitest";
import { niveauToNumero, fusionnerCreneauxAdjacents } from "./emploi-du-temps";

// ============================================================
// Tests du domaine : niveauToNumero + fusion des créneaux
// ============================================================

describe("niveauToNumero", () => {
  it("convertit les niveaux numérotés (1ère → 1, 2ème → 2, ...)", () => {
    expect(niveauToNumero("1ère")).toBe("1");
    expect(niveauToNumero("2ème")).toBe("2");
    expect(niveauToNumero("3ème")).toBe("3");
    expect(niveauToNumero("9ème")).toBe("9");
  });

  it("accepte les variantes sans accent (1ere, 2eme)", () => {
    expect(niveauToNumero("1ere")).toBe("1");
    expect(niveauToNumero("2eme")).toBe("2");
  });

  it("convertit les niveaux du lycée français", () => {
    expect(niveauToNumero("Seconde")).toBe("10");
    expect(niveauToNumero("Première")).toBe("11");
    expect(niveauToNumero("Terminale")).toBe("12");
  });

  it("convertit Maternelle → 0", () => {
    expect(niveauToNumero("Maternelle")).toBe("0");
  });

  it("retourne un nombre pur tel quel", () => {
    expect(niveauToNumero("5")).toBe("5");
    expect(niveauToNumero("12")).toBe("12");
  });

  it("retourne une chaîne vide pour un niveau inconnu", () => {
    expect(niveauToNumero("Inconnu")).toBe("");
    expect(niveauToNumero(null)).toBe("");
    expect(niveauToNumero(undefined)).toBe("");
    expect(niveauToNumero("")).toBe("");
  });
});

describe("fusionnerCreneauxAdjacents", () => {
  it("fusionne deux créneaux adjacents de même matière/prof/salle", () => {
    const creneaux = [
      { id: "1", jour: "LUNDI", heureDebut: "08:00", heureFin: "09:00", matiereNom: "Maths", enseignantNom: "M. Ahmed", salle: "Salle 1" },
      { id: "2", jour: "LUNDI", heureDebut: "09:00", heureFin: "10:00", matiereNom: "Maths", enseignantNom: "M. Ahmed", salle: "Salle 1" },
    ];
    const result = fusionnerCreneauxAdjacents(creneaux);
    expect(result).toHaveLength(1);
    expect(result[0].ids).toEqual(["1", "2"]);
    expect(result[0].heureDebut).toBe("08:00");
    expect(result[0].heureFin).toBe("10:00");
  });

  it("ne fusionne pas si la matière est différente", () => {
    const creneaux = [
      { id: "1", jour: "LUNDI", heureDebut: "08:00", heureFin: "09:00", matiereNom: "Maths", enseignantNom: "M. Ahmed", salle: "Salle 1" },
      { id: "2", jour: "LUNDI", heureDebut: "09:00", heureFin: "10:00", matiereNom: "Français", enseignantNom: "M. Ahmed", salle: "Salle 1" },
    ];
    const result = fusionnerCreneauxAdjacents(creneaux);
    expect(result).toHaveLength(2);
  });

  it("ne fusionne pas si l'enseignant est différent", () => {
    const creneaux = [
      { id: "1", jour: "LUNDI", heureDebut: "08:00", heureFin: "09:00", matiereNom: "Maths", enseignantNom: "M. Ahmed", salle: "Salle 1" },
      { id: "2", jour: "LUNDI", heureDebut: "09:00", heureFin: "10:00", matiereNom: "Maths", enseignantNom: "Mme Fatima", salle: "Salle 1" },
    ];
    const result = fusionnerCreneauxAdjacents(creneaux);
    expect(result).toHaveLength(2);
  });

  it("ne fusionne pas si la salle est différente", () => {
    const creneaux = [
      { id: "1", jour: "LUNDI", heureDebut: "08:00", heureFin: "09:00", matiereNom: "Maths", enseignantNom: "M. Ahmed", salle: "Salle 1" },
      { id: "2", jour: "LUNDI", heureDebut: "09:00", heureFin: "10:00", matiereNom: "Maths", enseignantNom: "M. Ahmed", salle: "Salle 2" },
    ];
    const result = fusionnerCreneauxAdjacents(creneaux);
    expect(result).toHaveLength(2);
  });

  it("ne fusionne pas si les créneaux ne sont pas adjacents (gap)", () => {
    const creneaux = [
      { id: "1", jour: "LUNDI", heureDebut: "08:00", heureFin: "09:00", matiereNom: "Maths", enseignantNom: "M. Ahmed", salle: "Salle 1" },
      { id: "2", jour: "LUNDI", heureDebut: "10:00", heureFin: "11:00", matiereNom: "Maths", enseignantNom: "M. Ahmed", salle: "Salle 1" },
    ];
    const result = fusionnerCreneauxAdjacents(creneaux);
    expect(result).toHaveLength(2);
  });

  it("ne fusionne pas les créneaux de jours différents", () => {
    const creneaux = [
      { id: "1", jour: "LUNDI", heureDebut: "08:00", heureFin: "09:00", matiereNom: "Maths", enseignantNom: "M. Ahmed", salle: "Salle 1" },
      { id: "2", jour: "MARDI", heureDebut: "09:00", heureFin: "10:00", matiereNom: "Maths", enseignantNom: "M. Ahmed", salle: "Salle 1" },
    ];
    const result = fusionnerCreneauxAdjacents(creneaux);
    expect(result).toHaveLength(2);
  });

  it("fusionne trois créneaux adjacents en un seul bloc", () => {
    const creneaux = [
      { id: "1", jour: "LUNDI", heureDebut: "08:00", heureFin: "09:00", matiereNom: "Maths", enseignantNom: null, salle: null },
      { id: "2", jour: "LUNDI", heureDebut: "09:00", heureFin: "10:00", matiereNom: "Maths", enseignantNom: null, salle: null },
      { id: "3", jour: "LUNDI", heureDebut: "10:00", heureFin: "11:00", matiereNom: "Maths", enseignantNom: null, salle: null },
    ];
    const result = fusionnerCreneauxAdjacents(creneaux);
    expect(result).toHaveLength(1);
    expect(result[0].ids).toEqual(["1", "2", "3"]);
    expect(result[0].heureDebut).toBe("08:00");
    expect(result[0].heureFin).toBe("11:00");
  });

  it("gère les créneaux avec prof et salle null", () => {
    const creneaux = [
      { id: "1", jour: "LUNDI", heureDebut: "08:00", heureFin: "09:00", matiereNom: "Lecture", enseignantNom: null, salle: null },
      { id: "2", jour: "LUNDI", heureDebut: "09:00", heureFin: "09:30", matiereNom: "Lecture", enseignantNom: null, salle: null },
    ];
    const result = fusionnerCreneauxAdjacents(creneaux);
    expect(result).toHaveLength(1);
    expect(result[0].heureFin).toBe("09:30");
  });

  it("retourne un tableau vide pour une entrée vide", () => {
    expect(fusionnerCreneauxAdjacents([])).toEqual([]);
  });
});
