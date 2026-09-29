import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    classe: {
      findFirst: vi.fn(),
    },
    tarifNiveau: {
      // La route charge la grille puis laisse le DOMAINE choisir la ligne
      // (`choisirTarif`) : le rapprochement niveau ↔ tarif ne se fait plus en SQL.
      findMany: vi.fn(),
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
  tarifNiveau: { findMany: ReturnType<typeof vi.fn> };
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

/**
 * Ligne de la grille tarifaire telle que la produit le seed : le niveau y est
 * un CYCLE (« Collège », « Lycée »), jamais une année de classe.
 */
const tarifGrille = (over: Record<string, unknown> = {}) => ({
  id: "tarif-1",
  niveau: "Collège",
  siteId: null,
  annee: "2025-2026",
  mensualite: 30000,
  fraisInscription: 50000,
  fraisRenouvellement: 20000,
  fraisCantine: 15000,
  fraisTransport: 10000,
  devise: "DJF",
  nbMois: 10,
  actif: true,
  ...over,
});

/** Classe dont le niveau est une ANNÉE, comme dans les données réelles. */
const classeDe = (over: Record<string, unknown> = {}) => ({
  id: "cl-1",
  nom: "Terminale A",
  niveau: "Terminale A",
  siteId: "s1",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.classe.findFirst.mockReset();
  mockPrisma.tarifNiveau.findMany.mockReset();
  mockCheckPermission.mockReturnValue(null);
  mockAuth.mockResolvedValue({ user: sessionUser });
  mockPrisma.classe.findFirst.mockResolvedValue(classeDe());
  mockPrisma.tarifNiveau.findMany.mockResolvedValue([tarifGrille({ niveau: "Lycée" })]);
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

  // Le bug d'origine : la classe porte « 6ème », la grille « Collège ».
  // L'ancienne comparaison de chaînes ne correspondait jamais.
  it("fait correspondre une classe de 6ème à la ligne de cycle « Collège »", async () => {
    mockPrisma.classe.findFirst.mockResolvedValue(
      classeDe({ nom: "6ème A", niveau: "6ème" })
    );
    mockPrisma.tarifNiveau.findMany.mockResolvedValue([
      tarifGrille({ niveau: "Collège", mensualite: 15000 }),
      tarifGrille({ id: "tarif-2", niveau: "Lycée", mensualite: 20000 }),
    ]);

    const res = await GET(req("http://l/api/facturation/tarif?classeId=cl-1") as never);
    const data = await res.json();

    expect(data.found).toBe(true);
    expect(data.montant).toBe(15000);
    expect(data.niveauTarif).toBe("Collège");
    expect(data.cycleNiveau).toBe("college");
  });

  it("préfère la ligne au libellé exact de la classe (« Terminale ») au cycle (« Lycée »)", async () => {
    mockPrisma.classe.findFirst.mockResolvedValue(
      classeDe({ nom: "Terminale A", niveau: "Terminale A" })
    );
    mockPrisma.tarifNiveau.findMany.mockResolvedValue([
      tarifGrille({ niveau: "Lycée", mensualite: 20000 }),
      tarifGrille({ id: "tarif-term", niveau: "Terminale", mensualite: 25000 }),
    ]);

    const data = await (await GET(req("http://l/api/facturation/tarif?classeId=cl-1") as never)).json();
    expect(data.montant).toBe(25000);
  });

  it("applique le tarif du site avant le tarif global", async () => {
    mockPrisma.tarifNiveau.findMany.mockResolvedValue([
      tarifGrille({ niveau: "Lycée", siteId: null, mensualite: 20000 }),
      tarifGrille({ id: "tarif-site", niveau: "Lycée", siteId: "s1", mensualite: 18000 }),
    ]);

    const data = await (await GET(req("http://l/api/facturation/tarif?classeId=cl-1") as never)).json();
    expect(data.montant).toBe(18000);
    expect(data.sourceTarif).toBe("SITE");
  });

  it("retourne le tarif d'inscription quand type=INSCRIPTION", async () => {
    const res = await GET(req("http://l/api/facturation/tarif?classeId=cl-1&type=INSCRIPTION") as never);
    const data = await res.json();
    expect(data.montant).toBe(50000);
    expect(data.libelleAuto).toContain("inscription");
  });

  it("retourne le tarif de cantine quand type=CANTINE", async () => {
    const res = await GET(req("http://l/api/facturation/tarif?classeId=cl-1&type=CANTINE") as never);
    const data = await res.json();
    expect(data.montant).toBe(15000);
    expect(data.libelleAuto).toContain("Cantine");
  });

  it("défaut au type MENSUALITE si type non spécifié", async () => {
    const data = await (await GET(req("http://l/api/facturation/tarif?classeId=cl-1") as never)).json();
    expect(data.montant).toBe(30000); // mensualite par défaut
  });

  it("retourne found=false si aucun tarif n'est configuré pour le cycle", async () => {
    mockPrisma.tarifNiveau.findMany.mockResolvedValue([]);
    const res = await GET(req("http://l/api/facturation/tarif?classeId=cl-1") as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.found).toBe(false);
    expect(data.message).toContain("Terminale A");
  });

  it("distingue un niveau NON RECONNU d'un tarif simplement absent (aucun montant deviné)", async () => {
    mockPrisma.classe.findFirst.mockResolvedValue(
      classeDe({ nom: "Groupe X", niveau: "Inconnu" })
    );
    mockPrisma.tarifNiveau.findMany.mockResolvedValue([tarifGrille()]);

    const data = await (await GET(req("http://l/api/facturation/tarif?classeId=cl-1") as never)).json();
    expect(data.found).toBe(false);
    expect(data.message).toContain("non reconnu");
  });

  it("filtre la classe par tenantId", async () => {
    await GET(req("http://l/api/facturation/tarif?classeId=cl-1") as never);
    const where = mockPrisma.classe.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.id).toBe("cl-1");
  });

  it("ne facture jamais le tarif d'un site qui n'est pas celui de la classe", async () => {
    mockPrisma.tarifNiveau.findMany.mockResolvedValue([
      tarifGrille({ id: "tarif-2", niveau: "Lycée", siteId: "s2", mensualite: 9999 }),
    ]);
    const data = await (await GET(req("http://l/api/facturation/tarif?classeId=cl-1") as never)).json();
    expect(data.found).toBe(false);
  });
});

