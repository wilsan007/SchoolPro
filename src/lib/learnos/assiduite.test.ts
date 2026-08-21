import { describe, it, expect } from "vitest";
import {
  compterJoursDeClasse,
  poidsJournee,
  agregerAbsences,
  tauxAbsenteisme,
} from "./assiduite";

// Semaine djiboutienne telle qu'elle figure dans les emplois du temps en base.
const SEMAINE_DJ = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI"] as const;
const SEMAINE_FR = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"] as const;

describe("compterJoursDeClasse", () => {
  it("ne compte que les jours ouvrés de l'établissement", () => {
    // 6 mars → 5 avril 2026 : la fenêtre de 30 jours du chatbot.
    const { joursDeClasse } = compterJoursDeClasse(
      new Date("2026-03-06T12:00:00"),
      new Date("2026-04-05T12:00:00"),
      [...SEMAINE_DJ]
    );
    // 31 jours calendaires, dont 21 tombent un dimanche-jeudi.
    expect(joursDeClasse).toBe(21);
  });

  it("suit la semaine de l'établissement, pas un lundi-vendredi supposé", () => {
    // Vendredi 6 et samedi 7 mars 2026 : week-end à Djibouti, pas en France.
    const bornes = [new Date("2026-03-06T12:00:00"), new Date("2026-03-07T12:00:00")] as const;
    expect(compterJoursDeClasse(bornes[0], bornes[1], [...SEMAINE_DJ]).joursDeClasse).toBe(0);
    expect(compterJoursDeClasse(bornes[0], bornes[1], [...SEMAINE_FR]).joursDeClasse).toBe(1);
  });

  it("retire les vacances et les jours fériés", () => {
    const { joursDeClasse, joursFermes } = compterJoursDeClasse(
      new Date("2026-03-06T12:00:00"),
      new Date("2026-04-05T12:00:00"),
      [...SEMAINE_DJ],
      [{ dateDebut: new Date("2026-03-15T00:00:00"), dateFin: new Date("2026-03-21T00:00:00") }]
    );
    expect(joursFermes).toBe(5); // dimanche 15 → jeudi 19
    expect(joursDeClasse).toBe(16);
  });

  it("compte les bornes incluses", () => {
    const un = compterJoursDeClasse(
      new Date("2026-03-09T08:00:00"), // lundi
      new Date("2026-03-09T18:00:00"),
      [...SEMAINE_DJ]
    );
    expect(un.joursDeClasse).toBe(1);
  });

  it("rend zéro si aucun jour ouvré n'est connu", () => {
    expect(
      compterJoursDeClasse(new Date("2026-03-06"), new Date("2026-04-05"), []).joursDeClasse
    ).toBe(0);
  });
});

describe("poidsJournee", () => {
  it("ne compte pas un retard comme une absence", () => {
    expect(poidsJournee({ isRetard: true, heureDebut: "08:00" })).toBe(0);
  });

  it("compte une absence bornée à un créneau pour une demi-journée", () => {
    expect(poidsJournee({ isRetard: false, heureDebut: "08:00" })).toBe(0.5);
  });

  it("compte une journée entière quand aucune heure n'est renseignée", () => {
    expect(poidsJournee({ isRetard: false, heureDebut: null })).toBe(1);
  });
});

describe("agregerAbsences", () => {
  it("sépare retards, absences et journées pondérées", () => {
    const agregat = agregerAbsences([
      { isRetard: false, heureDebut: null }, // 1
      { isRetard: false, heureDebut: "08:00" }, // 0,5
      { isRetard: true, heureDebut: "08:00" }, // retard
    ]);
    expect(agregat).toEqual({ journeesAbsence: 1.5, retards: 1, absences: 2 });
  });

  it("rend des zéros sur une liste vide", () => {
    expect(agregerAbsences([])).toEqual({ journeesAbsence: 0, retards: 0, absences: 0 });
  });
});

describe("tauxAbsenteisme", () => {
  it("rapporte les journées manquées aux présences attendues", () => {
    // 44 journées manquées, 4 élèves, 22 jours de classe → 50 %
    expect(tauxAbsenteisme(44, 4, 22)).toBe(50);
  });

  it("ne minore plus le taux en comptant les jours calendaires", () => {
    const surJoursDeClasse = tauxAbsenteisme(22, 4, 22);
    const ancienneFormule = Math.round((22 / (4 * 30)) * 1000) / 10;
    expect(surJoursDeClasse).toBe(25);
    expect(ancienneFormule).toBeLessThan(surJoursDeClasse);
  });

  it("rend 0 plutôt qu'une division par zéro sans élève", () => {
    expect(tauxAbsenteisme(5, 0, 22)).toBe(0);
  });
});
