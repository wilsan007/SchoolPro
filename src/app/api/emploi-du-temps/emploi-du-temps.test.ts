import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    emploiTemps: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));

vi.mock("@/lib/annee-scolaire", () => ({
  getAnneeCouranteLibelle: vi.fn().mockResolvedValue("2025-2026"),
}));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
  siteFilterForRelation: vi.fn(() => ({})),
  isRelationScopedRole: vi.fn(() => false),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCheckPermission = checkPermission as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  emploiTemps: {
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

const { GET, POST } = await import("@/app/api/emploi-du-temps/route");
const { PATCH, DELETE } = await import("@/app/api/emploi-du-temps/[id]/route");

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const SESSION = {
  user: { id: "u1", tenantId: "t1", role: "TENANT_ADMIN", siteId: null },
};

const VALID_BODY = {
  classeId: "c1",
  matiereId: "m1",
  enseignantId: "e1",
  jour: "LUNDI",
  heureDebut: "08:00",
  heureFin: "09:00",
  salle: "Salle 101",
  periodeId: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckPermission.mockReturnValue(null);
  mockAuth.mockResolvedValue(SESSION);
});

// ---------------------------------------------------------------------------
// GET /api/emploi-du-temps
// ---------------------------------------------------------------------------

describe("GET /api/emploi-du-temps", () => {
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

  it("liste les créneaux du tenant", async () => {
    mockPrisma.emploiTemps.findMany.mockResolvedValue([
      { id: "edt1", jour: "LUNDI", heureDebut: "08:00" },
    ]);
    const res = await GET(req("http://l") as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(mockPrisma.emploiTemps.findMany).toHaveBeenCalledOnce();
  });

  it("filtre par classeId et periodeId", async () => {
    mockPrisma.emploiTemps.findMany.mockResolvedValue([]);
    await GET(
      req("http://l?classeId=c1&periodeId=p1") as never
    );
    const where = mockPrisma.emploiTemps.findMany.mock.calls[0][0].where;
    expect(where.classeId).toBe("c1");
    expect(where.OR).toEqual([{ periodeId: "p1" }, { periodeId: null }]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/emploi-du-temps
// ---------------------------------------------------------------------------

describe("POST /api/emploi-du-temps", () => {
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
      req("http://l", { classeId: "", matiereId: "" }) as never
    );
    expect(res.status).toBe(400);
  });

  it("crée un créneau quand il n'y a pas de conflit", async () => {
    mockPrisma.emploiTemps.findFirst.mockResolvedValue(null); // pas de conflit
    mockPrisma.emploiTemps.create.mockResolvedValue({
      id: "edt1",
      ...VALID_BODY,
      matiere: { nom: "Maths" },
      classe: { nom: "6A" },
      enseignant: null,
    });
    const res = await POST(req("http://l", VALID_BODY) as never);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("edt1");
    const createData = mockPrisma.emploiTemps.create.mock.calls[0][0].data;
    expect(createData.tenantId).toBe("t1");
    expect(createData.classeId).toBe("c1");
  });

  it("détecte un conflit de classe (409)", async () => {
    mockPrisma.emploiTemps.findFirst.mockResolvedValueOnce({
      id: "edt-existant",
    }); // overlap classe
    const res = await POST(req("http://l", VALID_BODY) as never);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("chevauche");
  });

  it("détecte un conflit d'enseignant (409)", async () => {
    mockPrisma.emploiTemps.findFirst
      .mockResolvedValueOnce(null) // pas de conflit classe
      .mockResolvedValueOnce({ id: "edt-ens" }); // conflit enseignant
    const res = await POST(req("http://l", VALID_BODY) as never);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("enseignant");
  });

  it("détecte un conflit de salle (409)", async () => {
    mockPrisma.emploiTemps.findFirst
      .mockResolvedValueOnce(null) // pas de conflit classe
      .mockResolvedValueOnce(null) // pas de conflit enseignant
      .mockResolvedValueOnce({ id: "edt-salle" }); // conflit salle
    const res = await POST(req("http://l", VALID_BODY) as never);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("salle");
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/emploi-du-temps/[id]
// ---------------------------------------------------------------------------

describe("PATCH /api/emploi-du-temps/:id", () => {
  it("refuse l'accès sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(
      req("http://l", { salle: "Salle 102" }) as never,
      params("edt1") as never
    );
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission emploi-du-temps:write", async () => {
    mockCheckPermission.mockReturnValue(
      new Response("Forbidden", { status: 403 })
    );
    const res = await PATCH(
      req("http://l", { salle: "Salle 102" }) as never,
      params("edt1") as never
    );
    expect(res.status).toBe(403);
  });

  it("retourne 404 si le créneau n'existe pas", async () => {
    mockPrisma.emploiTemps.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      req("http://l", { salle: "Salle 102" }) as never,
      params("xyz") as never
    );
    expect(res.status).toBe(404);
  });

  it("met à jour le créneau sans conflit", async () => {
    // findFirst est appelé pour : 1) existing, 2) teacher conflict, 3) room conflict
    mockPrisma.emploiTemps.findFirst
      .mockResolvedValueOnce({
        id: "edt1",
        classeId: "c1",
        jour: "LUNDI",
        heureDebut: "08:00",
        heureFin: "09:00",
        salle: "Salle 101",
        enseignantId: "e1",
        periodeId: null,
      })
      .mockResolvedValueOnce(null) // pas de conflit enseignant
      .mockResolvedValueOnce(null); // pas de conflit salle
    mockPrisma.emploiTemps.findMany.mockResolvedValue([]); // pas d'overlap classe
    mockPrisma.emploiTemps.update.mockResolvedValue({
      id: "edt1",
      salle: "Salle 102",
    });
    const res = await PATCH(
      req("http://l", { salle: "Salle 102" }) as never,
      params("edt1") as never
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("edt1");
  });

  it("détecte un conflit de classe lors de la mise à jour (409)", async () => {
    mockPrisma.emploiTemps.findFirst.mockResolvedValue({
      id: "edt1",
      classeId: "c1",
      jour: "LUNDI",
      heureDebut: "08:00",
      heureFin: "09:00",
      salle: null,
      enseignantId: null,
      periodeId: null,
    });
    mockPrisma.emploiTemps.findMany.mockResolvedValue([
      { id: "edt2", salle: null },
    ]); // overlap
    const res = await PATCH(
      req("http://l", { heureDebut: "08:30" }) as never,
      params("edt1") as never
    );
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("chevauche");
  });

  it("autorise deux groupes différents sur le même créneau", async () => {
    // findFirst : 1) existing, 2) room conflict (enseignantId null → pas de teacher check)
    mockPrisma.emploiTemps.findFirst
      .mockResolvedValueOnce({
        id: "edt1",
        classeId: "c1",
        jour: "LUNDI",
        heureDebut: "08:00",
        heureFin: "09:00",
        salle: "Salle 101 (Groupe A)",
        enseignantId: null,
        periodeId: null,
      })
      .mockResolvedValueOnce(null); // pas de conflit salle
    mockPrisma.emploiTemps.findMany.mockResolvedValue([
      { id: "edt2", salle: "Salle 102 (Groupe B)" },
    ]); // groupe différent = pas un conflit
    mockPrisma.emploiTemps.update.mockResolvedValue({ id: "edt1" });
    const res = await PATCH(
      req("http://l", { salle: "Salle 101 (Groupe A)" }) as never,
      params("edt1") as never
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/emploi-du-temps/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/emploi-du-temps/:id", () => {
  it("refuse l'accès sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(
      req("http://l") as never,
      params("edt1") as never
    );
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission emploi-du-temps:delete", async () => {
    mockCheckPermission.mockReturnValue(
      new Response("Forbidden", { status: 403 })
    );
    const res = await DELETE(
      req("http://l") as never,
      params("edt1") as never
    );
    expect(res.status).toBe(403);
  });

  it("retourne 404 si le créneau n'existe pas", async () => {
    mockPrisma.emploiTemps.findFirst.mockResolvedValue(null);
    const res = await DELETE(
      req("http://l") as never,
      params("xyz") as never
    );
    expect(res.status).toBe(404);
  });

  it("supprime le créneau", async () => {
    mockPrisma.emploiTemps.findFirst.mockResolvedValue({ id: "edt1" });
    mockPrisma.emploiTemps.delete.mockResolvedValue({ id: "edt1" });
    const res = await DELETE(
      req("http://l") as never,
      params("edt1") as never
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockPrisma.emploiTemps.delete).toHaveBeenCalledWith({
      where: { id: "edt1" },
    });
  });
});
