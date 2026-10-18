import { describe, it, expect } from "vitest";

import { fiabiliteObservee, type FiabiliteCorrecteur, type MesureValidation } from "./fiabilite-correcteur";

const m = (over: Partial<MesureValidation> = {}): MesureValidation => ({
  validee: true,
  ecarts: 0,
  nbCriteres: 3,
  ...over,
});

describe("fiabiliteObservee", () => {
  it("sans mesure : tous les taux à 0, suffisant faux, jamais flatteur", () => {
    const f = fiabiliteObservee([]);
    expect(f.relues).toBe(0);
    expect(f.tauxConfirmees).toBe(0);
    expect(f.tauxEcartCriteres).toBe(0);
    expect(f.tauxRejets).toBe(0);
    expect(f.suffisant).toBe(false);
  });

  it("taux de confirmation = part des propositions confirmées telles quelles", () => {
    const f = fiabiliteObservee([
      m(), // confirmée (0 écart)
      m(), // confirmée (0 écart)
      { ...m(), validee: true, ecarts: 1, nbCriteres: 3 }, // validée mais modifiée
      { ...m(), validee: false }, // rejetée
    ]);
    expect(f.relues).toBe(4);
    expect(f.tauxConfirmees).toBe(0.5);
    expect(f.tauxRejets).toBe(0.25);
  });

  it("taux d'écart critères porte sur les critères des validations seulement", () => {
    const f = fiabiliteObservee([
      { ...m(), validee: true, ecarts: 2, nbCriteres: 4 },
      { ...m(), validee: true, ecarts: 0, nbCriteres: 2 },
      { ...m(), validee: false }, // rejeté : ne compte pas dans les critères
    ]);
    expect(f.tauxEcartCriteres).toBeCloseTo(2 / 6);
  });

  it("suffisant à partir de 30 relues (ECHANTILLON_MIN)", () => {
    const justeEnDeçà = Array.from({ length: 29 }, () => m());
    expect(fiabiliteObservee(justeEnDeçà).suffisant).toBe(false);

    const juste = Array.from({ length: 30 }, () => m());
    expect(fiabiliteObservee(juste).suffisant).toBe(true);
  });

  it("type de retour cohérent", () => {
    const f: FiabiliteCorrecteur = fiabiliteObservee([m()]);
    expect(typeof f.relues).toBe("number");
    expect(typeof f.tauxConfirmees).toBe("number");
    expect(typeof f.suffisant).toBe("boolean");
  });
});
