/**
 * SchoolPro — Tests du cœur de facturation mensuelle
 * ============================================================
 * Ce que ces tests protègent :
 *   1. l'ÉCHÉANCE de la bonne année — l'ancien calcul datait janvier 2025 pour
 *      une année scolaire 2025-2026, créant d'emblée des factures « en retard » ;
 *   2. les élèves ARCHIVÉS (soft delete) ne sont plus facturés ;
 *   3. l'idempotence atomique (index partiel → Prisma P2002) : skipped, pas
 *      d'échec du lot ;
 *   4. la tâche planifiée : toutes les écoles ACTIVES, année active de chacune,
 *      mois déduit de l'horloge UTC (02:00 UTC = 05:00 à Djibouti).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrismaObj = vi.hoisted(() => ({
  anneesScolaires: { findFirst: vi.fn() },
  eleve: { findMany: vi.fn() },
  tarifNiveau: { findMany: vi.fn() },
  facture: { findFirst: vi.fn(), create: vi.fn() },
  // Réservation du numéro : `next_facture_numeros` renvoie le premier du bloc.
  $queryRaw: vi.fn(async () => [{ premier: 1 }]),
  tenant: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ default: mockPrismaObj }));

vi.mock("@/lib/site-scope", () => ({
  mergeFilters: vi.fn((...args: unknown[]) => Object.assign({}, ...args)),
  // Marqueur reconnaissable : on prouve ainsi que le filtre de site est bien
  // fusionné dans le `where` transmis à Prisma.
  siteFilterForModel: vi.fn(() => ({ AND: [{ siteId: { in: ["s1"] } }] })),
}));

vi.mock("@/lib/annee-scolaire", () => ({ getAnneeCouranteLibelle: vi.fn() }));

import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import {
  anneeCalendaireDuMois,
  cleMois,
  echeanceDuMois,
  genererMensualitesDuMois,
  genererMensualitesPourTenant,
  libelleMensualite,
} from "@/lib/factures/mensualites";

const mockPrisma = mockPrismaObj;
const mockAnneeActive = getAnneeCouranteLibelle as ReturnType<typeof vi.fn>;

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

const eleveActif = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  siteId: "s1",
  statut: "ACTIF",
  deletedAt: null,
  classe: { niveau: "6ème A", nom: "6ème A" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
    id: "annee-1",
    dateDebut: new Date(Date.UTC(2025, 8, 1)), // 1er septembre 2025
  });
  mockPrisma.eleve.findMany.mockResolvedValue([eleveActif()]);
  mockPrisma.tarifNiveau.findMany.mockResolvedValue([tarifGrille()]);
  mockPrisma.facture.findFirst.mockResolvedValue(null);
  mockPrisma.facture.create.mockResolvedValue({ id: "fac-1" });
  mockPrisma.tenant.findMany.mockResolvedValue([{ id: "t1", name: "École A" }]);
  mockAnneeActive.mockResolvedValue("2025-2026");
});

// ──────────────────────────────────────────────────────────────────
// Helpers purs
// ──────────────────────────────────────────────────────────────────
describe("libelleMensualite / cleMois", () => {
  it("compose le libellé attendu", () => {
    expect(libelleMensualite(10, "2025-2026")).toBe("Scolarité Octobre 2025-2026");
    expect(libelleMensualite(1, "2025-2026")).toBe("Scolarité Janvier 2025-2026");
  });

  it("porte l'année CALENDAIRE du mois, pas l'année de début d'année scolaire", () => {
    expect(cleMois("2025-2026", 10)).toBe("2025-10");
    expect(cleMois("2025-2026", 12)).toBe("2025-12");
    // Le bug d'origine : janvier 2026 était enregistré « 2025-01 ».
    expect(cleMois("2025-2026", 1)).toBe("2026-01");
    expect(cleMois("2025-2026", 6)).toBe("2026-06");
  });
});

describe("anneeCalendaireDuMois", () => {
  it("suit les bornes réelles de l'année scolaire", () => {
    const debutSeptembre = new Date(Date.UTC(2025, 8, 1));
    expect(anneeCalendaireDuMois(9, debutSeptembre, "2025-2026")).toBe(2025);
    expect(anneeCalendaireDuMois(12, debutSeptembre, "2025-2026")).toBe(2025);
    expect(anneeCalendaireDuMois(1, debutSeptembre, "2025-2026")).toBe(2026);
    expect(anneeCalendaireDuMois(8, debutSeptembre, "2025-2026")).toBe(2026);
  });

  it("gère une année qui commence en août", () => {
    const debutAout = new Date(Date.UTC(2025, 7, 15));
    expect(anneeCalendaireDuMois(8, debutAout, "2025-2026")).toBe(2025);
    expect(anneeCalendaireDuMois(7, debutAout, "2025-2026")).toBe(2026);
  });

  it("retombe sur le libellé quand les bornes manquent", () => {
    expect(anneeCalendaireDuMois(10, null, "2025-2026")).toBe(2025);
    expect(anneeCalendaireDuMois(1, null, "2025-2026")).toBe(2026);
  });

  it("refuse un libellé illisible plutôt que de produire NaN", () => {
    expect(() => anneeCalendaireDuMois(10, null, "année-en-cours")).toThrow(
      /illisible/
    );
  });
});

describe("echeanceDuMois", () => {
  it("place l'échéance au 15 du mois facturé, à minuit UTC", () => {
    expect(echeanceDuMois(10, 2025).toISOString()).toBe("2025-10-15T00:00:00.000Z");
    expect(echeanceDuMois(12, 2025).toISOString()).toBe("2025-12-15T00:00:00.000Z");
    expect(echeanceDuMois(1, 2026).toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(echeanceDuMois(2, 2024).toISOString()).toBe("2024-02-15T00:00:00.000Z");
  });
});

// ──────────────────────────────────────────────────────────────────
// genererMensualitesPourTenant
// ──────────────────────────────────────────────────────────────────
describe("genererMensualitesPourTenant", () => {
  it("aperçu : annonce le nombre et le montant, sans facture ni numéro réservé", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([
      eleveActif(),
      eleveActif({ id: "e2" }),
      eleveActif({ id: "e3", classe: { niveau: "Niveau inconnu", nom: "?" } }),
    ]);
    mockPrisma.facture.findFirst.mockImplementation(async ({ where }: { where: { eleveId: string } }) =>
      where.eleveId === "e2" ? { id: "deja" } : null);

    const res = await genererMensualitesPourTenant({ tenantId: "t1", annee: "2025-2026", mois: 1, dryRun: true });

    expect(res).toMatchObject({
      apercu: true, generated: 1, montantTotal: 15000, dejaFactures: 1, sansTarif: 1, skipped: 2,
    });
    expect(mockPrisma.facture.create).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("signale une option demandée que la grille ne chiffre pas, au lieu de l'ignorer en silence", async () => {
    mockPrisma.tarifNiveau.findMany.mockResolvedValue([tarifGrille({ fraisCantine: null, fraisTransport: 4000 })]);

    const res = await genererMensualitesPourTenant({
      tenantId: "t1", annee: "2025-2026", mois: 1, dryRun: true, inclureCantine: true, inclureTransport: true,
    });

    expect(res).toMatchObject({ cantineNonRenseignee: 1, transportNonRenseigne: 0, montantTotal: 19000 });
  });

  it("facture le mois avec l'échéance de la BONNE année (janvier 2026, pas 2025)", async () => {
    const res = await genererMensualitesPourTenant({
      tenantId: "t1",
      annee: "2025-2026",
      mois: 1,
    });

    expect(res).toMatchObject({ generated: 1, skipped: 0 });
    const data = mockPrisma.facture.create.mock.calls[0][0].data;
    expect(data.mois).toBe("2026-01");
    expect(data.echeance.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(data.numero).toBe("FAC-2026-00001");
    expect(data.libelle).toBe("Scolarité Janvier 2025-2026");
    expect(data.montant).toBe(15000);
    expect(data.type).toBe("MENSUALITE");
    expect(data.statut).toBe("EN_ATTENTE");
  });

  it("n'interroge que les élèves actifs et NON archivés", async () => {
    await genererMensualitesPourTenant({ tenantId: "t1", annee: "2025-2026", mois: 10 });

    const where = mockPrisma.eleve.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: "t1", statut: "ACTIF", deletedAt: null });
  });

  it("ne facture rien si aucun élève ne remonte (élèves archivés filtrés en base)", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([]);
    const res = await genererMensualitesPourTenant({
      tenantId: "t1",
      annee: "2025-2026",
      mois: 10,
    });
    expect(res).toMatchObject({ generated: 0, skipped: 0 });
    expect(mockPrisma.facture.create).not.toHaveBeenCalled();
  });

  it("compte en skipped une violation d'unicité (index partiel) sans échouer", async () => {
    mockPrisma.facture.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );
    const res = await genererMensualitesPourTenant({
      tenantId: "t1",
      annee: "2025-2026",
      mois: 10,
    });
    expect(res).toMatchObject({ generated: 0, skipped: 1 });
  });

  it("propage les autres erreurs au lieu de les confondre avec « déjà facturé »", async () => {
    mockPrisma.facture.create.mockRejectedValue(new Error("base indisponible"));
    await expect(
      genererMensualitesPourTenant({ tenantId: "t1", annee: "2025-2026", mois: 10 })
    ).rejects.toThrow("base indisponible");
  });

  it("skipped un élève sans tarif applicable, sans deviner de montant", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([
      eleveActif({ id: "e9", siteId: "s9", classe: { niveau: "Inconnu", nom: "X" } }),
    ]);
    const res = await genererMensualitesPourTenant({
      tenantId: "t1",
      annee: "2025-2026",
      mois: 10,
    });
    expect(res).toMatchObject({ generated: 0, skipped: 1 });
    expect(mockPrisma.facture.create).not.toHaveBeenCalled();
  });

  it("n'attribue aucun auteur par défaut (génération automatique)", async () => {
    await genererMensualitesPourTenant({ tenantId: "t1", annee: "2025-2026", mois: 10 });
    expect(mockPrisma.facture.create.mock.calls[0][0].data.createdById).toBeNull();
  });

  it("ajoute cantine et transport quand l'appelant les demande", async () => {
    await genererMensualitesPourTenant({
      tenantId: "t1",
      annee: "2025-2026",
      mois: 10,
      inclureCantine: true,
      inclureTransport: true,
    });
    expect(mockPrisma.facture.create.mock.calls[0][0].data.montant).toBe(25000);
  });

  it("applique le filtre de site du périmètre transmis (session de site)", async () => {
    await genererMensualitesPourTenant({
      tenantId: "t1",
      annee: "2025-2026",
      mois: 10,
      portee: { role: "SECRETARY", siteId: "s1", siteIds: ["s1"], tenantHasSites: true },
    });

    const whereEleve = mockPrisma.eleve.findMany.mock.calls[0][0].where;
    expect(whereEleve.AND).toEqual([{ siteId: { in: ["s1"] } }]);

    // La même règle s'applique à la recherche de doublon sur les factures.
    const whereFacture = mockPrisma.facture.findFirst.mock.calls[0][0].where;
    expect(whereFacture.AND).toEqual([{ siteId: { in: ["s1"] } }]);
  });
});

// ──────────────────────────────────────────────────────────────────
// genererMensualitesDuMois — la tâche planifiée
// ──────────────────────────────────────────────────────────────────
describe("genererMensualitesDuMois", () => {
  it("déduit le mois de l'horloge UTC (02:00 UTC le 1er = 05:00 à Djibouti)", async () => {
    const res = await genererMensualitesDuMois(new Date("2025-10-01T02:00:00Z"));

    expect(res.mois).toBe(10);
    expect(res.generated).toBe(1);
    const data = mockPrisma.facture.create.mock.calls[0][0].data;
    expect(data.libelle).toBe("Scolarité Octobre 2025-2026");
    expect(data.mois).toBe("2025-10");
  });

  it("ne traite que les établissements ACTIFS", async () => {
    await genererMensualitesDuMois(new Date("2025-10-01T02:00:00Z"));
    expect(mockPrisma.tenant.findMany.mock.calls[0][0].where).toEqual({
      status: "ACTIVE",
    });
  });

  it("agrège les écoles et liste celles sans année active", async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([
      { id: "t1", name: "École A" },
      { id: "t2", name: "École B" },
    ]);
    mockAnneeActive.mockImplementation(async (tenantId: string) =>
      tenantId === "t1" ? "2025-2026" : null
    );

    const res = await genererMensualitesDuMois(new Date("2025-10-01T02:00:00Z"));

    expect(res.tenants).toBe(2);
    expect(res.generated).toBe(1);
    expect(res.sansAnnee).toEqual(["École B"]);
  });

  it("ne casse pas si aucun établissement n'est actif", async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([]);
    const res = await genererMensualitesDuMois(new Date("2025-10-01T02:00:00Z"));
    expect(res).toEqual({ mois: 10, tenants: 0, generated: 0, skipped: 0, sansAnnee: [] });
  });
});

