import { describe, it, expect } from "vitest";
import {
  absencesEquivalentes, niveauAbsenteisme, tauxAssiduite,
} from "./signal-absenteisme";

describe("signal-absenteisme", () => {
  it("convertit trois retards en une absence", () => {
    expect(absencesEquivalentes({ absences: 0, retards: 3 })).toBe(1);
    expect(absencesEquivalentes({ absences: 2, retards: 3 })).toBe(3);
    expect(absencesEquivalentes({ absences: 0, retards: 0 })).toBe(0);
  });

  it("classe le niveau selon les seuils", () => {
    expect(niveauAbsenteisme({ absences: 2, retards: 0 })).toBe("AUCUN");
    expect(niveauAbsenteisme({ absences: 3, retards: 0 })).toBe("ATTENTION");
    // Uniquement des retards : neuf retards valent trois absences.
    expect(niveauAbsenteisme({ absences: 0, retards: 9 })).toBe("ATTENTION");
    expect(niveauAbsenteisme({ absences: 5, retards: 0 })).toBe("ELEVE");
    expect(niveauAbsenteisme({ absences: 4, retards: 3 })).toBe("ELEVE");
  });

  it("normalise le taux d'assiduité entre 0 et 1", () => {
    expect(tauxAssiduite({ absences: 0, retards: 0 })).toBe(1);
    expect(tauxAssiduite({ absences: 5, retards: 0 })).toBe(0.5);
    expect(tauxAssiduite({ absences: 10, retards: 0 })).toBe(0);
    expect(tauxAssiduite({ absences: 20, retards: 0 })).toBe(0);
    // Les retards pèsent, sans écraser le signal.
    expect(tauxAssiduite({ absences: 0, retards: 3 })).toBeCloseTo(0.9, 5);
  });
});
