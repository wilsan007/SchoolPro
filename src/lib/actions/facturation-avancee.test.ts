/**
 * SchoolPro — Tests de la génération des mensualités
 * ============================================================
 *
 * Ce que ces tests protègent :
 *   1. le rapprochement ANNÉE de classe ↔ CYCLE de la grille tarifaire, dont
 *      l'absence faisait échouer toute la génération en silence (« 0 facture ») ;
 *   2. l'IDEMPOTENCE ATOMIQUE : quand l'index partiel
 *      `factures_unicite_mensuelle` refuse un doublon (Prisma P2002), le lot
 *      continue pour les autres élèves au lieu d'échouer en bloc ;
 *   3. le refus de facturer un niveau non reconnu (aucun montant deviné).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// La réservation du numéro vit en base (fonction SQL sous verrou) : elle a sa
// propre suite, ici on fournit simplement le premier numéro du millésime.
vi.mock("@/lib/factures/numerotation", () => ({
  reserverNumeroFacture: vi.fn(async (_t: string, prefixe: string | number) => `FAC-${prefixe}-00001`),
  reserverNumerosFacture: vi.fn(async (_t: string, prefixe: string | number, n: number) =>
    Array.from({ length: n }, (_, i) => `FAC-${prefixe}-${String(i + 1).padStart(5, "0")}`)),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/notifications/whatsapp", () => ({ sendPaymentWhatsApp: vi.fn() }));
vi.mock("@/lib/annee-scolaire", () => ({ anneeActiveId: vi.fn(async () => null) }));
vi.mock("@/lib/demo-now", () => ({ getDemoNow: vi.fn(() => new Date("2025-10-01T08:00:00Z")) }));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
  mergeFilters: vi.fn((...args: unknown[]) => Object.assign({}, ...args)),
}));

const mockPrismaObj = vi.hoisted(() => {
  const obj: Record<string, unknown> = {
    anneesScolaires: { findFirst: vi.fn() },
    eleve: { findMany: vi.fn() },
    tarifNiveau: { findMany: vi.fn() },
    facture: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  return obj;
});

vi.mock("@/lib/prisma", () => ({ default: mockPrismaObj }));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { genererMensualites } from "@/lib/actions/facturation-avancee";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  anneesScolaires: { findFirst: ReturnType<typeof vi.fn> };
  eleve: { findMany: ReturnType<typeof vi.fn> };
  tarifNiveau: { findMany: ReturnType<typeof vi.fn> };
  facture: {
    findFirst: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

/** Ligne de la grille : libellée par CYCLE, comme les données réelles. */
const tarifGrille = (over: Record<string, unknown> = {}) => ({
  id: "tarif-1",
  niveau: "Collège",
  siteId: "s1",
  annee: "2025-2026",
  mensualite: 15000,
  fraisInscription: 10000,
  fraisRenouvellement: 5000,
  fraisCantine: 6000,
  fraisTransport: 4000,
  devise: "DJF",
  nbMois: 10,
  actif: true,
  ...over,
});

/** Élève dont la classe porte une ANNÉE, comme dans les données réelles. */
const eleve = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  siteId: "s1",
  statut: "ACTIF",
  classe: { niveau: "6ème A", nom: "6ème A" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({
    user: {
      id: "u1",
      tenantId: "t1",
      role: "ACCOUNTANT",
      siteId: "s1",
      siteIds: ["s1"],
      tenantHasSites: true,
    },
  });
  mockPrisma.anneesScolaires.findFirst.mockResolvedValue({ id: "annee-1" });
  mockPrisma.eleve.findMany.mockResolvedValue([eleve()]);
  mockPrisma.tarifNiveau.findMany.mockResolvedValue([tarifGrille()]);
  mockPrisma.facture.findFirst.mockResolvedValue(null);
  mockPrisma.facture.count.mockResolvedValue(0);
  mockPrisma.facture.create.mockResolvedValue({ id: "fac-1" });
});

