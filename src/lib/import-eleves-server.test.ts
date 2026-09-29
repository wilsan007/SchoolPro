/**
 * SchoolPro — Tests serveur de la préparation d'import d'élèves
 * ============================================================
 * Ce que ces tests protègent : `classesConnues` détermine le message affiché à
 * l'administrateur dans l'aperçu d'import — « Nouvel élève » ou « Nouvel élève
 * — la classe « X » sera créée ». C'est sur cet aperçu qu'il valide.
 *
 * `Classe.annee` désigne une PROMOTION, pas un attribut pérenne de
 * l'établissement. Sans filtre d'année, une classe d'une promotion révolue
 * était tenue pour connue : l'aperçu annonçait le contraire de ce que l'import
 * allait faire, et l'administrateur validait un plan sur une information fausse.
 *
 * Le module pur (`import-eleves.ts`) a sa propre suite : ici on ne teste que le
 * câblage base → analyse (le `where` envoyé à Prisma et l'ensemble transmis).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    eleve: { findMany: vi.fn() },
    classe: { findMany: vi.fn() },
    auditLog: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
  };
  return {
    prisma,
    parseElevesWorkbook: vi.fn(),
    analyzeImport: vi.fn(),
    getAnneeCouranteLibelle: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/annee-scolaire", () => ({
  getAnneeCouranteLibelle: mocks.getAnneeCouranteLibelle,
}));
// Le parseur de classeur et l'analyse pure sont simulés : ils ont leurs propres
// tests, et les charger ici ferait dépendre cette suite d'un binaire .xlsx.
vi.mock("@/lib/import-eleves", () => ({
  parseElevesWorkbook: mocks.parseElevesWorkbook,
  analyzeImport: mocks.analyzeImport,
}));

import { preparerPlan } from "@/lib/import-eleves-server";

const planStub = {
  hash: "h1",
  lignes: [],
  resume: {
    total: 0,
    aCreer: 0,
    aMettreAJour: 0,
    aIgnorer: 0,
    doublons: 0,
    erreurs: 0,
    datesAConfirmer: 0,
  },
  classesInconnues: [],
};

/** Direction générale sans site sélectionné : périmètre = tout le tenant. */
const acteurTenant = {
  id: "u1",
  role: "TENANT_ADMIN",
  tenantId: "t1",
  siteId: null,
  siteIds: [],
};

/** Même rôle, borné à un site : le filtre de site doit survivre à la fusion. */
const acteurSite = {
  id: "u2",
  role: "TENANT_ADMIN",
  tenantId: "t1",
  siteId: "s1",
  siteIds: ["s1"],
};

/** Le `where` passé à `prisma.classe.findMany` au dernier appel. */
function whereClasses(): Record<string, unknown> {
  return mocks.prisma.classe.findMany.mock.calls[0][0].where;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAnneeCouranteLibelle.mockResolvedValue("2025-2026");
  mocks.parseElevesWorkbook.mockResolvedValue({
    rows: [],
    erreurs: [],
    hash: "h1",
    mappingColonnes: null,
    headers: [],
  });
  mocks.prisma.eleve.findMany.mockResolvedValue([]);
  mocks.prisma.classe.findMany.mockResolvedValue([]);
  mocks.prisma.auditLog.findFirst.mockResolvedValue(null);
  mocks.analyzeImport.mockReturnValue(planStub);
});

describe("preparerPlan — classes connues bornées à l'année active", () => {
  it("filtre la requête des classes par l'année courante", async () => {
    await preparerPlan(acteurTenant, new ArrayBuffer(0));

    expect(mocks.getAnneeCouranteLibelle).toHaveBeenCalledWith("t1");
    expect(whereClasses().annee).toBe("2025-2026");
  });

  it("ne retient que les classes de l'année active comme « connues »", async () => {
    // La base ne renvoie que les classes de l'année en cours : c'est
    // précisément ce que garantit le filtre ci-dessus.
    mocks.prisma.classe.findMany.mockResolvedValue([{ nom: "CM2 A" }]);

    await preparerPlan(acteurTenant, new ArrayBuffer(0));

    const classesConnues = mocks.analyzeImport.mock.calls[0][3] as Set<string>;
    expect(classesConnues.has("cm2 a")).toBe(true);
    // Une classe d'une promotion révolue ne remonte pas : elle ne peut donc
    // pas passer pour connue dans l'aperçu.
    expect(classesConnues.has("cm1 b")).toBe(false);
  });

  it("conserve le filtre de site en fusionnant le filtre d'année", async () => {
    await preparerPlan(acteurSite, new ArrayBuffer(0));

    const where = whereClasses();
    expect(where.annee).toBe("2025-2026");
    expect(JSON.stringify(where)).toContain("s1");
    // Le site est encapsulé dans `AND` : `mergeFilters` ne doit pas l'écraser.
    expect(Array.isArray(where.AND)).toBe(true);
  });

  it("n'ajoute aucun filtre d'année si l'établissement n'a pas d'année active", async () => {
    mocks.getAnneeCouranteLibelle.mockResolvedValue(null);

    await preparerPlan(acteurTenant, new ArrayBuffer(0));

    // Pas d'année : on ne filtre pas dessus, mais le périmètre tenant reste.
    expect(whereClasses().annee).toBeUndefined();
    expect(whereClasses().tenantId).toBe("t1");
  });
});