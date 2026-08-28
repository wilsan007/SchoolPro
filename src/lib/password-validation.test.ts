import { describe, it, expect } from "vitest";
import {
  validerMotDePasse,
  buildPasswordSchema,
  buildPasswordWithConfirmSchema,
  type PasswordMessages,
} from "./password-validation";

const MESSAGES: PasswordMessages = {
  tooShort: "Le mot de passe doit faire au moins 8 caractères",
  missingUppercase: "Le mot de passe doit contenir au moins une lettre majuscule",
  missingLowercase: "Le mot de passe doit contenir au moins une lettre minuscule",
  missingNumber: "Le mot de passe doit contenir au moins un chiffre",
  missingSpecial: "Le mot de passe doit contenir au moins un caractère spécial",
  dontMatch: "Les mots de passe ne correspondent pas",
};

const VALID_PASSWORD = "Abcdef1!";

describe("validerMotDePasse", () => {
  it("retourne null pour un mot de passe valide", () => {
    expect(validerMotDePasse(VALID_PASSWORD)).toBeNull();
    expect(validerMotDePasse("Secure123!@#")).toBeNull();
    expect(validerMotDePasse("MyP@ssw0rd")).toBeNull();
  });

  it("retourne PASSWORD_TOO_SHORT si < 8 caractères", () => {
    const erreurs = validerMotDePasse("Ab1!");
    expect(erreurs).toContain("PASSWORD_TOO_SHORT");
  });

  it("retourne PASSWORD_MISSING_UPPERCASE si pas de majuscule", () => {
    const erreurs = validerMotDePasse("abcdef1!");
    expect(erreurs).toContain("PASSWORD_MISSING_UPPERCASE");
    expect(erreurs).not.toContain("PASSWORD_MISSING_LOWERCASE");
  });

  it("retourne PASSWORD_MISSING_LOWERCASE si pas de minuscule", () => {
    const erreurs = validerMotDePasse("ABCDEF1!");
    expect(erreurs).toContain("PASSWORD_MISSING_LOWERCASE");
    expect(erreurs).not.toContain("PASSWORD_MISSING_UPPERCASE");
  });

  it("retourne PASSWORD_MISSING_NUMBER si pas de chiffre", () => {
    const erreurs = validerMotDePasse("Abcdefg!");
    expect(erreurs).toContain("PASSWORD_MISSING_NUMBER");
  });

  it("retourne PASSWORD_MISSING_SPECIAL si pas de caractère spécial", () => {
    const erreurs = validerMotDePasse("Abcdef12");
    expect(erreurs).toContain("PASSWORD_MISSING_SPECIAL");
  });

  it("accumule plusieurs erreurs simultanées", () => {
    const erreurs = validerMotDePasse("a");
    expect(erreurs).toContain("PASSWORD_TOO_SHORT");
    expect(erreurs).toContain("PASSWORD_MISSING_UPPERCASE");
    expect(erreurs).toContain("PASSWORD_MISSING_NUMBER");
    expect(erreurs).toContain("PASSWORD_MISSING_SPECIAL");
    // "a" contient une minuscule → pas cette erreur
    expect(erreurs).not.toContain("PASSWORD_MISSING_LOWERCASE");
  });

  it("accepte divers caractères spécuels", () => {
    for (const special of ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "_", "+", "-", "=", "[", "]", "{", "}", ";", ":", "'", '"', "\\", "|", ",", ".", "<", ">", "/", "?", "`", "~"]) {
      const password = `Abcdef1${special}`;
      expect(validerMotDePasse(password)).toBeNull();
    }
  });

  it("retourne null pour un mot de passe exactement à 8 caractères valide", () => {
    expect(validerMotDePasse("Abcdef1!")).toBeNull();
  });

  it("retourne trop court pour 7 caractères même si toutes les règles sont respectées", () => {
    const erreurs = validerMotDePasse("Ab1!xyz");
    expect(erreurs).toContain("PASSWORD_TOO_SHORT");
  });
});

describe("buildPasswordSchema", () => {
  it("génère un schéma Zod valide qui accepte un mot de passe conforme", () => {
    const schema = buildPasswordSchema(MESSAGES);
    const result = schema.safeParse(VALID_PASSWORD);
    expect(result.success).toBe(true);
  });

  it("rejette un mot de passe trop court avec le message traduit", () => {
    const schema = buildPasswordSchema(MESSAGES);
    const result = schema.safeParse("Ab1!");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(MESSAGES.tooShort);
    }
  });

  it("rejette un mot de passe sans majuscule avec le message traduit", () => {
    const schema = buildPasswordSchema(MESSAGES);
    const result = schema.safeParse("abcdef1!");
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(MESSAGES.missingUppercase);
    }
  });

  it("rejette un mot de passe sans minuscule avec le message traduit", () => {
    const schema = buildPasswordSchema(MESSAGES);
    const result = schema.safeParse("ABCDEF1!");
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(MESSAGES.missingLowercase);
    }
  });

  it("rejette un mot de passe sans chiffre avec le message traduit", () => {
    const schema = buildPasswordSchema(MESSAGES);
    const result = schema.safeParse("Abcdefg!");
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(MESSAGES.missingNumber);
    }
  });

  it("rejette un mot de passe sans caractère spécial avec le message traduit", () => {
    const schema = buildPasswordSchema(MESSAGES);
    const result = schema.safeParse("Abcdef12");
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(MESSAGES.missingSpecial);
    }
  });
});

describe("buildPasswordWithConfirmSchema", () => {
  it("valide quand password et confirmPassword correspondent", () => {
    const schema = buildPasswordWithConfirmSchema(MESSAGES);
    const result = schema.safeParse({
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD,
    });
    expect(result.success).toBe(true);
  });

  it("rejette quand password et confirmPassword ne correspondent pas", () => {
    const schema = buildPasswordWithConfirmSchema(MESSAGES);
    const result = schema.safeParse({
      password: VALID_PASSWORD,
      confirmPassword: "Different1!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(MESSAGES.dontMatch);
    }
  });
});