// ──────────────────────────────────────────────────────────────────
// genererMensualites
// ──────────────────────────────────────────────────────────────────
describe("genererMensualites", () => {
  it("facture la mensualité en rapprochant l'année de classe (« 6ème A ») de la grille (« Collège »)", async () => {
    const res = await genererMensualites({ mois: 10, annee: "2025-2026" });

    expect(res).toMatchObject({ success: true, generated: 1, skipped: 0 });
    expect(mockPrisma.facture.create).toHaveBeenCalledTimes(1);

    const data = mockPrisma.facture.create.mock.calls[0][0].data;
    expect(data.montant).toBe(15000);
    expect(data.mois).toBe("2025-10");
    expect(data.type).toBe("MENSUALITE");
    expect(data.libelle).toBe("Scolarité Octobre 2025-2026");
    expect(data.eleveId).toBe("e1");
    expect(data.tenantId).toBe("t1");
  });

  it("ajoute la cantine et le transport quand ils sont demandés", async () => {
    await genererMensualites({
      mois: 10,
      annee: "2025-2026",
      inclureCantine: true,
      inclureTransport: true,
    });

    const data = mockPrisma.facture.create.mock.calls[0][0].data;
    expect(data.montant).toBe(25000); // 15000 + 6000 + 4000
  });

  it("utilise le tarif du site de chaque élève, jamais celui d'un autre site", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([
      eleve({ id: "e1", siteId: "s1" }),
      eleve({ id: "e2", siteId: "s2" }),
    ]);
    mockPrisma.tarifNiveau.findMany.mockResolvedValue([
      tarifGrille({ id: "t-s1", siteId: "s1", mensualite: 15000 }),
      tarifGrille({ id: "t-s2", siteId: "s2", mensualite: 12000 }),
    ]);

    const res = await genererMensualites({ mois: 10, annee: "2025-2026" });

    expect(res.generated).toBe(2);
    const montants = mockPrisma.facture.create.mock.calls.map(
      (c) => c[0].data.montant
    );
    expect(montants).toEqual([15000, 12000]);
  });

  it("compte un doublon (P2002 de l'index partiel) en skipped et poursuit le lot", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([
      eleve({ id: "e1" }),
      eleve({ id: "e2" }),
    ]);
    // 1er élève : une autre instance a facturé ce mois entre notre lecture et
    // notre écriture → l'index `factures_unicite_mensuelle` refuse la ligne.
    mockPrisma.facture.create
      .mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }))
      .mockResolvedValueOnce({ id: "fac-2" });

    const res = await genererMensualites({ mois: 10, annee: "2025-2026" });

    expect(res).toMatchObject({ success: true, generated: 1, skipped: 1 });
  });

  it("n'écrit rien pour un niveau non reconnu et ne devine aucun montant", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([
      eleve({ id: "e1", classe: { niveau: "Inconnu", nom: "Groupe X" } }),
    ]);

    const res = await genererMensualites({ mois: 10, annee: "2025-2026" });

    expect(res).toMatchObject({ success: true, generated: 0, skipped: 1 });
    expect(mockPrisma.facture.create).not.toHaveBeenCalled();
  });

  it("ne facture pas un élève dont le site n'a aucun tarif applicable", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([eleve({ id: "e1", siteId: "s9" })]);
    mockPrisma.tarifNiveau.findMany.mockResolvedValue([
      tarifGrille({ siteId: "s1", mensualite: 15000 }),
    ]);

    const res = await genererMensualites({ mois: 10, annee: "2025-2026" });

    expect(res).toMatchObject({ success: true, generated: 0, skipped: 1 });
  });

  it("saute un élève déjà facturé pour ce mois (contrôle applicatif)", async () => {
    mockPrisma.facture.findFirst.mockResolvedValue({ id: "fac-existante" });

    const res = await genererMensualites({ mois: 10, annee: "2025-2026" });

    expect(res).toMatchObject({ success: true, generated: 0, skipped: 1 });
    expect(mockPrisma.facture.create).not.toHaveBeenCalled();
  });

  it("refuse un appel sans session", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(genererMensualites({ mois: 10, annee: "2025-2026" })).rejects.toThrow(
      "Non autorisé"
    );
  });
});

