import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks des dépendances externes ---

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => {
  const mock = {
    tache: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    notification: { create: vi.fn() },
    user: { findFirst: vi.fn() },
  };
  return { default: mock, prisma: mock };
});

vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
}));

vi.mock("@/lib/annee-scolaire", () => ({
  getAnneeCouranteLibelle: vi.fn(async () => "2025-2026"),
}));

vi.mock("@/lib/tache-engine", () => ({
  synchroniserTachesAuto: vi.fn(async () => ({
    created: 0,
    closed: 0,
    total: 0,
  })),
}));

vi.mock("@/lib/tache-buckets", () => ({
  bucketPour: vi.fn(() => "SANS_ECHEANCE"),
  BUCKET_ORDER: [
    "EN_RETARD",
    "AUJOURDHUI",
    "SEMAINE",
    "SEMAINE_PROCHAINE",
    "PLUS_TARD",
    "SANS_ECHEANCE",
  ],
}));

const DATE_REF = new Date("2026-04-07T10:00:00.000Z");
vi.mock("@/lib/demo-now", () => ({ getDemoNow: vi.fn(async () => DATE_REF) }));

vi.mock("@/lib/teacher-classes", () => ({
  getTeacherScope: vi.fn(async () => ({
    classeIds: [],
    matiereIds: [],
    isRestricted: false,
  })),
  isTeacherRole: vi.fn(() => false),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { synchroniserTachesAuto } from "@/lib/tache-engine";
import { bucketPour } from "@/lib/tache-buckets";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCheckPermission = checkPermission as ReturnType<typeof vi.fn>;
const mockSyncTaches = synchroniserTachesAuto as ReturnType<typeof vi.fn>;
const mockBucketPour = bucketPour as ReturnType<typeof vi.fn>;

const mockPrisma = prisma as unknown as {
  tache: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  notification: { create: ReturnType<typeof vi.fn> };
  user: { findFirst: ReturnType<typeof vi.fn> };
};

function req(url: string, body?: unknown) {
  return {
    url,
    json: () => Promise.resolve(body),
  } as unknown as import("next/server").NextRequest;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const { GET, POST } = await import("./route");
const { PATCH } = await import("./[id]/route");

const SESSION = {
  user: {
    id: "u1",
    tenantId: "t1",
    role: "TENANT_ADMIN",
    siteId: null,
    siteIds: [],
    name: "Admin",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
  mockCheckPermission.mockReturnValue(null); // permission accordée par défaut
  mockSyncTaches.mockResolvedValue({ created: 0, closed: 0, total: 0 });
  mockBucketPour.mockReturnValue("SANS_ECHEANCE");
  mockPrisma.notification.create.mockResolvedValue({});
});

// ────────────────────────────────────────────────────────────────
// GET /api/taches
// ────────────────────────────────────────────────────────────────

describe("GET /api/taches", () => {
  it("renvoie 401 sans session", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await GET(req("http://localhost/api/taches"));
    expect(res.status).toBe(401);
  });

  it("renvoie 403 sans permission taches:read", async () => {
    mockCheckPermission.mockReturnValue(
      new Response(JSON.stringify({ error: "Accès refusé" }), { status: 403 })
    );

    const res = await GET(req("http://localhost/api/taches"));
    expect(res.status).toBe(403);
  });

  it("renvoie les tâches de l'utilisateur connecté par défaut (mine=1)", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([
      {
        id: "t1",
        titre: "Ma tâche",
        description: null,
        type: "autre",
        priorite: "NORMALE",
        statut: "A_FAIRE",
        echeance: null,
        dateFaite: null,
        sourceType: null,
        sourceId: null,
        assigneeA: { id: "u1", name: "Admin", email: "a@test.com" },
        creePar: null,
        classe: null,
        matiere: null,
        createdAt: new Date(),
      },
    ]);

    const res = await GET(req("http://localhost/api/taches"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.taches).toHaveLength(1);
    expect(data.taches[0].titre).toBe("Ma tâche");

    // Filtre par assigneeAId = session.user.id
    const where = mockPrisma.tache.findMany.mock.calls[0][0].where;
    expect(where.assigneeAId).toBe("u1");
  });

  it("renvoie toutes les tâches avec mine=0", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([]);

    await GET(req("http://localhost/api/taches?mine=0"));

    const where = mockPrisma.tache.findMany.mock.calls[0][0].where;
    expect(where.assigneeAId).toBeUndefined();
  });

  it("filtre par assigneeAId explicite", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([]);

    await GET(req("http://localhost/api/taches?assigneeAId=user-2"));

    const where = mockPrisma.tache.findMany.mock.calls[0][0].where;
    expect(where.assigneeAId).toBe("user-2");
  });

  it("filtre par statut", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([]);

    await GET(req("http://localhost/api/taches?statut=EN_COURS"));

    const where = mockPrisma.tache.findMany.mock.calls[0][0].where;
    expect(where.statut).toBe("EN_COURS");
  });

  it("déclenche synchroniserTachesAuto avec ?sync=1", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([]);

    await GET(req("http://localhost/api/taches?sync=1"));

    expect(mockSyncTaches).toHaveBeenCalledWith("t1", expect.objectContaining({ siteId: null }));
  });

  it("ne déclenche pas synchroniserTachesAuto sans ?sync=1", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([]);

    await GET(req("http://localhost/api/taches"));

    expect(mockSyncTaches).not.toHaveBeenCalled();
  });

  it("filtre par bucket temporel quand ?bucket= est fourni", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([
      {
        id: "t1",
        titre: "Tâche 1",
        description: null,
        type: "autre",
        priorite: "NORMALE",
        statut: "A_FAIRE",
        echeance: new Date("2026-04-07"),
        dateFaite: null,
        sourceType: null,
        sourceId: null,
        assigneeA: { id: "u1", name: "Admin", email: "a@test.com" },
        creePar: null,
        classe: null,
        matiere: null,
        createdAt: new Date(),
      },
      {
        id: "t2",
        titre: "Tâche 2",
        description: null,
        type: "autre",
        priorite: "HAUTE",
        statut: "A_FAIRE",
        echeance: null,
        dateFaite: null,
        sourceType: null,
        sourceId: null,
        assigneeA: { id: "u1", name: "Admin", email: "a@test.com" },
        creePar: null,
        classe: null,
        matiere: null,
        createdAt: new Date(),
      },
    ]);
    // bucketPour renvoie SANS_ECHEANCE pour tout, donc seul t2 (échéance null) passe
    mockBucketPour.mockImplementation(
      (_echeance: unknown, statut: string) => (statut === "FAIT" ? "PLUS_TARD" : "SANS_ECHEANCE")
    );

    const res = await GET(req("http://localhost/api/taches?bucket=SANS_ECHEANCE"));
    expect(res.status).toBe(200);
    const data = await res.json();
    // Les deux tâches sont classées SANS_ECHEANCE par le mock
    expect(data.taches).toHaveLength(2);

    // bucketPour a été appelé pour chaque tâche
    expect(mockBucketPour).toHaveBeenCalled();
  });

  it("sérialise echeance et dateFaite en ISO string", async () => {
    const echeance = new Date("2026-04-10T12:00:00.000Z");
    mockPrisma.tache.findMany.mockResolvedValue([
      {
        id: "t1",
        titre: "Tâche",
        description: null,
        type: "autre",
        priorite: "NORMALE",
        statut: "A_FAIRE",
        echeance,
        dateFaite: null,
        sourceType: "eval",
        sourceId: "e1",
        assigneeA: { id: "u1", name: "A", email: "a@t.com" },
        creePar: null,
        classe: null,
        matiere: null,
        createdAt: new Date(),
      },
    ]);

    const res = await GET(req("http://localhost/api/taches"));
    const data = await res.json();
    expect(data.taches[0].echeance).toBe(echeance.toISOString());
    expect(data.taches[0].dateFaite).toBeNull();
    expect(data.taches[0].sourceType).toBe("eval");
    expect(data.taches[0].sourceId).toBe("e1");
  });
});

