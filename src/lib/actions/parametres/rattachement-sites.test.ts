/**
 * Rattachement du personnel à ses sites.
 *
 * Les sites autorisés d'une session se lisent dans UserSite ∪ EnseignantSite,
 * jamais dans `User.siteId`. Un compte créé sans ces lignes se connecte avec
 * un périmètre vide (fail-closed) ; un enseignant dont seul UserSite est
 * réécrit garde ses anciens sites. Ces tests verrouillent les deux écritures.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSiteScope, roleRequiresSite } from "@/lib/site-scope";

const mocks = vi.hoisted(() => {
  const session = { user: { id: "admin", tenantId: "t1", role: "TENANT_ADMIN", siteId: null as string | null, siteIds: [] as string[], tenantHasSites: true } };
  const prisma = {
    user: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    site: { findMany: vi.fn() },
    classe: { findFirst: vi.fn(), update: vi.fn() },
    enseignant: { create: vi.fn(), findFirst: vi.fn() },
    affectationEnseignant: { createMany: vi.fn() },
    parent: { create: vi.fn() },
    tenant: { findUnique: vi.fn() },
    userSite: { deleteMany: vi.fn(), create: vi.fn() },
    enseignantSite: { deleteMany: vi.fn(() => "suppr"), createMany: vi.fn(() => "creation") },
    $transaction: vi.fn(async () => []),
  };
  return { session, prisma };
});

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditFire: vi.fn() }));
vi.mock("@/lib/learnos/events", () => ({ publishEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/annee-scolaire", () => ({ getAnneeCouranteLibelle: vi.fn(async () => "2026-2027") }));
vi.mock("@/lib/invitations-server", () => ({ creerInvitation: vi.fn(), revoquerInvitation: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(async () => null) }));

import { createUser } from "./utilisateurs";
import { assignUserSites } from "./sites";

const secretaire = { name: "Amina Ali", email: "amina@ecole.dj", role: "SECRETARY" as const, isActive: true, classeIds: [], siteIds: [] };
const enseignant = { ...secretaire, role: "TEACHER" as const, matiereId: "m1", classeIds: ["c1"] };
const donneesCompte = () => mocks.prisma.user.create.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.session.user, { role: "TENANT_ADMIN", siteId: null, siteIds: [], tenantHasSites: true });
  mocks.prisma.user.findFirst.mockResolvedValue(null);
  mocks.prisma.user.create.mockImplementation(async ({ data }: { data: { siteId: string | null } }) => ({ id: "u-nouveau", siteId: data.siteId }));
  mocks.prisma.enseignant.create.mockResolvedValue({ id: "ens-1" });
  mocks.prisma.site.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.filter((id) => ["s1", "s2"].includes(id)).map((id) => ({ id })));
});

describe("le constat : User.siteId seul ne donne accès à aucun site", () => {
  it("un membre du personnel avec siteId mais sans UserSite a un périmètre vide", () => {
    expect(resolveSiteScope({ role: "SECRETARY", siteId: "s1", siteIds: [], tenantHasSites: true })).toEqual({ kind: "NONE" });
    expect(resolveSiteScope({ role: "SECRETARY", siteId: "s1", siteIds: ["s1"], tenantHasSites: true })).toEqual({ kind: "SITES", siteIds: ["s1"] });
  });

  it("le personnel exige un site, pas la direction générale ni les familles", () => {
    expect(["SECRETARY", "TEACHER", "PRINCIPAL", "ACCOUNTANT"].every(roleRequiresSite)).toBe(true);
    expect(["TENANT_ADMIN", "SUPER_ADMIN", "PARENT", "STUDENT"].some(roleRequiresSite)).toBe(false);
  });
});

describe("createUser", () => {
  it("rattache le personnel au site sur lequel l'administrateur est positionné", async () => {
    mocks.session.user.siteId = "s1";
    await createUser(secretaire);
    expect(donneesCompte().siteId).toBe("s1");
    expect(donneesCompte().userSites).toEqual({ create: [{ siteId: "s1" }] });
  });

  it("refuse de créer un membre du personnel sans aucun site (vue « tous les sites »)", async () => {
    await expect(createUser(secretaire)).rejects.toThrow(/rattaché à un site/);
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("écrit les sites cochés dans le formulaire, avec le compte", async () => {
    await createUser({ ...secretaire, siteIds: ["s1", "s2"] });
    expect(donneesCompte().siteId).toBeNull();
    expect(donneesCompte().userSites).toEqual({ create: [{ siteId: "s1" }, { siteId: "s2" }] });
  });

  it("refuse un site d'un autre établissement", async () => {
    await expect(createUser({ ...secretaire, siteIds: ["s1", "site-autre-tenant"] })).rejects.toThrow(/invalides/);
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("refuse un site hors du périmètre de l'appelant", async () => {
    Object.assign(mocks.session.user, { role: "PRINCIPAL", siteId: "s1", siteIds: ["s1"] });
    await expect(createUser({ ...secretaire, siteIds: ["s2"] })).rejects.toThrow(/invalides/);
  });

  it("rattache l'enseignant dans UserSite ET EnseignantSite", async () => {
    mocks.session.user.siteId = "s1";
    await createUser(enseignant);
    expect(donneesCompte().userSites).toEqual({ create: [{ siteId: "s1" }] });
    expect(mocks.prisma.enseignant.create.mock.calls[0][0].data.sites).toEqual({ create: [{ siteId: "s1" }] });
  });

  it("en vue « tous les sites », déduit le site de l'enseignant de sa première classe", async () => {
    mocks.prisma.classe.findFirst.mockResolvedValue({ siteId: "s2" });
    await createUser(enseignant);
    expect(donneesCompte().siteId).toBe("s2");
    expect(donneesCompte().userSites).toEqual({ create: [{ siteId: "s2" }] });
  });

  it("n'exige aucun site pour un parent ni dans un établissement sans site", async () => {
    await createUser({ ...secretaire, role: "PARENT" });
    expect(donneesCompte().userSites).toBeUndefined();

    mocks.prisma.user.create.mockClear();
    mocks.session.user.tenantHasSites = false;
    await createUser(secretaire);
    expect(donneesCompte().userSites).toBeUndefined();
  });
});

describe("assignUserSites", () => {
  beforeEach(() => mocks.prisma.user.findFirst.mockResolvedValue({ id: "u1" }));

  it("aligne EnseignantSite sur les sites choisis (sinon l'ancien site reste autorisé)", async () => {
    mocks.prisma.enseignant.findFirst.mockResolvedValue({ id: "ens-1" });
    await assignUserSites("u1", [{ siteId: "s2" }]);

    expect(mocks.prisma.enseignantSite.deleteMany).toHaveBeenCalledWith({ where: { enseignantId: "ens-1" } });
    expect(mocks.prisma.enseignantSite.createMany).toHaveBeenCalledWith({ data: [{ enseignantId: "ens-1", siteId: "s2" }] });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(["suppr", "creation"]);
    expect(mocks.prisma.userSite.create).toHaveBeenCalledWith({ data: { userId: "u1", siteId: "s2", role: null } });
  });

  it("refuse de retirer tous les sites d'un enseignant, sans rien écrire", async () => {
    mocks.prisma.enseignant.findFirst.mockResolvedValue({ id: "ens-1" });
    await expect(assignUserSites("u1", [])).rejects.toThrow(/au moins un site/);
    expect(mocks.prisma.userSite.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.enseignantSite.deleteMany).not.toHaveBeenCalled();
  });

  it("ne touche pas à EnseignantSite pour un compte non enseignant", async () => {
    mocks.prisma.enseignant.findFirst.mockResolvedValue(null);
    await assignUserSites("u1", [{ siteId: "s1" }]);
    expect(mocks.prisma.enseignantSite.deleteMany).not.toHaveBeenCalled();
  });
});
