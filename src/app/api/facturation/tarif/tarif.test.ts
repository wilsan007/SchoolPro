import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    classe: {
      findFirst: vi.fn(),
    },
    tarifNiveau: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
}));

vi.mock("@/lib/annee-scolaire", () => ({
  getAnneeCouranteLibelle: vi.fn(async () => "2025-2026"),
}));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCheckPermission = checkPermission as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  classe: { findFirst: ReturnType<typeof vi.fn> };
  tarifNiveau: { findFirst: ReturnType<typeof vi.fn> };
};

function req(url: string) {
  return { url } as unknown as Request;
}

const { GET } = await import("@/app/api/facturation/tarif/route");

const sessionUser = {
  id: "u1",
  tenantId: "t1",
  role: "ACCOUNTANT",
  siteId: "s1",
  siteIds: ["s1"],
  tenantHasSites: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.classe.findFirst.mockReset();
  mockPrisma.tarifNiveau.findFirst.mockReset();
  mockCheckPermission.mockReturnValue(null);
  mockAuth.mockResolvedValue({ user: sessionUser });
});

// ──────────────────────────────────────────────────────────────────
// GET /api/facturation/tarif
// ──────────────────────────────────────────────────────────────────
describe("GET /api/facturation/tarif", () => {
  it("refuse l'accès sans session (401)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req("http://l/api/facturation/tarif?classeId=cl-1") as never);
    expect(res.status).toBe(401);
  });

  it("refuse l'accès sans la permission finance:read (403)", async () => {
    mockCheckPermission.mockReturnValue(
      new Response(null, { status: 403 }) as never
    );
    const res = await GET(req("http://l/api/facturation/tarif?classeId=cl-1") as never);
    expect(res.status).toBe(403);
  });

  it("retourne 400 si classeId est manquant", async () => {
    const res = await GET(req("http://l/api/facturation/tarif") as never);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("classeId");
  });

  it("retourne 404 si la classe est introuvable", async () => {
    mockPrisma.classe.findFirst.mockResolvedValue(null);
    const res = await GET(req("http://l/api/facturation/tarif?classeId=cl-x") as never);
    expect(res.status).toBe(404);
  });

  it("résout le tarif par niveau avec fallback site (tarif spécifique prioritaire)", async () => {
    mockPrisma.classe.findFirst.mockResolvedValue({
      id: "cl-1",
      nom: "Terminale A",
      niveau: "Terminale",
      siteId: "s1",
    });
    mockPrisma.tarifNiveau.findFirst.mockResolvedValue({
      mensualite: 30000,
      fraisInscription: 50000,
      fraisRenouvellement: 20000,
      fraisCantine: 15000,
      fraisTransport: 10000,
      devise: "DJF",
      nbMois: 10,
    });

    const res = await GET(req("http://l/api/facturation/tarif?classeId=cl-1&type=MENSUALITE") as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.found).toBe(true);
    expect(data.montant).toBe(30000);
    expect(data.devise).toBe("DJF");
    expect(data.niveau).toBe("Terminale");
    expect(data.nbMois).toBe(10);
    expect(data.libelleAuto).toContain("Scolarité");
  });

  it("retourne le tarif d'inscription quand type=INSCRIPTION", async () => {
    mockPrisma.classe.findFirst.mockResolvedValue({
      id: "cl-1",
      nom: "Terminale A",
      niveau: "Terminale",
      siteId: "s1",
    });
    mockPrisma.tarifNiveau.findFirst.mockResolvedValue({
      mensualite: 30000,
      fraisInscription: 50000,
      fraisRenouvellement: 20000,
      fraisCantine: 15000,
      fraisTransport: 10000,
      devise: "DJF",
      nbMois: 10,
    });

    const res = await GET(req("http://l/api/facturation/tarif?classeId=cl-1&type=INSCRIPTION") as never);
    const data = await res.json();
    expect(data.montant).toBe(50000);
    expect(data.libelleAuto).toContain("inscription");
  });

  it("retourne le tarif de cantine quand type=CANTINE", async () => {
    mockPrisma.classe.findFirst.mockResolvedValue({
      id: "cl-1",
      nom: "Terminale A",
      niveau: "Terminale",
      siteId: "s1",
    });
    mockPrisma.tarifNiveau.findFirst.mockResolvedValue({
      mensualite: 30000,
      fraisInscription: 50000,
      fraisRenouvellement: 20000,
      fraisCantine: 15000,
      fraisTransport: 10000,
      devise: "DJF",
      nbMois: 10,
    });

    const res = await GET(req("http://l/api/facturation/tarif?classeId=cl-1&type=CANTINE") as never);
    const data = await res.json();
    expect(data.montant).toBe(15000);
    expect(data.libelleAuto).toContain("Cantine");
  });

  it("retourne found=false si aucun tarif n'est configuré pour le niveau", async () => {
    mockPrisma.classe.findFirst.mockResolvedValue({
      id: "cl-1",
      nom: "Terminale A",
      niveau: "Terminale",
      siteId: "s1",
    });
    mockPrisma.tarifNiveau.findFirst.mockResolvedValue(null);

    const res = await GET(req("http://l/api/facturation/tarif?classeId=cl-1") as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.found).toBe(false);
    expect(data.message).toContain("Terminale");
  });

  it("défaut au type MENSUALITE si type non spécifié", async () => {
    mockPrisma.classe.findFirst.mockResolvedValue({
      id: "cl-1",
      nom: "Terminale A",
      niveau: "Terminale",
      siteId: "s1",
    });
    mockPrisma.tarifNiveau.findFirst.mockResolvedValue({
      mensualite: 30000,
      fraisInscription: 50000,
      fraisRenouvellement: 20000,
      fraisCantine: 15000,
      fraisTransport: 10000,
      devise: "DJF",
      nbMois: 10,
    });

    const res = await GET(req("http://l/api/facturation/tarif?classeId=cl-1") as never);
    const data = await res.json();
    expect(data.montant).toBe(30000); // mensualite par défaut
  });

  it("filtre la classe par tenantId", async () => {
    mockPrisma.classe.findFirst.mockResolvedValue({
      id: "cl-1",
      nom: "Terminale A",
      niveau: "Terminale",
      siteId: "s1",
    });
    mockPrisma.tarifNiveau.findFirst.mockResolvedValue({
      mensualite: 30000,
      fraisInscription: 50000,
      fraisRenouvellement: 20000,
      fraisCantine: 15000,
      fraisTransport: 10000,
      devise: "DJF",
      nbMois: 10,
    });

    await GET(req("http://l/api/facturation/tarif?classeId=cl-1") as never);
    const where = mockPrisma.classe.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.id).toBe("cl-1");
  });
});
