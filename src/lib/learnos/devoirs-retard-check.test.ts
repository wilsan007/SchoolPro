import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tenants: vi.fn(),
  devoirs: vi.fn(),
  events: vi.fn(),
  annee: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    tenant: { findMany: mocks.tenants },
    devoir: { findMany: mocks.devoirs },
    learnosEvent: { findFirst: mocks.events },
  },
}));
vi.mock("@/lib/annee-scolaire", () => ({ getAnneeCouranteLibelle: mocks.annee }));
vi.mock("@/lib/learnos/events", () => ({ publishEvent: mocks.publish }));

import { detecterDevoirsEnRetard } from "./devoirs-retard-check";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tenants.mockResolvedValue([{ id: "tenant-a" }, { id: "tenant-b" }]);
  mocks.annee.mockImplementation(async (tenantId: string) =>
    tenantId === "tenant-a" ? "2025-2026" : "2026-2027"
  );
  mocks.devoirs.mockResolvedValue([]);
  mocks.events.mockResolvedValue(null);
});

describe("detecterDevoirsEnRetard", () => {
  it("associe chaque année à son tenant au lieu de partager les libellés", async () => {
    await expect(detecterDevoirsEnRetard()).resolves.toEqual({ count: 0 });

    expect(mocks.annee).toHaveBeenCalledWith("tenant-a");
    expect(mocks.annee).toHaveBeenCalledWith("tenant-b");
    expect(mocks.devoirs).toHaveBeenCalledWith({
      where: {
        statut: { in: ["A_FAIRE", "EN_COURS"] },
        dateRendu: { lt: expect.any(Date) },
        OR: [
          { tenantId: "tenant-a", classe: { tenantId: "tenant-a", annee: "2025-2026" } },
          { tenantId: "tenant-b", classe: { tenantId: "tenant-b", annee: "2026-2027" } },
        ],
      },
      select: {
        id: true,
        tenantId: true,
        siteId: true,
        classeId: true,
        matiereId: true,
        dateRendu: true,
      },
    });
  });

  it("ignore un tenant sans année sans élargir le périmètre des autres", async () => {
    mocks.annee.mockImplementation(async (tenantId: string) =>
      tenantId === "tenant-a" ? "2025-2026" : null
    );
    await detecterDevoirsEnRetard();
    expect(mocks.devoirs.mock.calls[0][0].where.OR).toEqual([
      { tenantId: "tenant-a", classe: { tenantId: "tenant-a", annee: "2025-2026" } },
    ]);
  });

  it("ne lit aucun devoir quand aucune année n'est disponible", async () => {
    mocks.annee.mockResolvedValue(null);
    await expect(detecterDevoirsEnRetard()).resolves.toEqual({ count: 0 });
    expect(mocks.devoirs).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("ne lit aucun devoir quand aucun tenant n'existe", async () => {
    mocks.tenants.mockResolvedValue([]);
    await expect(detecterDevoirsEnRetard()).resolves.toEqual({ count: 0 });
    expect(mocks.annee).not.toHaveBeenCalled();
    expect(mocks.devoirs).not.toHaveBeenCalled();
  });

  it("conserve l'année explicite pour tous les tenants du cron", async () => {
    await detecterDevoirsEnRetard("2024-2025");
    expect(mocks.annee).not.toHaveBeenCalled();
    expect(mocks.devoirs.mock.calls[0][0].where.OR).toEqual([
      { tenantId: "tenant-a", classe: { tenantId: "tenant-a", annee: "2024-2025" } },
      { tenantId: "tenant-b", classe: { tenantId: "tenant-b", annee: "2024-2025" } },
    ]);
  });

  it("publie pour plusieurs tenants avec leur site et conserve l'idempotence", async () => {
    mocks.devoirs.mockResolvedValue([
      { id: "devoir-a", tenantId: "tenant-a", siteId: "site-a", classeId: "classe-a", matiereId: "matiere-a", dateRendu: new Date(0) },
      { id: "devoir-b", tenantId: "tenant-b", siteId: null, classeId: "classe-b", matiereId: "matiere-b", dateRendu: new Date(0) },
    ]);
    await expect(detecterDevoirsEnRetard()).resolves.toEqual({ count: 2 });
    expect(mocks.events).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", eventType: "devoir.enretard", aggregateId: "devoir-a" },
      select: { id: true },
    });
    expect(mocks.publish).toHaveBeenNthCalledWith(1, expect.objectContaining({
      tenantId: "tenant-a", siteId: "site-a", aggregateId: "devoir-a",
    }));
    expect(mocks.publish).toHaveBeenNthCalledWith(2, expect.objectContaining({
      tenantId: "tenant-b", siteId: null, aggregateId: "devoir-b",
    }));

    mocks.events.mockResolvedValue({ id: "existing-event" });
    mocks.publish.mockClear();
    await expect(detecterDevoirsEnRetard()).resolves.toEqual({ count: 0 });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
