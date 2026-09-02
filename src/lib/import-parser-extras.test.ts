import { describe, it, expect } from "vitest";
import { cleanMatiereName, snapCreneauToGrid, SNAP_TOLERANCE_MIN } from "./import-parser";
import { fuzzyFindStrict, normalizeText } from "./text-match";

// ============================================================
// Tests : cleanMatiereName, snapCreneauToGrid, fuzzyFindStrict
// ============================================================

describe("cleanMatiereName", () => {
  it("retire '40 min' à la fin", () => {
    expect(cleanMatiereName("Lecture 40 min")).toBe("Lecture");
  });

  it("retire '40min' sans espace", () => {
    expect(cleanMatiereName("Lecture 40min")).toBe("Lecture");
  });

  it("retire '40 minutes' (variante)", () => {
    expect(cleanMatiereName("Lecture 40 minutes")).toBe("Lecture");
  });

  it("retire '30 ou 40 min'", () => {
    expect(cleanMatiereName("Math 30 ou 40 min")).toBe("Math");
  });

  it("retire '50 à 60 min'", () => {
    expect(cleanMatiereName("Sciences 50 à 60 min")).toBe("Sciences");
  });

  it("retire '50 a 60 min' (sans accent)", () => {
    expect(cleanMatiereName("Sciences 50 a 60 min")).toBe("Sciences");
  });

  it("retire '15 ou 20' (sans 'min')", () => {
    expect(cleanMatiereName("Repos 15 ou 20")).toBe("Repos");
  });

  it("ne modifie pas un nom sans annotation de durée", () => {
    expect(cleanMatiereName("Mathématiques")).toBe("Mathématiques");
    expect(cleanMatiereName("Lecture 1")).toBe("Lecture 1");
  });

  it("gère les espaces multiples", () => {
    expect(cleanMatiereName("  Lecture 40 min  ")).toBe("Lecture");
  });
});

describe("snapCreneauToGrid", () => {
  it("conserve l'heure si elle est exactement sur un slot", () => {
    const result = snapCreneauToGrid("08:00", 10, "down");
    expect(result.time).toBe("08:00");
    expect(result.snapped).toBe(false);
    expect(result.ecart).toBe(0);
  });

  it("conserve l'heure si l'écart est ≤ 5 min (tolérance)", () => {
    // 12:45 → slot le plus proche (down) = 12:40, écart = 5 min → conservé
    const result = snapCreneauToGrid("12:45", 10, "down");
    expect(result.time).toBe("12:45");
    expect(result.snapped).toBe(false);
    expect(result.ecart).toBe(5);
  });

  it("snappe si l'écart > 5 min (direction down)", () => {
    // 08:07 → slot down = 08:00, écart = 7 min > 5 → snappé à 08:00
    const result = snapCreneauToGrid("08:07", 10, "down");
    expect(result.time).toBe("08:00");
    expect(result.snapped).toBe(true);
    expect(result.ecart).toBe(7);
  });

  it("snappe si l'écart > 5 min (direction up)", () => {
    // 08:03 → slot up = 08:10, écart = 7 min > 5 → snappé à 08:10
    const result = snapCreneauToGrid("08:03", 10, "up");
    expect(result.time).toBe("08:10");
    expect(result.snapped).toBe(true);
    expect(result.ecart).toBe(7);
  });

  it("conserve 08:30 avec grille 30min (écart 0, sur slot)", () => {
    const result = snapCreneauToGrid("08:30", 30, "down");
    expect(result.time).toBe("08:30");
    expect(result.snapped).toBe(false);
  });

  it("snappe 08:12 avec grille 30min (écart 12 > 5)", () => {
    const result = snapCreneauToGrid("08:12", 30, "down");
    expect(result.time).toBe("08:00");
    expect(result.snapped).toBe(true);
    expect(result.ecart).toBe(12);
  });

  it("conserve 08:02 avec grille 30min (écart 2 ≤ 5)", () => {
    const result = snapCreneauToGrid("08:02", 30, "down");
    expect(result.time).toBe("08:02");
    expect(result.snapped).toBe(false);
    expect(result.ecart).toBe(2);
  });

  it("SNAP_TOLERANCE_MIN = 5", () => {
    expect(SNAP_TOLERANCE_MIN).toBe(5);
  });

  it("accepte une tolérance personnalisée", () => {
    // Avec tolérance 10, 08:07 (écart 7) est conservé
    const result = snapCreneauToGrid("08:07", 10, "down", 10);
    expect(result.time).toBe("08:07");
    expect(result.snapped).toBe(false);
  });
});

describe("fuzzyFindStrict", () => {
  it("retourne un match exact (substring)", () => {
    const candidates = [{ id: "1", nom: "Mathématiques" }];
    const result = fuzzyFindStrict(candidates, "Mathématiques");
    expect(result).toHaveLength(1);
  });

  it("retourne un match si le needle est un substring du candidat", () => {
    const candidates = [{ id: "1", nom: "Mathématiques" }];
    const result = fuzzyFindStrict(candidates, "math");
    expect(result).toHaveLength(1);
  });

  it("ne retourne rien si le needle est trop court (< 3)", () => {
    const candidates = [{ id: "1", nom: "Mathématiques" }];
    const result = fuzzyFindStrict(candidates, "ma");
    expect(result).toHaveLength(0);
  });

  it("évite les faux positifs : 'Graphisme' ≠ 'Écriture'", () => {
    const candidates = [{ id: "1", nom: "Écriture" }];
    const result = fuzzyFindStrict(candidates, "Graphisme");
    expect(result).toHaveLength(0);
  });

  it("évite les faux positifs : 'EM' ≠ 'EMT' (préfixe < 5)", () => {
    const candidates = [{ id: "1", nom: "EMT" }];
    const result = fuzzyFindStrict(candidates, "EM");
    expect(result).toHaveLength(0); // needle trop court (< 3)
  });

  it("matche sur préfixe commun ≥ 5 caractères", () => {
    const candidates = [{ id: "1", nom: "Histoire-Géographie" }];
    const result = fuzzyFindStrict(candidates, "Histoire");
    expect(result).toHaveLength(1);
  });

  it("ne matche pas si le préfixe commun < 5 caractères", () => {
    const candidates = [{ id: "1", nom: "Sciences Physiques" }];
    const result = fuzzyFindStrict(candidates, "Scien");
    // "scien" = 5 chars, prefix commun = 5 → match
    expect(result).toHaveLength(1);
  });

  it("retourne plusieurs candidats si plusieurs matchent", () => {
    const candidates = [
      { id: "1", nom: "Mathématiques" },
      { id: "2", nom: "Maths Appliquées" },
      { id: "3", nom: "Français" },
    ];
    const result = fuzzyFindStrict(candidates, "Math");
    expect(result).toHaveLength(2);
  });

  it("normalise les accents", () => {
    const candidates = [{ id: "1", nom: "Évaluation" }];
    const result = fuzzyFindStrict(candidates, "evaluation");
    expect(result).toHaveLength(1);
  });
});
