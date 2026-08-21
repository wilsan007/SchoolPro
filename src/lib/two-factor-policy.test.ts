import { describe, expect, it, afterEach } from "vitest";
import {
  ROLES_2FA_OBLIGATOIRE,
  activation2FARequise,
  deuxFacteursObligatoire,
} from "./two-factor-policy";

const original = process.env.TWO_FACTOR_GRACE_DAYS;
afterEach(() => {
  if (original === undefined) delete process.env.TWO_FACTOR_GRACE_DAYS;
  else process.env.TWO_FACTOR_GRACE_DAYS = original;
});

const ilYA = (jours: number) => new Date(Date.now() - jours * 86_400_000);

describe("deuxFacteursObligatoire", () => {
  it("couvre les rôles à fort pouvoir de nuisance", () => {
    for (const role of ROLES_2FA_OBLIGATOIRE) {
      expect(deuxFacteursObligatoire(role)).toBe(true);
    }
  });

  it("n'impose rien aux rôles à périmètre restreint", () => {
    for (const role of ["TEACHER", "PARENT", "STUDENT", "NURSE"] as const) {
      expect(deuxFacteursObligatoire(role)).toBe(false);
    }
  });

  it("tolère l'absence de rôle sans lever d'erreur", () => {
    expect(deuxFacteursObligatoire(null)).toBe(false);
    expect(deuxFacteursObligatoire(undefined)).toBe(false);
  });
});

describe("activation2FARequise", () => {
  it("n'impose jamais rien tant que le délai n'est pas configuré", () => {
    // Garde-fou du déploiement : sans décision explicite, aucun compte ne
    // doit se retrouver restreint du jour au lendemain.
    delete process.env.TWO_FACTOR_GRACE_DAYS;
    expect(activation2FARequise("TENANT_ADMIN", false, ilYA(9999))).toBe(false);
  });

  it("laisse le délai de tolérance s'écouler", () => {
    process.env.TWO_FACTOR_GRACE_DAYS = "30";
    expect(activation2FARequise("TENANT_ADMIN", false, ilYA(10))).toBe(false);
    expect(activation2FARequise("TENANT_ADMIN", false, ilYA(31))).toBe(true);
  });

  it("ne demande rien à qui a déjà configuré son second facteur", () => {
    process.env.TWO_FACTOR_GRACE_DAYS = "30";
    expect(activation2FARequise("TENANT_ADMIN", true, ilYA(9999))).toBe(false);
  });

  it("ne demande rien aux rôles non concernés", () => {
    process.env.TWO_FACTOR_GRACE_DAYS = "30";
    expect(activation2FARequise("TEACHER", false, ilYA(9999))).toBe(false);
  });

  it("traite une date de création inconnue comme un délai écoulé", () => {
    // Un compte sans date connue est un compte ancien : lui accorder un
    // délai indéfini reviendrait à ne jamais appliquer la règle.
    process.env.TWO_FACTOR_GRACE_DAYS = "30";
    expect(activation2FARequise("ACCOUNTANT", false, null)).toBe(true);
  });

  it("ignore une valeur de délai aberrante", () => {
    process.env.TWO_FACTOR_GRACE_DAYS = "n'importe quoi";
    expect(activation2FARequise("TENANT_ADMIN", false, ilYA(9999))).toBe(false);
  });
});
