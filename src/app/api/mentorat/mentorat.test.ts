import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    mentorat: {
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
  mentorat: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

function req(url: string, body?: unknown) {
  return { url, json: () => Promise.resolve(body) } as unknown as Request;
}

const { GET, POST } = await import("@/app/api/mentorat/route");
const { GET: GETItem, PATCH } = await import("@/app/api/mentorat/[id]/route");

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckPermission.mockReturnValue(null);
  mockAuth.mockResolvedValue({
    user: { id: "u1", tenantId: "t1", role: "PRINCIPAL" },
  });
});

describe("GET /api/mentorat", () => {
  it("refuse l'accès sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req("http://l") as never);
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission mentorat:read", async () => {
    mockCheckPermission.mockReturnValue(new Response("Forbidden", { status: 403 }));
    const res = await GET(req("http://l") as never);
    expect(res.status).toBe(403);
  });

  it("liste les mentorats du tenant", async () => {
    mockPrisma.mentorat.findMany.mockResolvedValue([
      { id: "m1", mentor: { name: "A" }, mentore: { name: "B" } },
    ]);
    const res = await GET(req("http://l") as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mentorats).toHaveLength(1);
    expect(mockPrisma.mentorat.findMany.mock.calls[0][0].where.tenantId).toBe("t1");
  });

  it("filtre par statut", async () => {
    mockPrisma.mentorat.findMany.mockResolvedValue([]);
    await GET(req("http://l?statut=ACTIF") as never);
    expect(mockPrisma.mentorat.findMany.mock.calls[0][0].where.statut).toBe("ACTIF");
  });
});

describe("POST /api/mentorat", () => {
  it("crée un mentorat valide", async () => {
    mockPrisma.mentorat.findFirst.mockResolvedValue(null);
    mockPrisma.mentorat.create.mockResolvedValue({ id: "m1" });
    const res = await POST(req("http://l", {
      mentorId: "u1",
      mentoreId: "u2",
      type: "ACADEMIQUE",
    }) as never);
    expect(res.status).toBe(201);
    const call = mockPrisma.mentorat.create.mock.calls[0][0];
    expect(call.data.tenantId).toBe("t1");
    expect(call.data.mentorId).toBe("u1");
  });

  it("rejette si mentor = mentoré", async () => {
    const res = await POST(req("http://l", {
      mentorId: "u1",
      mentoreId: "u1",
    }) as never);
    expect(res.status).toBe(400);
  });

  it("rejette si une relation active existe déjà", async () => {
    mockPrisma.mentorat.findFirst.mockResolvedValue({ id: "m0", statut: "ACTIF" });
    const res = await POST(req("http://l", {
      mentorId: "u1",
      mentoreId: "u2",
    }) as never);
    expect(res.status).toBe(409);
  });
});

describe("GET /api/mentorat/[id]", () => {
  it("404 si le mentorat n'existe pas dans le tenant", async () => {
    mockPrisma.mentorat.findFirst.mockResolvedValue(null);
    const res = await GETItem(req("http://l") as never, params("m1") as never);
    expect(res.status).toBe(404);
  });

  it("retourne le mentorat avec ses relations", async () => {
    mockPrisma.mentorat.findFirst.mockResolvedValue({
      id: "m1",
      mentor: { name: "A" },
      mentore: { name: "B" },
      objectifs: [],
      seances: [],
    });
    const res = await GETItem(req("http://l") as never, params("m1") as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("m1");
  });
});

describe("PATCH /api/mentorat/[id]", () => {
  it("modifie le statut d'un mentorat", async () => {
    mockPrisma.mentorat.findFirst.mockResolvedValue({ id: "m1" });
    mockPrisma.mentorat.update.mockResolvedValue({ id: "m1", statut: "TERMINE" });
    const res = await PATCH(req("http://l", { statut: "TERMINE" }) as never, params("m1") as never);
    expect(res.status).toBe(200);
    const call = mockPrisma.mentorat.update.mock.calls[0][0];
    expect(call.data.statut).toBe("TERMINE");
    // Terminer enregistre automatiquement la date de fin
    expect(call.data.dateFin).toBeInstanceOf(Date);
  });

  it("404 si le mentorat n'existe pas", async () => {
    mockPrisma.mentorat.findFirst.mockResolvedValue(null);
    const res = await PATCH(req("http://l", { statut: "SUSPENDU" }) as never, params("m1") as never);
    expect(res.status).toBe(404);
  });
});
