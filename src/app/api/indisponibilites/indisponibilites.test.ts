import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    indisponibiliteEnseignant: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
  requireSiteIdForCreate: vi.fn(() => null),
  isRelationScopedRole: vi.fn(() => false),
}));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { requireSiteIdForCreate } from "@/lib/site-scope";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCheckPermission = checkPermission as ReturnType<typeof vi.fn>;
const mockRequireSiteIdForCreate =
  requireSiteIdForCreate as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  indisponibiliteEnseignant: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

function req(url: string, body?: unknown) {
  return { url, json: () => Promise.resolve(body) } as unknown as Request;
}

const { GET, POST } = await import("@/app/api/indisponibilites/route");
const { DELETE } = await import("@/app/api/indisponibilites/[id]/route");

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const SESSION = {
  user: { id: "u1", tenantId: "t1", role: "TENANT_ADMIN", siteId: null },
};

const VALID_BODY = {
  enseignantId: "e1",
  jour: "LUNDI",
  heureDebut: "10:00",
  heureFin: "12:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckPermission.mockReturnValue(null);
  mockRequireSiteIdForCreate.mockReturnValue(null);
  mockAuth.mockResolvedValue(SESSION);
});

// ---------------------------------------------------------------------------
// GET /api/indisponibilites
// ---------------------------------------------------------------------------

describe("GET /api/indisponibilites", () => {
  it("refuse l'accès sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req("http://l") as never);
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission emploi-du-temps:read", async () => {
    mockCheckPermission.mockReturnValue(
      new Response("Forbidden", { status: 403 })
    );
    const res = await GET(req("http://l") as never);
    expect(res.status).toBe(403);
  });

  it("liste les indisponibilités du tenant", async () => {
    mockPrisma.indisponibiliteEnseignant.findMany.mockResolvedValue([
      { id: "ind1", jour: "LUNDI", heureDebut: "10:00" },
    ]);
    const res = await GET(req("http://l") as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
  });

  it("filtre par enseignantId", async () => {
    mockPrisma.indisponibiliteEnseignant.findMany.mockResolvedValue([]);
    await GET(req("http://l?enseignantId=e1") as never);
    const where =
      mockPrisma.indisponibiliteEnseignant.findMany.mock.calls[0][0].where;
    expect(where.enseignantId).toBe("e1");
    expect(where.tenantId).toBe("t1");
  });
});

// ---------------------------------------------------------------------------
// POST /api/indisponibilites
// ---------------------------------------------------------------------------

describe("POST /api/indisponibilites", () => {
  it("refuse l'accès sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(req("http://l", VALID_BODY) as never);
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission emploi-du-temps:write", async () => {
    mockCheckPermission.mockReturnValue(
      new Response("Forbidden", { status: 403 })
    );
    const res = await POST(req("http://l", VALID_BODY) as never);
    expect(res.status).toBe(403);
  });

  it("rejette les données invalides (400)", async () => {
    const res = await POST(
      req("http://l", { enseignantId: "", jour: "XYZ" }) as never
    );
    expect(res.status).toBe(400);
  });

  it("crée une indisponibilité manuelle avec source SAISIE_MANUELLE par défaut", async () => {
    mockPrisma.indisponibiliteEnseignant.create.mockResolvedValue({
      id: "ind1",
      ...VALID_BODY,
      source: "SAISIE_MANUELLE",
    });
    const res = await POST(req("http://l", VALID_BODY) as never);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("ind1");
    const createData =
      mockPrisma.indisponibiliteEnseignant.create.mock.calls[0][0].data;
    expect(createData.tenantId).toBe("t1");
    expect(createData.enseignantId).toBe("e1");
    expect(createData.source).toBe("SAISIE_MANUELLE");
  });

  it("respecte la source fournie dans le corps", async () => {
    mockPrisma.indisponibiliteEnseignant.create.mockResolvedValue({
      id: "ind2",
      source: "CONGE",
    });
    await POST(
      req("http://l", { ...VALID_BODY, source: "CONGE" }) as never
    );
    const createData =
      mockPrisma.indisponibiliteEnseignant.create.mock.calls[0][0].data;
    expect(createData.source).toBe("CONGE");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/indisponibilites/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/indisponibilites/:id", () => {
  it("refuse l'accès sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(
      req("http://l") as never,
      params("ind1") as never
    );
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission emploi-du-temps:write", async () => {
    mockCheckPermission.mockReturnValue(
      new Response("Forbidden", { status: 403 })
    );
    const res = await DELETE(
      req("http://l") as never,
      params("ind1") as never
    );
    expect(res.status).toBe(403);
  });

  it("retourne 404 si l'indisponibilité n'existe pas", async () => {
    mockPrisma.indisponibiliteEnseignant.findFirst.mockResolvedValue(null);
    const res = await DELETE(
      req("http://l") as never,
      params("xyz") as never
    );
    expect(res.status).toBe(404);
  });

  it("supprime l'indisponibilité", async () => {
    mockPrisma.indisponibiliteEnseignant.findFirst.mockResolvedValue({
      id: "ind1",
    });
    mockPrisma.indisponibiliteEnseignant.delete.mockResolvedValue({
      id: "ind1",
    });
    const res = await DELETE(
      req("http://l") as never,
      params("ind1") as never
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(mockPrisma.indisponibiliteEnseignant.delete).toHaveBeenCalledWith({
      where: { id: "ind1" },
    });
  });
});
