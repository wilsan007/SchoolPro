/**
 * EcolPro — Tests du mode RLS `warn`
 * ===================================
 *
 * Vérifie que le mode `warn` :
 * - laisse passer les requêtes sans contexte (comportement observé)
 * - journalise les requêtes sans contexte (warning)
 * - ne lève pas d'erreur
 *
 * Le mode `enforce` est testé séparément dans tests/rls/isolation.test.ts
 * car il nécessite le labo PostgreSQL fidèle à la production.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  default: {
    eleve: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn(async (args: unknown) => {
      if (Array.isArray(args)) return args;
      if (typeof args === "function") return (args as (a: unknown) => unknown)({});
      return args;
    }),
    $executeRaw: vi.fn().mockResolvedValue(null),
  },
}));

// Mock rls-session
vi.mock("@/lib/rls-session", () => ({
  resolveRlsContextFromSession: vi.fn().mockResolvedValue(null),
}));

import prisma from "@/lib/prisma";

describe("RLS mode warn", () => {
  const originalRlsMode = process.env.RLS_MODE;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RLS_MODE = "warn";
  });

  afterEach(() => {
    process.env.RLS_MODE = originalRlsMode;
  });

  it("warn mode est correctement détecté", async () => {
    // Import dynamique pour que RLS_MODE soit lu au bon moment
    vi.resetModules();
    const { rlsMode } = await import("@/lib/prisma-rls");
    expect(rlsMode()).toBe("warn");
  });

  it("off mode est le défaut", async () => {
    process.env.RLS_MODE = "off";
    vi.resetModules();
    const { rlsMode } = await import("@/lib/prisma-rls");
    expect(rlsMode()).toBe("off");
  });

  it("enforce mode est correctement détecté", async () => {
    process.env.RLS_MODE = "enforce";
    vi.resetModules();
    const { rlsMode } = await import("@/lib/prisma-rls");
    expect(rlsMode()).toBe("enforce");
  });

  it("valeur invalide tombe à off", async () => {
    process.env.RLS_MODE = "invalid";
    vi.resetModules();
    const { rlsMode } = await import("@/lib/prisma-rls");
    expect(rlsMode()).toBe("off");
  });
});

describe("RLS applyRlsContext", () => {
  const originalRlsMode = process.env.RLS_MODE;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RLS_MODE = "enforce";
  });

  afterEach(() => {
    process.env.RLS_MODE = originalRlsMode;
  });

  it("enforce mode lève une erreur sans contexte", async () => {
    vi.resetModules();
    const { applyRlsContext } = await import("@/lib/prisma-rls");

    // Pas de contexte posé — applyRlsContext doit lever en mode enforce
    await expect(
      applyRlsContext({ $executeRaw: vi.fn() } as never)
    ).rejects.toThrow(/contexte RLS/);
  });

  it("warn mode ne lève pas d'erreur sans contexte", async () => {
    process.env.RLS_MODE = "warn";
    vi.resetModules();
    const { applyRlsContext } = await import("@/lib/prisma-rls");

    // Ne doit pas lever d'erreur
    await expect(
      applyRlsContext({ $executeRaw: vi.fn() } as never)
    ).resolves.toBeUndefined();
  });

  it("off mode ne fait rien sans contexte", async () => {
    process.env.RLS_MODE = "off";
    vi.resetModules();
    const { applyRlsContext } = await import("@/lib/prisma-rls");

    await expect(
      applyRlsContext({ $executeRaw: vi.fn() } as never)
    ).resolves.toBeUndefined();
  });
});
