import { describe, it, expect } from "vitest";
import { semaineCivile } from "@/lib/learnos/planification-pure";

/**
 * La numérotation civile est ce que voit l'utilisateur : elle doit coïncider
 * avec un calendrier du commerce, y compris aux bascules de fin d'année où les
 * calculs naïfs se trompent.
 */
describe("semaineCivile", () => {
  it("place le 1er janvier ordinaire en semaine 1", () => {
    // 2025-01-01 est un mercredi : sa semaine contient le premier jeudi.
    expect(semaineCivile(new Date(2025, 0, 1))).toBe(1);
  });

  it("rend les semaines des dates de démonstration", () => {
    expect(semaineCivile(new Date(2024, 10, 15))).toBe(46);
    expect(semaineCivile(new Date(2025, 2, 15))).toBe(11);
    expect(semaineCivile(new Date(2025, 9, 15))).toBe(42);
    expect(semaineCivile(new Date(2026, 2, 15))).toBe(11);
  });

  it("rattache un 1er janvier de début de semaine à l'année précédente", () => {
    // 2022-01-01 est un samedi : ISO le range en semaine 52 de 2021, et non
    // dans une « semaine 1 » de deux jours.
    expect(semaineCivile(new Date(2022, 0, 1))).toBe(52);
  });

  it("rattache une fin décembre à la semaine 1 suivante", () => {
    // 2025-12-29 est un lundi dont le jeudi tombe en 2026.
    expect(semaineCivile(new Date(2025, 11, 29))).toBe(1);
  });

  it("reconnaît une année ISO à 53 semaines", () => {
    // 2020 en compte 53 : le 2020-12-31 est un jeudi.
    expect(semaineCivile(new Date(2020, 11, 31))).toBe(53);
  });

  it("donne le même numéro à tous les jours d'une même semaine", () => {
    const lundi = new Date(2026, 2, 9);
    const dimanche = new Date(2026, 2, 15);
    expect(semaineCivile(lundi)).toBe(semaineCivile(dimanche));
  });
});
