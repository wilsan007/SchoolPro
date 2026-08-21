import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    seancePedagogique: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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
  seancePedagogique: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

function req(url: string, body?: unknown) {
  return { url, json: () => Promise.resolve(body) } as unknown as Request;
}

const { GET, POST } = await import("@/app/api/cahier-journal/seances/route");
const {
  GET: GETItem,
  PATCH,
  DELETE,
} = await import("@/app/api/cahier-journal/seances/[id]/route");

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckPermission.mockReturnValue(null);
  mockAuth.mockResolvedValue({
    user: { id: "u1", tenantId: "t1", role: "TEACHER", siteId: null },
  });
});

describe("GET /api/cahier-journal/seances", () => {
  it("refuse l'accès sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req("http://l") as never);
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission curriculum:read", async () => {
    mockCheckPermission.mockReturnValue(
      new Response("Forbidden", { status: 403 })
    );
    const res = await GET(req("http://l") as never);
    expect(res.status).toBe(403);
  });

  it("liste les séances du tenant", async () => {
    mockPrisma.seancePedagogique.findMany.mockResolvedValue([
      { id: "s1", matiere: { nom: "Maths" } },
    ]);
    const res = await GET(req("http://l") as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.seances).toHaveLength(1);
    expect(
      mockPrisma.seancePedagogique.findMany.mock.calls[0][0].where.tenantId
    ).toBe("t1");
  });

  it("filtre par classe, matière, semaine et statut", async () => {
    mockPrisma.seancePedagogique.findMany.mockResolvedValue([]);
    await GET(
      req(
        "http://l?classeId=c1&matiereId=m1&semaine=5&statut=EFFECTUEE"
      ) as never
    );
    const where = mockPrisma.seancePedagogique.findMany.mock.calls[0][0].where;
    expect(where.classeId).toBe("c1");
    expect(where.matiereId).toBe("m1");
    expect(where.semaine).toBe(5);
    expect(where.statut).toBe("EFFECTUEE");
  });
});

describe("POST /api/cahier-journal/seances", () => {
  it("refuse sans la permission curriculum:write", async () => {
    mockCheckPermission.mockReturnValue(
      new Response("Forbidden", { status: 403 })
    );
    const res = await POST(
      req("http://l", { classeId: "c1", matiereId: "m1", date: "2025-01-01", semaine: 1 }) as never
    );
    expect(res.status).toBe(403);
  });

  it("rejette les données invalides", async () => {
    const res = await POST(
      req("http://l", { classeId: "", matiereId: "" }) as never
    );
    expect(res.status).toBe(400);
  });

  it("crée une séance avec compétences", async () => {
    mockPrisma.seancePedagogique.create.mockResolvedValue({
      id: "s1",
      statut: "PLANIFIEE",
    });
    const res = await POST(
      req("http://l", {
        classeId: "c1",
        matiereId: "m1",
        date: "2025-01-01T10:00:00Z",
        dureePrevue: 60,
        semaine: 3,
        competences: [
          { competenceId: "cp1", niveau: "ABORDEE" },
        ],
      }) as never
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("s1");
    const createData = mockPrisma.seancePedagogique.create.mock.calls[0][0].data;
    expect(createData.tenantId).toBe("t1");
    expect(createData.semaine).toBe(3);
    expect(createData.competences.create).toHaveLength(1);
  });
});

describe("GET /api/cahier-journal/seances/:id", () => {
  it("retourne 404 si la séance n'existe pas", async () => {
    mockPrisma.seancePedagogique.findFirst.mockResolvedValue(null);
    const res = await GETItem(req("http://l") as never, params("xyz") as never);
    expect(res.status).toBe(404);
  });

  it("retourne la séance avec ses relations", async () => {
    mockPrisma.seancePedagogique.findFirst.mockResolvedValue({
      id: "s1",
      matiere: { nom: "Maths" },
      competences: [],
    });
    const res = await GETItem(req("http://l") as never, params("s1") as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("s1");
  });
});

describe("PATCH /api/cahier-journal/seances/:id", () => {
  it("retourne 404 si la séance n'existe pas", async () => {
    mockPrisma.seancePedagogique.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      req("http://l", { statut: "EFFECTUEE" }) as never,
      params("xyz") as never
    );
    expect(res.status).toBe(404);
  });

  it("met à jour le statut et le contenu", async () => {
    mockPrisma.seancePedagogique.findFirst.mockResolvedValue({ id: "s1" });
    mockPrisma.seancePedagogique.update.mockResolvedValue({
      id: "s1",
      statut: "EFFECTUEE",
      contenu: "Chapitre 3 traité",
    });
    const res = await PATCH(
      req("http://l", { statut: "EFFECTUEE", contenu: "Chapitre 3 traité" }) as never,
      params("s1") as never
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.statut).toBe("EFFECTUEE");
  });

  it("remplace les compétences quand fournies", async () => {
    mockPrisma.seancePedagogique.findFirst.mockResolvedValue({ id: "s1" });
    mockPrisma.seancePedagogique.update.mockResolvedValue({ id: "s1" });
    await PATCH(
      req("http://l", {
        competences: [
          { competenceId: "cp1", niveau: "MAITRISEE" },
          { competenceId: "cp2", niveau: "ABORDEE" },
        ],
      }) as never,
      params("s1") as never
    );
    const updateData = mockPrisma.seancePedagogique.update.mock.calls[0][0].data;
    expect(updateData.competences.deleteMany).toEqual({});
    expect(updateData.competences.create).toHaveLength(2);
  });
});

describe("DELETE /api/cahier-journal/seances/:id", () => {
  it("retourne 404 si la séance n'existe pas", async () => {
    mockPrisma.seancePedagogique.findFirst.mockResolvedValue(null);
    const res = await DELETE(req("http://l") as never, params("xyz") as never);
    expect(res.status).toBe(404);
  });

  it("supprime la séance", async () => {
    mockPrisma.seancePedagogique.findFirst.mockResolvedValue({ id: "s1" });
    mockPrisma.seancePedagogique.delete.mockResolvedValue({ id: "s1" });
    const res = await DELETE(req("http://l") as never, params("s1") as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
