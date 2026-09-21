import { describe, it, expect } from "vitest";
import { absenceIdAppel, creneauxHoraires, jourDepuisDate, validerCreneau } from "./appel-creneaux";

describe("appel-creneaux", () => {
  it("déduit le jour de la semaine sans dépendre du fuseau", () => {
    expect(jourDepuisDate("2026-09-21")).toBe("LUNDI");
    expect(jourDepuisDate("2026-09-20")).toBe("DIMANCHE");
  });

  it("garde l'identifiant historique pour l'appel journée entière", () => {
    expect(absenceIdAppel("c1", "e1", "2026-09-21")).toBe("appel-c1-e1-2026-09-21");
    expect(absenceIdAppel("c1", "e1", "2026-09-21", "08:00")).toBe("appel-c1-e1-2026-09-21-0800");
  });

  it("génère des créneaux d'une heure", () => {
    const c = creneauxHoraires("07:00", "10:00");
    expect(c.map((x) => `${x.heureDebut}-${x.heureFin}`)).toEqual(["07:00-08:00", "08:00-09:00", "09:00-10:00"]);
  });

  it("valide le créneau et les heures d'arrivée", () => {
    expect(validerCreneau(null, null)).toBeNull();
    expect(validerCreneau(null, null, { e1: "08:10" })).toMatch(/sans créneau/);
    expect(validerCreneau("08:00", "09:00", { e1: "08:15" })).toBeNull();
    expect(validerCreneau("09:00", "08:00")).toMatch(/invalide/);
    expect(validerCreneau("08:00", null)).toMatch(/invalide/);
    expect(validerCreneau("08:00", "09:00", { e1: "08:00" })).toMatch(/hors du créneau/);
    expect(validerCreneau("08:00", "09:00", { e1: "09:30" })).toMatch(/hors du créneau/);
    expect(validerCreneau("08:00", "09:00", { e1: "8h15" })).toMatch(/invalide/);
  });
});
