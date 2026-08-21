import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks partagés ---

vi.mock("@/lib/mobile-auth", () => ({
  verifyMobileToken: vi.fn(),
  verifyMobileScope: vi.fn(),
  mobileUnauthorized: vi.fn(
    () => new Response(JSON.stringify({ error: "Token invalide ou expiré" }), { status: 401 })
  ),
}));

vi.mock("@/lib/tenant-claims", () => ({
  deriveClaims: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    eleve: { count: vi.fn(), findMany: vi.fn() },
    classe: { count: vi.fn() },
    note: { count: vi.fn(), findMany: vi.fn() },
    absence: { count: vi.fn(), findMany: vi.fn() },
    evaluation: { findMany: vi.fn() },
    deviceToken: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/demo-now", () => ({
  getDemoNow: vi.fn(async () => new Date("2025-11-15T10:00:00Z")),
  bornesDuJour: vi.fn(() => ({
    debut: new Date("2025-11-15T00:00:00Z"),
    fin: new Date("2025-11-15T23:59:59Z"),
  })),
}));

vi.mock("@/lib/site-scope", () => ({
  eleveScopeFilter: vi.fn(() => ({})),
  siteFilterForModel: vi.fn(() => ({})),
  siteFilterForRelation: vi.fn(() => ({})),
}));

vi.mock("@/lib/site-filter", () => ({
  eleveScopeFilter: vi.fn(() => ({})),
  mergeFilters: vi.fn((...filters: object[]) => Object.assign({}, ...filters)),
}));

import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import prisma from "@/lib/prisma";

const mockVerifyMobileScope = verifyMobileScope as ReturnType<typeof vi.fn>;
const mockMobileUnauthorized = mobileUnauthorized as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  eleve: { count: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  classe: { count: ReturnType<typeof vi.fn> };
  note: { count: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  absence: { count: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  evaluation: { findMany: ReturnType<typeof vi.fn> };
  deviceToken: { upsert: ReturnType<typeof vi.fn> };
};

const AUTHED_SCOPE = {
  id: "u1",
  email: "parent@test.com",
  role: "PARENT",
  tenantId: "t1",
  siteId: null,
  siteIds: [],
  tenantHasSites: false,
};

function req(url: string, opts?: { headers?: Record<string, string>; body?: unknown }) {
  return {
    url,
    headers: new Headers(opts?.headers),
    json: async () => opts?.body ?? {},
  } as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyMobileScope.mockResolvedValue(AUTHED_SCOPE);
  mockMobileUnauthorized.mockReturnValue(
    new Response(JSON.stringify({ error: "Token invalide ou expiré" }), { status: 401 })
  );
  mockPrisma.eleve.count.mockResolvedValue(0);
  mockPrisma.classe.count.mockResolvedValue(0);
  mockPrisma.note.count.mockResolvedValue(0);
  mockPrisma.note.findMany.mockResolvedValue([]);
  mockPrisma.absence.count.mockResolvedValue(0);
  mockPrisma.absence.findMany.mockResolvedValue([]);
  mockPrisma.evaluation.findMany.mockResolvedValue([]);
  mockPrisma.eleve.findMany.mockResolvedValue([]);
  mockPrisma.deviceToken.upsert.mockResolvedValue({ id: "d1" });
});

// ─── /api/mobile/dashboard ──────────────────────────────────────

const dashboardRoute = await import("@/app/api/mobile/dashboard/route");

describe("GET /api/mobile/dashboard", () => {
  it("refuse sans token mobile", async () => {
    mockVerifyMobileScope.mockResolvedValue(null);
    const res = await dashboardRoute.GET(req("http://l"));
    expect(res.status).toBe(401);
  });

  it("refuse sans tenantId", async () => {
    mockVerifyMobileScope.mockResolvedValue({ ...AUTHED_SCOPE, tenantId: null });
    const res = await dashboardRoute.GET(req("http://l"));
    expect(res.status).toBe(403);
  });

  it("renvoie les stats dashboard", async () => {
    mockPrisma.eleve.count.mockResolvedValue(42);
    mockPrisma.classe.count.mockResolvedValue(5);
    const res = await dashboardRoute.GET(req("http://l"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.stats.totalEleves).toBe(42);
    expect(data.stats.totalClasses).toBe(5);
    expect(data.absencesRecentes).toEqual([]);
    expect(data.prochainsExamens).toEqual([]);
  });

  it("filtre les élèves par tenantId", async () => {
    await dashboardRoute.GET(req("http://l"));
    const where = mockPrisma.eleve.count.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.statut).toBe("ACTIF");
  });
});

// ─── /api/mobile/eleves ─────────────────────────────────────────

const elevesRoute = await import("@/app/api/mobile/eleves/route");

describe("GET /api/mobile/eleves", () => {
  it("refuse sans token mobile", async () => {
    mockVerifyMobileScope.mockResolvedValue(null);
    const res = await elevesRoute.GET(req("http://l"));
    expect(res.status).toBe(401);
  });

  it("renvoie une liste d'élèves", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([
      { id: "e1", matricule: "M001", nom: "Ahmed", prenom: "Ali", classe: { id: "c1", nom: "T A", niveau: "T" } },
    ]);
    const res = await elevesRoute.GET(req("http://l"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.eleves).toHaveLength(1);
    expect(data.eleves[0].nom).toBe("Ahmed");
  });

  it("filtre par classeId quand fourni", async () => {
    await elevesRoute.GET(req("http://l?classeId=c1"));
    expect(mockPrisma.eleve.findMany).toHaveBeenCalled();
  });

  it("filtre par recherche q", async () => {
    await elevesRoute.GET(req("http://l?q=ahmed"));
    expect(mockPrisma.eleve.findMany).toHaveBeenCalled();
  });
});

// ─── /api/mobile/register-device ────────────────────────────────

const registerRoute = await import("@/app/api/mobile/register-device/route");

describe("POST /api/mobile/register-device", () => {
  it("refuse sans token mobile", async () => {
    mockVerifyMobileScope.mockResolvedValue(null);
    const res = await registerRoute.POST(req("http://l", {
      body: { token: "valid-token-1234567890", platform: "ios" },
    }));
    expect(res.status).toBe(401);
  });

  it("rejette les données invalides", async () => {
    const res = await registerRoute.POST(req("http://l", {
      body: { token: "x", platform: "invalid" },
    }));
    expect(res.status).toBe(400);
  });

  it("enregistre un token valide", async () => {
    const res = await registerRoute.POST(req("http://l", {
      body: { token: "valid-token-1234567890", platform: "ios" },
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.deviceId).toBe("d1");
    expect(mockPrisma.deviceToken.upsert).toHaveBeenCalled();
  });

  it("upsert associe le token à l'utilisateur connecté", async () => {
    await registerRoute.POST(req("http://l", {
      body: { token: "valid-token-1234567890", platform: "android" },
    }));
    const args = mockPrisma.deviceToken.upsert.mock.calls[0][0];
    expect(args.create.userId).toBe("u1");
    expect(args.create.platform).toBe("ANDROID");
  });
});
