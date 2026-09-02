/**
 * Tests unitaires pour le système de jetons d'API par empreinte SHA-256.
 */
import { describe, it, expect } from "vitest";
import {
  genererJetonApi,
  hasherJeton,
  verifierEmpreinte,
  verifierJetonApi,
  estJetonExpire,
  estJetonRevoque,
  expirationParDefaut,
  type JetonApi,
} from "@/lib/domain/jeton-api";

function makeJeton(overrides: Partial<JetonApi> = {}): JetonApi {
  const { token, empreinte } = genererJetonApi();
  return {
    id: "jeton-1",
    empreinte,
    utilisateurId: "user-1",
    tenantId: "tenant-1",
    creeLe: new Date("2026-01-01"),
    expireLe: new Date("2026-12-31"),
    revoqueLe: null,
    libelle: "Test",
    ...overrides,
  };
}

describe("genererJetonApi", () => {
  it("génère un token de 64 caractères hex", () => {
    const { token } = genererJetonApi();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it("génère une empreinte SHA-256 de 64 caractères hex", () => {
    const { empreinte } = genererJetonApi();
    expect(empreinte).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(empreinte)).toBe(true);
  });

  it("l'empreinte ne contient pas le token en clair", () => {
    const { token, empreinte } = genererJetonApi();
    expect(empreinte).not.toBe(token);
    expect(empreinte).not.toContain(token);
  });

  it("deux générations produisent des tokens différents", () => {
    const a = genererJetonApi();
    const b = genererJetonApi();
    expect(a.token).not.toBe(b.token);
    expect(a.empreinte).not.toBe(b.empreinte);
  });
});

describe("hasherJeton", () => {
  it("produit un hash déterministe", () => {
    const token = "abc123";
    expect(hasherJeton(token)).toBe(hasherJeton(token));
  });

  it("produit des hashes différents pour des tokens différents", () => {
    expect(hasherJeton("abc")).not.toBe(hasherJeton("def"));
  });
});

describe("verifierEmpreinte", () => {
  it("retourne true pour un token et son empreinte correcte", () => {
    const { token, empreinte } = genererJetonApi();
    expect(verifierEmpreinte(token, empreinte)).toBe(true);
  });

  it("retourne false pour un token incorrect", () => {
    const { empreinte } = genererJetonApi();
    expect(verifierEmpreinte("wrong-token", empreinte)).toBe(false);
  });

  it("retourne false pour des entrées vides", () => {
    expect(verifierEmpreinte("", "abc")).toBe(false);
    expect(verifierEmpreinte("abc", "")).toBe(false);
    expect(verifierEmpreinte("", "")).toBe(false);
  });
});

describe("verifierJetonApi", () => {
  it("retourne le jeton si valide", () => {
    const { token } = genererJetonApi();
    const jeton = makeJeton();
    // On doit re-générer avec le bon token
    const empreinte = hasherJeton(token);
    const jetonValide = { ...jeton, empreinte };
    const result = verifierJetonApi(token, [jetonValide]);
    expect(result).not.toBeNull();
    expect(result?.utilisateurId).toBe("user-1");
  });

  it("retourne null pour un token inexistant", () => {
    const jeton = makeJeton();
    expect(verifierJetonApi("nonexistent", [jeton])).toBeNull();
  });

  it("retourne null pour un token expiré", () => {
    const { token } = genererJetonApi();
    const jeton = makeJeton({
      empreinte: hasherJeton(token),
      expireLe: new Date("2020-01-01"),
    });
    expect(verifierJetonApi(token, [jeton], new Date("2026-06-01"))).toBeNull();
  });

  it("retourne null pour un token révoqué", () => {
    const { token } = genererJetonApi();
    const jeton = makeJeton({
      empreinte: hasherJeton(token),
      revoqueLe: new Date("2026-03-01"),
    });
    expect(verifierJetonApi(token, [jeton], new Date("2026-06-01"))).toBeNull();
  });

  it("retourne null pour une liste vide", () => {
    expect(verifierJetonApi("any", [])).toBeNull();
  });
});

describe("estJetonExpire", () => {
  it("retourne true si la date d'expiration est passée", () => {
    const jeton = makeJeton({ expireLe: new Date("2020-01-01") });
    expect(estJetonExpire(jeton, new Date("2026-01-01"))).toBe(true);
  });

  it("retourne false si la date d'expiration est future", () => {
    const jeton = makeJeton({ expireLe: new Date("2027-01-01") });
    expect(estJetonExpire(jeton, new Date("2026-01-01"))).toBe(false);
  });
});

describe("estJetonRevoque", () => {
  it("retourne true si revoqueLe n'est pas null", () => {
    const jeton = makeJeton({ revoqueLe: new Date("2026-03-01") });
    expect(estJetonRevoque(jeton)).toBe(true);
  });

  it("retourne false si revoqueLe est null", () => {
    const jeton = makeJeton({ revoqueLe: null });
    expect(estJetonRevoque(jeton)).toBe(false);
  });
});

describe("expirationParDefaut", () => {
  it("retourne une date 90 jours après la création", () => {
    const creeLe = new Date("2026-01-01");
    const expire = expirationParDefaut(creeLe, 90);
    expect(expire.getTime() - creeLe.getTime()).toBe(90 * 24 * 60 * 60 * 1000);
  });
});
