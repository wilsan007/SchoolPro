import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    candidature: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    classe: {
      findFirst: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
  requireSiteIdForCreate: vi.fn(() => null),
}));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { requireSiteIdForCreate } from "@/lib/site-scope";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCheckPermission = checkPermission as ReturnType<typeof vi.fn>;
const mockRequireSiteIdForCreate = requireSiteIdForCreate as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  candidature: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  classe: { findFirst: ReturnType<typeof vi.fn> };
  tenant: { findUnique: ReturnType<typeof vi.fn> };
};

/** Fabrique un faux objet Request avec headers et json(). */
function req(url: string, body?: unknown, headers: Record<string, string> = {}) {
  const h = new Map<string, string>();
  h.set("x-forwarded-for", "127.0.0.1");
  h.set("host", "ecole.localhost");
  for (const [k, v] of Object.entries(headers)) h.set(k, v);
  return {
    url,
    headers: {
      get: (name: string) => h.get(name.toLowerCase()) ?? null,
    },
    json: () => Promise.resolve(body),
  } as unknown as Request;
}

const { GET, POST } = await import("@/app/api/admissions/route");

/** Corps de candidature valide pour POST. */
const candidatureBody = {
  nom: "Diallo",
  prenom: "Awa",
  dateNaissance: "2015-03-10",
  sexe: "F" as const,
  annee: "2025-2026",
  classeVoulue: "6ème A",
  parentNom: "Diallo",
  parentPrenom: "Mariama",
  parentPhone: "+22177000000",
  parentLien: "MERE" as const,
};

const sessionUser = {
  id: "u1",
  tenantId: "t1",
  role: "TENANT_ADMIN",
  siteId: "s1",
  siteIds: ["s1"],
  tenantHasSites: true,
  name: "Admin",
};

/** Réinitialise tous les mocks Prisma à leur état initial. */
function resetAllPrismaMocks() {
  for (const model of Object.values(mockPrisma)) {
    if (typeof model === "object" && model !== null) {
      for (const fn of Object.values(model)) {
        if (typeof fn === "function" && "mockReset" in fn) {
          (fn as ReturnType<typeof vi.fn>).mockReset();
        }
      }
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAllPrismaMocks();
  mockCheckPermission.mockReturnValue(null);
  mockRequireSiteIdForCreate.mockReturnValue(null);
  mockAuth.mockResolvedValue({ user: sessionUser });
  mockPrisma.candidature.count.mockResolvedValue(0);
  mockPrisma.candidature.create.mockResolvedValue({ id: "cand-1" });
});

// ──────────────────────────────────────────────────────────────────
// GET /api/admissions
// ──────────────────────────────────────────────────────────────────
describe("GET /api/admissions", () => {
  it("refuse l'accès sans session (401)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req("http://l/api/admissions") as never);
    expect(res.status).toBe(401);
  });

  it("refuse l'accès sans la permission admissions:read (403)", async () => {
    mockCheckPermission.mockReturnValue(
      new Response(null, { status: 403 }) as never
    );
    const res = await GET(req("http://l/api/admissions") as never);
    expect(res.status).toBe(403);
  });

  it("retourne la liste des candidatures filtrée par tenant", async () => {
    const mockList = [{ id: "c1", nom: "Diallo" }];
    mockPrisma.candidature.findMany.mockResolvedValue(mockList);
    const res = await GET(req("http://l/api/admissions") as never);
    const data = await res.json();
    expect(data.candidatures).toEqual(mockList);
    const where = mockPrisma.candidature.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
  });

  it("filtre par statut quand le query param est présent", async () => {
    mockPrisma.candidature.findMany.mockResolvedValue([]);
    await GET(req("http://l/api/admissions?statut=SOUMISE") as never);
    const where = mockPrisma.candidature.findMany.mock.calls[0][0].where;
    expect(where.statut).toBe("SOUMISE");
  });

  it("filtre par année quand le query param est présent", async () => {
    mockPrisma.candidature.findMany.mockResolvedValue([]);
    await GET(req("http://l/api/admissions?annee=2025-2026") as never);
    const where = mockPrisma.candidature.findMany.mock.calls[0][0].where;
    expect(where.annee).toBe("2025-2026");
  });
});

// ──────────────────────────────────────────────────────────────────
// POST /api/admissions
// ──────────────────────────────────────────────────────────────────
describe("POST /api/admissions", () => {
  it("crée une candidature avec session active et siteId", async () => {
    const res = await POST(req("http://l/api/admissions", candidatureBody) as never);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.candidature).toEqual({ id: "cand-1" });
    // La création doit inclure tenantId et creeParId
    const createData = mockPrisma.candidature.create.mock.calls[0][0].data;
    expect(createData.tenantId).toBe("t1");
    expect(createData.creeParId).toBe("u1");
  });

  it("refuse la création si « Tous les sites » sélectionné (400)", async () => {
    mockRequireSiteIdForCreate.mockReturnValue(
      "Veuillez sélectionner un site avant de créer un élément. Utilisez le sélecteur de site en haut de la page."
    );
    const res = await POST(req("http://l/api/admissions", candidatureBody) as never);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("sélectionner un site");
    expect(mockPrisma.candidature.create).not.toHaveBeenCalled();
  });

  it("crée une candidature publique (sans session) via le slug du host", async () => {
    mockAuth.mockResolvedValue(null);
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: "t-pub" });
    const res = await POST(req("http://ecole.localhost/api/admissions", candidatureBody) as never);
    expect(res.status).toBe(201);
    const createData = mockPrisma.candidature.create.mock.calls[0][0].data;
    expect(createData.tenantId).toBe("t-pub");
    // Pas de creeParId pour un appel public
    expect(createData.creeParId).toBeUndefined();
  });

  it("retourne 404 si le tenant est introuvable (appel public)", async () => {
    mockAuth.mockResolvedValue(null);
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    const res = await POST(req("http://ecole.localhost/api/admissions", candidatureBody) as never);
    expect(res.status).toBe(404);
  });

  it("retourne 429 si trop de candidatures récentes (rate limiting)", async () => {
    mockPrisma.candidature.count.mockResolvedValue(51);
    const res = await POST(req("http://l/api/admissions", candidatureBody) as never);
    expect(res.status).toBe(429);
  });

  it("résout classeId → nom + siteId quand fourni avec session", async () => {
    mockPrisma.classe.findFirst.mockResolvedValue({ nom: "Terminale A", siteId: "s1" });
    const res = await POST(
      req("http://l/api/admissions", { ...candidatureBody, classeId: "cl-1", classeVoulue: undefined }) as never
    );
    expect(res.status).toBe(201);
    const createData = mockPrisma.candidature.create.mock.calls[0][0].data;
    expect(createData.classeVoulue).toBe("Terminale A");
    expect(createData.siteId).toBe("s1");
  });

  it("retourne 400 si classeId fourni mais classe introuvable", async () => {
    mockPrisma.classe.findFirst.mockResolvedValue(null);
    const res = await POST(
      req("http://l/api/admissions", { ...candidatureBody, classeId: "cl-x" }) as never
    );
    expect(res.status).toBe(400);
  });

  it("retourne 400 si les données sont invalides (ZodError)", async () => {
    const res = await POST(
      req("http://l/api/admissions", { ...candidatureBody, nom: "" }) as never
    );
    expect(res.status).toBe(400);
  });

  it("retourne 400 si aucune classe n'est spécifiée (classeVoulue vide)", async () => {
    const res = await POST(
      req("http://l/api/admissions", { ...candidatureBody, classeVoulue: "" }) as never
    );
    expect(res.status).toBe(400);
  });
});
