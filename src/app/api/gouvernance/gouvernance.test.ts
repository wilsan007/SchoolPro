import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    conseil: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    réunion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    résolution: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCheckPermission = checkPermission as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  conseil: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  réunion: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  résolution: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

function req(url: string, body?: unknown) {
  return { url, json: () => Promise.resolve(body) } as unknown as Request;
}

const { GET: GETConseils, POST: POSTConseil } = await import(
  "@/app/api/gouvernance/conseils/route"
);
const { GET: GETConseil, PATCH: PATCHConseil, DELETE: DELETEConseil } = await import(
  "@/app/api/gouvernance/conseils/[id]/route"
);
const { GET: GETReunions, POST: POSTReunion } = await import(
  "@/app/api/gouvernance/reunions/route"
);
const { PATCH: PATCHReunion } = await import(
  "@/app/api/gouvernance/reunions/[id]/route"
);
const { GET: GETResolutions, POST: POSTResolution } = await import(
  "@/app/api/gouvernance/resolutions/route"
);
const { PATCH: PATCHResolution } = await import(
  "@/app/api/gouvernance/resolutions/[id]/route"
);

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckPermission.mockReturnValue(null);
  mockAuth.mockResolvedValue({
    user: { id: "u1", tenantId: "t1", role: "PRINCIPAL" },
  });
});

// ════════════════════════════════════════════════════════════
// Conseils
// ════════════════════════════════════════════════════════════

describe("GET /api/gouvernance/conseils", () => {
  it("refuse l'accès sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GETConseils();
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission gouvernance:read", async () => {
    mockCheckPermission.mockReturnValue(new Response("Forbidden", { status: 403 }));
    const res = await GETConseils();
    expect(res.status).toBe(403);
  });

  it("liste les conseils du tenant", async () => {
    mockPrisma.conseil.findMany.mockResolvedValue([
      { id: "c1", nom: "CA", type: "ADMINISTRATION", membres: [], reunions: [], _count: {} },
    ]);
    const res = await GETConseils();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conseils).toHaveLength(1);
    expect(mockPrisma.conseil.findMany.mock.calls[0][0].where.tenantId).toBe("t1");
  });
});

