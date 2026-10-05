/**
 * Réinitialisation d'un mot de passe par l'administration.
 * Ce que ces tests verrouillent : on ne réinitialise qu'un compte de rang
 * STRICTEMENT inférieur, jamais le sien, jamais un compte partagé entre
 * établissements, et le mot de passe n'est écrit nulle part en clair.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "appelant", tenantId: "t1", role: "TENANT_ADMIN", siteId: null, siteIds: [], tenantHasSites: true } },
  denied: null as unknown,
  prisma: { user: { findFirst: vi.fn(), update: vi.fn() } },
  audit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditFire: mocks.audit }));
vi.mock("@/lib/learnos/events", () => ({ publishEvent: vi.fn() }));
vi.mock("@/lib/annee-scolaire", () => ({ getAnneeCouranteLibelle: vi.fn() }));
vi.mock("@/lib/invitations-server", () => ({ creerInvitation: vi.fn(), revoquerInvitation: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(async () => mocks.denied) }));

import bcrypt from "bcryptjs";
import { validerMotDePasse } from "@/lib/password-validation";
import { reinitialiserMotDePasseUtilisateur } from "./utilisateurs";

const cible = (over: Record<string, unknown> = {}) => ({
  id: "cible", role: "TEACHER",
  userTenants: [{ tenantId: "t1", role: "TEACHER" }],
  userRoles: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.denied = null;
  mocks.session.user.role = "TENANT_ADMIN";
  mocks.prisma.user.findFirst.mockResolvedValue(cible());
});

describe("reinitialiserMotDePasseUtilisateur", () => {
  it("génère un mot de passe conforme, le hache, force le changement et ferme les sessions", async () => {
    const res = await reinitialiserMotDePasseUtilisateur("cible");

    expect(validerMotDePasse(res.motDePasse)).toBeFalsy();
    const data = mocks.prisma.user.update.mock.calls[0][0].data;
    expect(data.password).not.toBe(res.motDePasse);
    expect(await bcrypt.compare(res.motDePasse, data.password)).toBe(true);
    expect(data.mustChangePassword).toBe(true);
    expect(data.sessionVersion).toEqual({ increment: 1 });
  });

  it("ne laisse le mot de passe ni dans l'audit ni ailleurs", async () => {
    const res = await reinitialiserMotDePasseUtilisateur("cible");
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(res.motDePasse);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "user:password:reset", verdict: "ALLOWED", resourceId: "cible" }));
  });

  it("borne la cible au tenant de l'appelant", async () => {
    await reinitialiserMotDePasseUtilisateur("cible");
    expect(mocks.prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({ id: "cible", tenantId: "t1" });
  });

  it("refuse son propre compte", async () => {
    await expect(reinitialiserMotDePasseUtilisateur("appelant")).rejects.toThrow(/propre compte/);
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("refuse sans la permission", async () => {
    mocks.denied = { status: 403 };
    await expect(reinitialiserMotDePasseUtilisateur("cible")).rejects.toThrow(/Permissions/);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ["PRINCIPAL", { role: "TENANT_ADMIN", userTenants: [{ tenantId: "t1", role: "TENANT_ADMIN" }] }, "un chef d'établissement ne prend pas le compte de la direction générale"],
    ["PRINCIPAL", { role: "PRINCIPAL", userTenants: [{ tenantId: "t1", role: "PRINCIPAL" }] }, "ni celui d'un pair"],
    ["TENANT_ADMIN", { role: "TENANT_ADMIN", userTenants: [{ tenantId: "t1", role: "TENANT_ADMIN" }] }, "un directeur ne réinitialise pas un autre directeur"],
    ["PRINCIPAL", { userRoles: [{ tenantId: "t1", role: "TENANT_ADMIN" }] }, "le rang est le plus élevé des rôles cumulés, pas le rôle affiché"],
  ])("appelant %s : refusé — %s", async (role, over, _libelle) => {
    mocks.session.user.role = role as string;
    mocks.prisma.user.findFirst.mockResolvedValue(cible(over as Record<string, unknown>));

    await expect(reinitialiserMotDePasseUtilisateur("cible")).rejects.toThrow(/rang inférieur/);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ verdict: "DENIED" }));
  });

  it("un chef d'établissement réinitialise un enseignant, un directeur réinitialise un chef d'établissement", async () => {
    mocks.session.user.role = "PRINCIPAL";
    await expect(reinitialiserMotDePasseUtilisateur("cible")).resolves.toMatchObject({ success: true });

    mocks.session.user.role = "TENANT_ADMIN";
    mocks.prisma.user.findFirst.mockResolvedValue(cible({ role: "PRINCIPAL", userTenants: [{ tenantId: "t1", role: "PRINCIPAL" }] }));
    await expect(reinitialiserMotDePasseUtilisateur("cible")).resolves.toMatchObject({ success: true });
  });

  it("refuse un compte rattaché à un autre établissement (le mot de passe est partagé)", async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(cible({ userTenants: [{ tenantId: "t1", role: "TEACHER" }, { tenantId: "t2", role: "TEACHER" }] }));
    await expect(reinitialiserMotDePasseUtilisateur("cible")).rejects.toThrow(/plusieurs établissements/);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });
});
