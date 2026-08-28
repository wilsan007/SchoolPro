import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks des dépendances externes ---

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    invitationReinscription: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
  mergeFilters: vi.fn((...fragments: Record<string, unknown>[]) => {
    // Reproduit le comportement réel de mergeFilters pour les tests
    const conditions: unknown[] = [];
    const out: Record<string, unknown> = {};
    for (const fragment of fragments) {
      if (!fragment) continue;
      for (const [key, value] of Object.entries(fragment)) {
        if (key === "AND") {
          conditions.push(...(Array.isArray(value) ? value : [value]));
        } else {
          out[key] = value;
        }
      }
    }
    if (conditions.length > 0) out.AND = conditions;
    return out;
  }),
}));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  invitationReinscription: { findMany: ReturnType<typeof vi.fn> };
};

function req(url: string) {
  return { url } as unknown as import("next/server").NextRequest;
}

const { GET } = await import("./route");

const SESSION = {
  user: {
    id: "u1",
    tenantId: "t1",
    role: "TENANT_ADMIN",
    siteId: null,
    siteIds: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
});

describe("GET /api/reinscription/invitations", () => {
  // ── Cas nominaux ──────────────────────────────────────────────

  it("liste les invitations d'une campagne", async () => {
    const invitations = [
      {
        id: "inv-1",
        statut: "INVITE",
        eleve: {
          id: "ele-1",
          nom: "Dupont",
          prenom: "Marie",
          matricule: "M-001",
          statut: "INSCRIT",
          classe: { nom: "5ème A", niveau: "5EME" },
          parents: [
            {
              parent: { nom: "Dupont", prenom: "Jean", phone: "+123", email: "j@d.com" },
            },
          ],
        },
      },
    ];
    mockPrisma.invitationReinscription.findMany.mockResolvedValue(invitations);

    const res = await GET(req("http://localhost/api/reinscription/invitations?campagneId=camp-1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.invitations).toHaveLength(1);
    expect(data.invitations[0].eleve.nom).toBe("Dupont");

    // Vérifie le filtre par campagneId et tenantId
    const where = mockPrisma.invitationReinscription.findMany.mock.calls[0][0].where;
    expect(where.campagneId).toBe("camp-1");
    expect(where.tenantId).toBe("t1");
  });

  it("filtre par statut quand le paramètre est fourni", async () => {
    mockPrisma.invitationReinscription.findMany.mockResolvedValue([]);

    await GET(req("http://localhost/api/reinscription/invitations?campagneId=camp-1&statut=CONFIRME"));

    const where = mockPrisma.invitationReinscription.findMany.mock.calls[0][0].where;
    expect(where.statut).toBe("CONFIRME");
  });

  it("n'applique pas de filtre statut quand statut=ALL", async () => {
    mockPrisma.invitationReinscription.findMany.mockResolvedValue([]);

    await GET(req("http://localhost/api/reinscription/invitations?campagneId=camp-1&statut=ALL"));

    const where = mockPrisma.invitationReinscription.findMany.mock.calls[0][0].where;
    expect(where.statut).toBeUndefined();
  });

  it("inclut les informations de l'élève et des parents", async () => {
    mockPrisma.invitationReinscription.findMany.mockResolvedValue([]);

    await GET(req("http://localhost/api/reinscription/invitations?campagneId=camp-1"));

    const query = mockPrisma.invitationReinscription.findMany.mock.calls[0][0];
    expect(query.include.eleve.select).toEqual(
      expect.objectContaining({
        id: true,
        nom: true,
        prenom: true,
        matricule: true,
        statut: true,
      })
    );
    expect(query.include.eleve.select.classe).toBeDefined();
    expect(query.include.eleve.select.parents).toBeDefined();
  });

  // ── Cas d'erreur ──────────────────────────────────────────────

  it("renvoie NON_AUTORISE sans session", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await GET(req("http://localhost/api/reinscription/invitations?campagneId=camp-1"));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe("NON_AUTORISE");
  });

  it("renvoie NON_AUTORISE sans tenantId", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", tenantId: null } });

    const res = await GET(req("http://localhost/api/reinscription/invitations?campagneId=camp-1"));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe("NON_AUTORISE");
  });

  it("renvoie DONNEES_INVALIDES sans campagneId", async () => {
    const res = await GET(req("http://localhost/api/reinscription/invitations"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("DONNEES_INVALIDES");
  });
});
