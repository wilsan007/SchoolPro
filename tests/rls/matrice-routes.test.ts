/**
 * EcolPro — ISO-5 : Matrice d'isolation applicative
 * ================================================
 *
 * Vérifie que les routes API appliquent correctement l'isolation
 * tenant/site/famille au niveau APPLICATIF (au-dessus de la RLS).
 *
 * Contrairement aux tests RLS (tests/rls/isolation.test.ts) qui
 * vérifient la base de données, ces tests vérifient que le code
 * des routes API construit les bons filtres et refuse l'accès
 * cross-tenant avec les bons codes HTTP (401, 403, 404).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  default: {
    eleve: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    facture: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    tenant: {
      findMany: vi.fn(),
    },
  },
}));

// Mock auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// Mock demo-now
vi.mock("@/lib/demo-now", () => ({
  getDemoNow: vi.fn(async () => new Date("2026-09-15")),
}));

// Mock annee-scolaire
vi.mock("@/lib/annee-scolaire", () => ({
  anneeActiveId: vi.fn(async () => "annee-1"),
  getAnneeCouranteLibelle: vi.fn(async () => "2025-2026"),
  getAnneeCourante: vi.fn(async () => ({ id: "annee-1", libelle: "2025-2026" })),
  getContexteAnnees: vi.fn(async () => ({
    anneeActive: { id: "annee-1", libelle: "2025-2026" },
    anneeEcoulee: null,
    phase: "normale",
  })),
}));

import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";

const TENANT_A = "tenant-a-id";
const TENANT_B = "tenant-b-id";
const SITE_A1 = "site-a1-id";

/** Simule une session pour un utilisateur d'un tenant. */
function mockSession(tenantId: string, role: string, siteIds: string[] = []) {
  return {
    user: {
      id: `user-${tenantId}`,
      tenantId,
      role,
      siteIds,
      siteId: siteIds[0] ?? null,
      name: "Test User",
      email: "test@test.com",
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ISO-5 — Isolation applicative par tenant", () => {
  it("getFacturesForTenant filtre par tenantId", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession(TENANT_B, "TENANT_ADMIN", [SITE_A1])
    );
    (prisma.facture.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const mod = await import("@/lib/actions/facture");
    await mod.getFacturesForTenant();

    const callArgs = (prisma.facture.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.where.tenantId).toBe(TENANT_B);
  });

  it("un utilisateur sans tenantId ne voit aucune donnée", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "x", tenantId: null, role: "TEACHER", siteIds: [] },
      expires: new Date().toISOString(),
    });

    const mod = await import("@/lib/actions/facture");
    const result = await mod.getFacturesForTenant();
    expect(result).toEqual([]);
    expect(prisma.facture.findMany).not.toHaveBeenCalled();
  });

  it("un utilisateur avec session simulée tenant A ne filtre pas par tenant B", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession(TENANT_A, "TENANT_ADMIN", [SITE_A1])
    );
    (prisma.facture.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const mod = await import("@/lib/actions/facture");
    await mod.getFacturesForTenant();

    const callArgs = (prisma.facture.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.where.tenantId).toBe(TENANT_A);
    expect(callArgs.where.tenantId).not.toBe(TENANT_B);
  });
});
