import { describe, it, expect } from "vitest";
import { getSchoolGroup, groupBySchoolLevel, SCHOOL_GROUP_ORDER } from "./school-groups";

describe("getSchoolGroup", () => {
  it("classe les niveaux français par cycle", () => {
    expect(getSchoolGroup("CI")).toBe("Primaire");
    expect(getSchoolGroup("CM2")).toBe("Primaire");
    expect(getSchoolGroup("6ème")).toBe("Collège");
    expect(getSchoolGroup("3ème", "3ème B")).toBe("Collège");
    expect(getSchoolGroup("Seconde", "2nde D")).toBe("Lycée");
    expect(getSchoolGroup("Terminale")).toBe("Lycée");
  });

  it("reconnaît la maternelle au lieu de la ranger dans « Autre »", () => {
    expect(getSchoolGroup("Maternelle")).toBe("Maternelle");
    expect(getSchoolGroup("", "Garderie")).toBe("Maternelle");
    expect(getSchoolGroup("", "GRANDE SECTION A")).toBe("Maternelle");
    expect(getSchoolGroup("MS", "Moyenne section 2")).toBe("Maternelle");
    expect(SCHOOL_GROUP_ORDER[0]).toBe("Maternelle");
  });

  it("la structure enregistrée en base fait foi sur le nom et le niveau", () => {
    expect(getSchoolGroup("", "Les Papillons", "MATERNELLE")).toBe("Maternelle");
    expect(getSchoolGroup("", "Classe libre", "PRIMAIRE")).toBe("Primaire");
    // Le nom dit « 6ème » (collège), la base dit lycée : la base gagne.
    expect(getSchoolGroup("6ème", "6ème A", "LYCEE")).toBe("Lycée");
  });

  it("retombe sur le nom et le niveau sans structure ou avec un type inconnu", () => {
    expect(getSchoolGroup("6ème", "6ème A", null)).toBe("Collège");
    expect(getSchoolGroup("6ème", "6ème A", "INCONNU")).toBe("Collège");
    expect(getSchoolGroup("", "Classe libre")).toBe("Autre");
  });
});

describe("groupBySchoolLevel", () => {
  it("range les élèves selon la structure de leur classe", () => {
    const groupes = groupBySchoolLevel([
      { id: 1, classe: { nom: "Les Papillons", niveau: "", structure: { type: "MATERNELLE" } } },
      { id: 2, classe: { nom: "CM2 A", niveau: "CM2" } },
      { id: 3, classe: null },
    ]);
    expect(groupes.map((g) => g.group)).toEqual(["Maternelle", "Primaire", "Autre"]);
  });
});
