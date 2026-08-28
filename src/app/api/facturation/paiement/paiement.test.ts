import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockPrismaObj = vi.hoisted(() => {
  const obj: Record<string, unknown> = {
    facture: { findFirst: vi.fn(), update: vi.fn() },
    paiement: { create: vi.fn() },
  };
  obj.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(obj));
  return obj;
});

vi.mock("@/lib/prisma", () => ({ default: mockPrismaObj }));

vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
  mergeFilters: vi.fn((...fragments: Record<string, unknown>[]) => {
    // Fusion simple : retourne le premier fragment non vide
    const out: Record<string, unknown> = {};
    for (const f of fragments) {
      if (f) Object.assign(out, f);
    }
    return out;
  }),
}));

vi.mock("@/lib/demo-now", () => ({
  getDemoNow: vi.fn(async () => new Date("2026-04-07T00:00:00.000Z")),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCheckPermission = checkPermission as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as typeof mockPrismaObj;

function req(url: string, body?: unknown) {
  return { url, json: () => Promise.resolve(body) } as unknown as Request;
}

const { POST } = await import("@/app/api/facturation/paiement/route");

const sessionUser = {
  id: "u1",
  tenantId: "t1",
  role: "ACCOUNTANT",
  siteId: "s1",
  siteIds: ["s1"],
  tenantHasSites: true,
  name: "Comptable",
};

/** Réinitialise tous les mocks Prisma à leur état initial. */
function resetAllPrismaMocks() {
  mockPrisma.facture.findFirst.mockReset();
  mockPrisma.facture.update.mockReset();
  mockPrisma.paiement.create.mockReset();
  mockPrisma.$transaction.mockReset();
  // Rétablir l'implémentation par défaut de $transaction
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrismaObj)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAllPrismaMocks();
  mockCheckPermission.mockReturnValue(null);
  mockAuth.mockResolvedValue({ user: sessionUser });
});

// ──────────────────────────────────────────────────────────────────
// POST /api/facturation/paiement
// ──────────────────────────────────────────────────────────────────
describe("POST /api/facturation/paiement", () => {
  it("refuse l'accès sans session (401)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(req("http://l", { factureId: "f1", montant: 100, methode: "ESPECES" }) as never);
    expect(res.status).toBe(401);
  });

  it("refuse l'accès sans la permission finance:write (403)", async () => {
    mockCheckPermission.mockReturnValue(
      new Response(null, { status: 403 }) as never
    );
    const res = await POST(req("http://l", { factureId: "f1", montant: 100, methode: "ESPECES" }) as never);
    expect(res.status).toBe(403);
  });

  it("retourne 400 si les données sont invalides (ZodError)", async () => {
    const res = await POST(req("http://l", { factureId: "", montant: 0 }) as never);
    expect(res.status).toBe(400);
  });

  it("retourne 404 si la facture est introuvable", async () => {
    mockPrisma.facture.findFirst.mockResolvedValue(null);
    const res = await POST(req("http://l", { factureId: "fx", montant: 100, methode: "ESPECES" }) as never);
    expect(res.status).toBe(404);
  });

  it("retourne 400 si la facture est annulée", async () => {
    mockPrisma.facture.findFirst.mockResolvedValue({
      id: "f1",
      montant: 50000,
      devise: "DJF",
      statut: "ANNULEE",
      echeance: null,
      paiements: [],
    });
    const res = await POST(req("http://l", { factureId: "f1", montant: 100, methode: "ESPECES" }) as never);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("annulée");
  });

  it("retourne 400 si la facture est déjà soldée", async () => {
    mockPrisma.facture.findFirst.mockResolvedValue({
      id: "f1",
      montant: 50000,
      devise: "DJF",
      statut: "PAYEE",
      echeance: null,
      paiements: [{ montant: 50000 }],
    });
    const res = await POST(req("http://l", { factureId: "f1", montant: 100, methode: "ESPECES" }) as never);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("soldée");
  });

  it("retourne 400 si le montant dépasse le solde restant", async () => {
    mockPrisma.facture.findFirst.mockResolvedValue({
      id: "f1",
      montant: 50000,
      devise: "DJF",
      statut: "EN_ATTENTE",
      echeance: null,
      paiements: [{ montant: 30000 }],
    });
    const res = await POST(req("http://l", { factureId: "f1", montant: 30000, methode: "ESPECES" }) as never);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("solde restant");
  });

  it("enregistre un paiement réussi et met le statut à PAYEE si montant atteint", async () => {
    mockPrisma.facture.findFirst.mockResolvedValue({
      id: "f1",
      montant: 50000,
      devise: "DJF",
      statut: "EN_ATTENTE",
      echeance: null,
      paiements: [{ montant: 30000 }],
    });
    mockPrisma.paiement.create.mockResolvedValue({ id: "pay-1", montant: 20000 });

    const res = await POST(req("http://l", { factureId: "f1", montant: 20000, methode: "ESPECES" }) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.paiement).toEqual({ id: "pay-1", montant: 20000 });
    expect(data.newStatut).toBe("PAYEE");

    // Vérifier que la facture a été mise à jour à PAYEE
    const factureUpdate = mockPrisma.facture.update.mock.calls[0][0];
    expect(factureUpdate.where.id).toBe("f1");
    expect(factureUpdate.data.statut).toBe("PAYEE");
  });

  it("garde le statut EN_ATTENTE si le paiement est partiel", async () => {
    mockPrisma.facture.findFirst.mockResolvedValue({
      id: "f1",
      montant: 50000,
      devise: "DJF",
      statut: "EN_ATTENTE",
      echeance: null,
      paiements: [],
    });
    mockPrisma.paiement.create.mockResolvedValue({ id: "pay-1", montant: 20000 });

    const res = await POST(req("http://l", { factureId: "f1", montant: 20000, methode: "ESPECES" }) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    // newStatut reste EN_ATTENTE (pas de changement)
    expect(data.newStatut).toBe("EN_ATTENTE");
  });

  it("passe le statut à EN_RETARD si l'échéance est dépassée et paiement partiel", async () => {
    mockPrisma.facture.findFirst.mockResolvedValue({
      id: "f1",
      montant: 50000,
      devise: "DJF",
      statut: "EN_ATTENTE",
      echeance: new Date("2026-01-01T00:00:00.000Z"), // avant la date de référence (2026-04-07)
      paiements: [],
    });
    mockPrisma.paiement.create.mockResolvedValue({ id: "pay-1", montant: 20000 });

    const res = await POST(req("http://l", { factureId: "f1", montant: 20000, methode: "ESPECES" }) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.newStatut).toBe("EN_RETARD");
  });

  it("enregistre le paiement avec la méthode et la référence fournies", async () => {
    mockPrisma.facture.findFirst.mockResolvedValue({
      id: "f1",
      montant: 50000,
      devise: "DJF",
      statut: "EN_ATTENTE",
      echeance: null,
      paiements: [],
    });
    mockPrisma.paiement.create.mockResolvedValue({ id: "pay-1", montant: 50000 });

    await POST(req("http://l", {
      factureId: "f1",
      montant: 50000,
      methode: "VIREMENT",
      reference: "REF-001",
    }) as never);

    const paiementData = mockPrisma.paiement.create.mock.calls[0][0].data;
    expect(paiementData.methode).toBe("VIREMENT");
    expect(paiementData.reference).toBe("REF-001");
    expect(paiementData.factureId).toBe("f1");
    expect(paiementData.enregistreParId).toBe("u1");
  });
});
