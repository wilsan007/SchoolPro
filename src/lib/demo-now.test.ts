import { describe, it, expect } from "vitest";
import { bornesDuJour, jourISO, peutDeplacerHorloge } from "@/lib/demo-now";

/**
 * Seules les fonctions pures sont testées ici : `getDemoDate()` et
 * `getDemoNow()` lisent les cookies de la requête, ce qui relève d'un test
 * d'intégration.
 */
describe("jourISO", () => {
  it("rend le jour local au format AAAA-MM-JJ", () => {
    expect(jourISO(new Date(2026, 1, 15, 10, 30))).toBe("2026-02-15");
  });

  it("complète les mois et les jours à un chiffre", () => {
    expect(jourISO(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
  });

  it("ne bascule pas d'un jour à cause du fuseau", () => {
    // Le piège de `toISOString()` : à 23 h 59 sous un fuseau positif, il rend
    // la veille. La clé de cache changerait alors de jour sans que la date
    // affichée bouge, et le tableau de bord resservirait les chiffres d'hier.
    expect(jourISO(new Date(2026, 5, 30, 23, 59, 59))).toBe("2026-06-30");
  });
});

describe("bornesDuJour", () => {
  it("encadre la journée entière", () => {
    const { debut, fin } = bornesDuJour(new Date(2026, 1, 15, 14, 22, 8));
    expect(debut.getHours()).toBe(0);
    expect(debut.getMinutes()).toBe(0);
    expect(fin.getHours()).toBe(23);
    expect(fin.getMilliseconds()).toBe(999);
    expect(jourISO(debut)).toBe("2026-02-15");
    expect(jourISO(fin)).toBe("2026-02-15");
  });

  it("ne modifie pas la date reçue", () => {
    // L'ancien `new Date(new Date().setHours(...))` mutait une date
    // intermédiaire ; la borne doit être sans effet de bord.
    const source = new Date(2026, 1, 15, 14, 0, 0);
    const copie = new Date(source);
    bornesDuJour(source);
    expect(source.getTime()).toBe(copie.getTime());
  });
});

describe("peutDeplacerHorloge", () => {
  it("autorise l'administrateur du tenant", () => {
    expect(peutDeplacerHorloge("TENANT_ADMIN")).toBe(true);
  });

  it.each([
    "SUPER_ADMIN",
    "PRINCIPAL",
    "TEACHER",
    "CLASS_TEACHER",
    "PARENT",
    "STUDENT",
    "ACCOUNTANT",
    "SECRETARY",
  ])("refuse %s", (role) => {
    // L'horloge ne fait plus que décaler un affichage : elle masque des données
    // (cf. `demo-horizon`). Un rôle non autorisé en obtiendrait une vue tronquée.
    expect(peutDeplacerHorloge(role)).toBe(false);
  });

  it("refuse un rôle absent", () => {
    expect(peutDeplacerHorloge(undefined)).toBe(false);
    expect(peutDeplacerHorloge(null)).toBe(false);
    expect(peutDeplacerHorloge("")).toBe(false);
  });
});