// ────────────────────────────────────────────────────────────────
// POST /api/taches
// ────────────────────────────────────────────────────────────────

describe("POST /api/taches", () => {
  const VALID_BODY = {
    assigneeAId: "user-2",
    titre: "Préparer le conseil de classe",
    type: "autre",
    priorite: "NORMALE",
  };

  it("crée une tâche manuelle avec un body valide", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "user-2", name: "Prof" });
    mockPrisma.tache.create.mockResolvedValue({
      id: "t-new",
      titre: "Préparer le conseil de classe",
      assigneeA: { name: "Prof", email: "p@test.com" },
      creePar: { name: "Admin" },
    });

    const res = await POST(req("http://localhost/api/taches", VALID_BODY));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("t-new");
    expect(data.titre).toBe("Préparer le conseil de classe");

    expect(mockPrisma.tache.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t1",
          assigneeAId: "user-2",
          creeParId: "u1",
          titre: "Préparer le conseil de classe",
          statut: "A_FAIRE",
        }),
      })
    );

    // Une notification est créée pour l'assignataire
    expect(mockPrisma.notification.create).toHaveBeenCalled();
  });

  it("renvoie 401 sans session", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await POST(req("http://localhost/api/taches", VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("renvoie 403 sans permission taches:write", async () => {
    mockCheckPermission.mockReturnValue(
      new Response(JSON.stringify({ error: "Accès refusé" }), { status: 403 })
    );

    const res = await POST(req("http://localhost/api/taches", VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("renvoie 404 si l'assignataire n'existe pas dans le tenant", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const res = await POST(req("http://localhost/api/taches", VALID_BODY));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("introuvable");
  });

  it("renvoie 400 si le body est invalide (ZodError)", async () => {
    const res = await POST(
      req("http://localhost/api/taches", { assigneeAId: "", titre: "" })
    );
    expect(res.status).toBe(400);
  });

  it("ne plante pas si la notification échoue (non-bloquante)", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "user-2", name: "Prof" });
    mockPrisma.tache.create.mockResolvedValue({
      id: "t-new",
      titre: "Tâche",
      assigneeA: { name: "Prof", email: "p@test.com" },
      creePar: { name: "Admin" },
    });
    mockPrisma.notification.create.mockRejectedValue(new Error("DB down"));

    const res = await POST(req("http://localhost/api/taches", VALID_BODY));
    expect(res.status).toBe(201);
  });
});

// ────────────────────────────────────────────────────────────────
// PATCH /api/taches/[id]
// ────────────────────────────────────────────────────────────────

describe("PATCH /api/taches/[id]", () => {
  it("met à jour le statut vers EN_COURS (STARTED)", async () => {
    mockPrisma.tache.findFirst.mockResolvedValue({
      id: "t1",
      titre: "Tâche 1",
      statut: "A_FAIRE",
      creeParId: null,
    });
    mockPrisma.tache.update.mockResolvedValue({
      id: "t1",
      titre: "Tâche 1",
      statut: "EN_COURS",
      assigneeA: { name: "Admin", email: "a@test.com" },
      creePar: null,
    });

    const res = await PATCH(
      req("http://localhost/api/taches/t1", { statut: "EN_COURS" }),
      params("t1")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.statut).toBe("EN_COURS");

    expect(mockPrisma.tache.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1" },
        data: expect.objectContaining({ statut: "EN_COURS" }),
      })
    );
  });

  it("met à jour le statut vers FAIT (COMPLETED) et enregistre dateFaite", async () => {
    mockPrisma.tache.findFirst.mockResolvedValue({
      id: "t1",
      titre: "Tâche 1",
      statut: "EN_COURS",
      creeParId: "creator-1",
    });
    mockPrisma.tache.update.mockResolvedValue({
      id: "t1",
      titre: "Tâche 1",
      statut: "FAIT",
      assigneeA: { name: "Admin", email: "a@test.com" },
      creePar: { name: "Creator" },
    });

    const res = await PATCH(
      req("http://localhost/api/taches/t1", { statut: "FAIT" }),
      params("t1")
    );
    expect(res.status).toBe(200);

    // dateFaite est enregistrée quand le statut passe à FAIT
    expect(mockPrisma.tache.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statut: "FAIT",
          dateFaite: expect.any(Date),
        }),
      })
    );

    // Une notification est envoyée au créateur
    expect(mockPrisma.notification.create).toHaveBeenCalled();
  });

  it("ne notifie pas le créateur si il n'y en a pas (creeParId null)", async () => {
    mockPrisma.tache.findFirst.mockResolvedValue({
      id: "t1",
      titre: "Tâche auto",
      statut: "A_FAIRE",
      creeParId: null,
    });
    mockPrisma.tache.update.mockResolvedValue({
      id: "t1",
      titre: "Tâche auto",
      statut: "FAIT",
      assigneeA: { name: "Admin", email: "a@test.com" },
      creePar: null,
    });

    await PATCH(
      req("http://localhost/api/taches/t1", { statut: "FAIT" }),
      params("t1")
    );

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it("rouvre une tâche (REOPENED : statut retour à A_FAIRE)", async () => {
    mockPrisma.tache.findFirst.mockResolvedValue({
      id: "t1",
      titre: "Tâche 1",
      statut: "FAIT",
      creeParId: null,
    });
    mockPrisma.tache.update.mockResolvedValue({
      id: "t1",
      titre: "Tâche 1",
      statut: "A_FAIRE",
      assigneeA: { name: "Admin", email: "a@test.com" },
      creePar: null,
    });

    const res = await PATCH(
      req("http://localhost/api/taches/t1", { statut: "A_FAIRE" }),
      params("t1")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.statut).toBe("A_FAIRE");

    // Pas de dateFaite ajoutée (ce n'est pas un passage vers FAIT)
    const updateData = mockPrisma.tache.update.mock.calls[0][0].data;
    expect(updateData.dateFaite).toBeUndefined();
  });

  it("renvoie 401 sans session", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await PATCH(
      req("http://localhost/api/taches/t1", { statut: "EN_COURS" }),
      params("t1")
    );
    expect(res.status).toBe(401);
  });

  it("renvoie 403 sans permission taches:write", async () => {
    mockCheckPermission.mockReturnValue(
      new Response(JSON.stringify({ error: "Accès refusé" }), { status: 403 })
    );

    const res = await PATCH(
      req("http://localhost/api/taches/t1", { statut: "EN_COURS" }),
      params("t1")
    );
    expect(res.status).toBe(403);
  });

  it("renvoie 404 si la tâche n'existe pas", async () => {
    mockPrisma.tache.findFirst.mockResolvedValue(null);

    const res = await PATCH(
      req("http://localhost/api/taches/inexistant", { statut: "EN_COURS" }),
      params("inexistant")
    );
    expect(res.status).toBe(404);
  });

  it("renvoie 400 si le body est invalide (ZodError)", async () => {
    const res = await PATCH(
      req("http://localhost/api/taches/t1", { statut: "INVALIDE" }),
      params("t1")
    );
    expect(res.status).toBe(400);
  });

  it("met à jour le titre et la description", async () => {
    mockPrisma.tache.findFirst.mockResolvedValue({
      id: "t1",
      titre: "Ancien titre",
      statut: "A_FAIRE",
      creeParId: null,
    });
    mockPrisma.tache.update.mockResolvedValue({
      id: "t1",
      titre: "Nouveau titre",
      statut: "A_FAIRE",
      assigneeA: { name: "Admin", email: "a@test.com" },
      creePar: null,
    });

    const res = await PATCH(
      req("http://localhost/api/taches/t1", {
        titre: "Nouveau titre",
        description: "Description mise à jour",
      }),
      params("t1")
    );
    expect(res.status).toBe(200);

    expect(mockPrisma.tache.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          titre: "Nouveau titre",
          description: "Description mise à jour",
        }),
      })
    );
  });
});
