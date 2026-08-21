import { describe, it, expect } from "vitest";
import { normaliserEmail } from "./email";

describe("normaliserEmail", () => {
  it("met l'adresse en minuscules", () => {
    expect(normaliserEmail("Mohamed.abdi.pk12@gmail.com")).toBe("mohamed.abdi.pk12@gmail.com");
    expect(normaliserEmail("Ilyasadendjama@gmail.com")).toBe("ilyasadendjama@gmail.com");
    expect(normaliserEmail("Dya.adine@miriam.dj")).toBe("dya.adine@miriam.dj");
  });

  it("retire les espaces autour", () => {
    expect(normaliserEmail("  admin@ecolemiriam.com  ")).toBe("admin@ecolemiriam.com");
    expect(normaliserEmail("\tAdmin@Ecolemiriam.COM\n")).toBe("admin@ecolemiriam.com");
  });

  it("laisse intacte une adresse déjà normalisée", () => {
    expect(normaliserEmail("admin@ecolemiriam.com")).toBe("admin@ecolemiriam.com");
  });

  it("est idempotente", () => {
    const une = normaliserEmail("  Nom.Prenom@Domaine.COM ");
    expect(normaliserEmail(une)).toBe(une);
  });

  it("ramène au même résultat les variantes de casse d'une même adresse", () => {
    const variantes = [
      "mohamed.abdi.pk12@gmail.com",
      "Mohamed.abdi.pk12@gmail.com",
      "MOHAMED.ABDI.PK12@GMAIL.COM",
      " Mohamed.Abdi.Pk12@Gmail.com ",
    ];
    const normalisees = new Set(variantes.map(normaliserEmail));
    expect(normalisees.size).toBe(1);
  });
});