describe("POST /api/gouvernance/conseils", () => {
  it("crée un conseil valide", async () => {
    mockPrisma.conseil.create.mockResolvedValue({ id: "c1", nom: "CA" });
    const res = await POSTConseil(req("http://l", {
      nom: "Conseil d'administration",
      type: "ADMINISTRATION",
      frequence: "TRIMESTRIEL",
    }) as never);
    expect(res.status).toBe(201);
    const call = mockPrisma.conseil.create.mock.calls[0][0];
    expect(call.data.tenantId).toBe("t1");
    expect(call.data.nom).toBe("Conseil d'administration");
  });

  it("rejette un type invalide", async () => {
    const res = await POSTConseil(req("http://l", {
      nom: "Test",
      type: "INVALIDE",
    }) as never);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/gouvernance/conseils/[id]", () => {
  it("404 si le conseil n'existe pas dans le tenant", async () => {
    mockPrisma.conseil.findFirst.mockResolvedValue(null);
    const res = await GETConseil(req("http://l") as never, params("c1") as never);
    expect(res.status).toBe(404);
  });

  it("retourne le conseil avec ses relations", async () => {
    mockPrisma.conseil.findFirst.mockResolvedValue({
      id: "c1",
      nom: "CA",
      membres: [],
      reunions: [],
      resolutions: [],
    });
    const res = await GETConseil(req("http://l") as never, params("c1") as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("c1");
  });
});

describe("PATCH /api/gouvernance/conseils/[id]", () => {
  it("modifie un conseil existant", async () => {
    mockPrisma.conseil.findFirst.mockResolvedValue({ id: "c1" });
    mockPrisma.conseil.update.mockResolvedValue({ id: "c1", nom: "Nouveau nom" });
    const res = await PATCHConseil(req("http://l", { nom: "Nouveau nom" }) as never, params("c1") as never);
    expect(res.status).toBe(200);
  });

  it("404 si le conseil n'existe pas", async () => {
    mockPrisma.conseil.findFirst.mockResolvedValue(null);
    const res = await PATCHConseil(req("http://l", { nom: "Nouveau" }) as never, params("c1") as never);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/gouvernance/conseils/[id]", () => {
  it("supprime un conseil existant", async () => {
    mockPrisma.conseil.findFirst.mockResolvedValue({ id: "c1" });
    mockPrisma.conseil.delete.mockResolvedValue({});
    const res = await DELETEConseil(req("http://l") as never, params("c1") as never);
    expect(res.status).toBe(200);
  });

  it("404 si le conseil n'existe pas", async () => {
    mockPrisma.conseil.findFirst.mockResolvedValue(null);
    const res = await DELETEConseil(req("http://l") as never, params("c1") as never);
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════
// Réunions
// ════════════════════════════════════════════════════════════

describe("GET /api/gouvernance/reunions", () => {
  it("liste les réunions du tenant", async () => {
    mockPrisma.réunion.findMany.mockResolvedValue([
      { id: "r1", titre: "Réunion 1", conseil: { id: "c1", nom: "CA" } },
    ]);
    const res = await GETReunions(req("http://l") as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reunions).toHaveLength(1);
  });

  it("filtre par conseilId", async () => {
    mockPrisma.réunion.findMany.mockResolvedValue([]);
    await GETReunions(req("http://l?conseilId=c1") as never);
    expect(mockPrisma.réunion.findMany.mock.calls[0][0].where.conseilId).toBe("c1");
  });
});

describe("POST /api/gouvernance/reunions", () => {
  it("crée une réunion pour un conseil du tenant", async () => {
    mockPrisma.conseil.findFirst.mockResolvedValue({ id: "c1" });
    mockPrisma.réunion.create.mockResolvedValue({ id: "r1" });
    const res = await POSTReunion(req("http://l", {
      conseilId: "c1",
      titre: "Réunion trimestrielle",
      date: "2026-03-15T10:00:00.000Z",
    }) as never);
    expect(res.status).toBe(201);
  });

  it("404 si le conseil n'existe pas dans le tenant", async () => {
    mockPrisma.conseil.findFirst.mockResolvedValue(null);
    const res = await POSTReunion(req("http://l", {
      conseilId: "c-x",
      titre: "Test",
      date: "2026-03-15",
    }) as never);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/gouvernance/reunions/[id]", () => {
  it("met à jour le statut et le compte-rendu", async () => {
    mockPrisma.réunion.findFirst.mockResolvedValue({ id: "r1" });
    mockPrisma.réunion.update.mockResolvedValue({ id: "r1", statut: "TERMINEE" });
    const res = await PATCHReunion(req("http://l", {
      statut: "TERMINEE",
      compteRendu: "Réunion close. Décisions adoptées.",
    }) as never, params("r1") as never);
    expect(res.status).toBe(200);
    const call = mockPrisma.réunion.update.mock.calls[0][0];
    expect(call.data.statut).toBe("TERMINEE");
  });

  it("404 si la réunion n'existe pas", async () => {
    mockPrisma.réunion.findFirst.mockResolvedValue(null);
    const res = await PATCHReunion(req("http://l", { statut: "TERMINEE" }) as never, params("r1") as never);
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════
// Résolutions
// ════════════════════════════════════════════════════════════

describe("GET /api/gouvernance/resolutions", () => {
  it("liste les résolutions du tenant", async () => {
    mockPrisma.résolution.findMany.mockResolvedValue([
      { id: "res1", titre: "R1", conseil: { id: "c1", nom: "CA" } },
    ]);
    const res = await GETResolutions(req("http://l") as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.resolutions).toHaveLength(1);
  });
});

describe("POST /api/gouvernance/resolutions", () => {
  it("crée une résolution rattachée à un conseil", async () => {
    mockPrisma.conseil.findFirst.mockResolvedValue({ id: "c1" });
    mockPrisma.résolution.create.mockResolvedValue({ id: "res1" });
    const res = await POSTResolution(req("http://l", {
      conseilId: "c1",
      titre: "Adoption du règlement",
    }) as never);
    expect(res.status).toBe(201);
    const call = mockPrisma.résolution.create.mock.calls[0][0];
    expect(call.data.statut).toBe("EN_ATTENTE");
  });
});

describe("PATCH /api/gouvernance/resolutions/[id]", () => {
  it("enregistre un vote (ADOPTÉE) avec date automatique", async () => {
    mockPrisma.résolution.findFirst.mockResolvedValue({ id: "res1" });
    mockPrisma.résolution.update.mockResolvedValue({ id: "res1", statut: "ADOPTÉE" });
    const res = await PATCHResolution(req("http://l", {
      statut: "ADOPTÉE",
      resultats: { pour: 5, contre: 1, abstentions: 0 },
    }) as never, params("res1") as never);
    expect(res.status).toBe(200);
    const call = mockPrisma.résolution.update.mock.calls[0][0];
    expect(call.data.statut).toBe("ADOPTÉE");
    expect(call.data.dateVote).toBeInstanceOf(Date);
  });

  it("404 si la résolution n'existe pas", async () => {
    mockPrisma.résolution.findFirst.mockResolvedValue(null);
    const res = await PATCHResolution(req("http://l", { statut: "ADOPTÉE" }) as never, params("res1") as never);
    expect(res.status).toBe(404);
  });
});
