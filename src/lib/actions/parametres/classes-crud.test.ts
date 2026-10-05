import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "admin", tenantId: "t1", role: "TENANT_ADMIN", siteId: "s1", siteIds: ["s1"], tenantHasSites: true } },
  denied: null as unknown,
  prisma: {
    classe: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    enseignant: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/prisma-rls", () => ({ applyRlsContext: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditFire: vi.fn() }));
vi.mock("@/lib/annee-scolaire", () => ({ getAnneeCouranteLibelle: vi.fn(async () => "2026-2027") }));
vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(async () => mocks.denied) }));

import { createClasse, deleteClasse } from "./classes-crud";

// Ce que l'écran envoie réellement : son formulaire porte « 2025-2026 » en dur.
const FORMULAIRE = { nom: "CM2 A", niveau: "CM2", effectifMax: 40, annee: "2025-2026" };
const classe = (compte: Record<string, number>) => ({ id: "c1", _count: { eleves: 0, notes: 0, evaluations: 0, remplacements: 0, ...compte } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.denied = null;
});

describe("createClasse", () => {
  it("crée la classe dans l'année active, pas dans celle du formulaire", async () => {
    await createClasse(FORMULAIRE);
    expect(mocks.prisma.classe.create.mock.calls[0][0].data.annee).toBe("2026-2027");
  });

  it("refuse un compte sans la permission, sans rien écrire", async () => {
    mocks.denied = { status: 403 };
    await expect(createClasse(FORMULAIRE)).rejects.toThrow(/Permission refusée/);
    expect(mocks.prisma.classe.create).not.toHaveBeenCalled();
  });
});

describe("deleteClasse", () => {
  it("refuse un compte sans la permission, sans rien lire ni écrire", async () => {
    mocks.denied = { status: 403 };
    await expect(deleteClasse("c1", { strategy: "remove" })).rejects.toThrow(/Permission refusée/);
    expect(mocks.prisma.classe.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.classe.delete).not.toHaveBeenCalled();
  });

  it("refuse la suppression définitive d'une classe qui porte des notes, avec un message clair", async () => {
    mocks.prisma.classe.findFirst.mockResolvedValue(classe({ notes: 12, evaluations: 3 }));
    await expect(deleteClasse("c1", { strategy: "remove" })).rejects.toThrow(/3 évaluation\(s\), 12 note\(s\)/);
    expect(mocks.prisma.classe.delete).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("laisse archiver cette même classe", async () => {
    mocks.prisma.classe.findFirst.mockResolvedValue(classe({ notes: 12 }));
    expect(await deleteClasse("c1")).toEqual({ success: true, action: "archived" });
    expect(mocks.prisma.classe.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
  });

  it("supprime une classe vide et sans historique", async () => {
    mocks.prisma.classe.findFirst.mockResolvedValue(classe({}));
    await deleteClasse("c1", { strategy: "remove" });
    expect(mocks.prisma.classe.delete).toHaveBeenCalledWith({ where: { id: "c1", tenantId: "t1" } });
  });
});
