import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ default: { user: { findFirst } } }));

import { verifierActeursDepense, ROLES_AUTORISANT_DEPENSE, ROLES_PAYANT_DEPENSE } from "./depenses-acteurs";

beforeEach(() => vi.clearAllMocks());

describe("verifierActeursDepense", () => {
  it("ne contrôle rien quand aucun acteur n'est renseigné", async () => {
    expect(await verifierActeursDepense("t1", { autoriseParId: null, payeParId: undefined })).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("cherche l'autorisateur parmi la direction ACTIVE de CET établissement", async () => {
    findFirst.mockResolvedValue({ id: "u1" });
    expect(await verifierActeursDepense("t1", { autoriseParId: "u1" })).toBeNull();

    const where = findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "u1", isActive: true });
    expect(where.OR[0].userTenants.some).toEqual({ tenantId: "t1", isActive: true, role: { in: ROLES_AUTORISANT_DEPENSE } });
    expect(where.OR[1].userRoles.some).toEqual({ tenantId: "t1", isActive: true, role: { in: ROLES_AUTORISANT_DEPENSE } });
  });

  it("refuse un autorisateur qui n'est pas de la direction (ou pas de l'établissement)", async () => {
    findFirst.mockResolvedValue(null);
    expect(await verifierActeursDepense("t1", { autoriseParId: "compte-autre-tenant" })).toMatch(/Autorisé par/);
  });

  it("refuse un payeur qui n'est ni comptable ni caissier", async () => {
    findFirst.mockResolvedValueOnce({ id: "dir" }).mockResolvedValueOnce(null);
    expect(await verifierActeursDepense("t1", { autoriseParId: "dir", payeParId: "enseignant" })).toMatch(/Payé par/);
    expect(findFirst.mock.calls[1][0].where.OR[0].userTenants.some.role).toEqual({ in: ROLES_PAYANT_DEPENSE });
  });

  it("la direction autorise, la comptabilité paie : jamais l'inverse", () => {
    expect(ROLES_AUTORISANT_DEPENSE).toEqual(["TENANT_ADMIN", "PRINCIPAL"]);
    expect(ROLES_PAYANT_DEPENSE).toEqual(["ACCOUNTANT", "CAISSIER"]);
    expect(ROLES_AUTORISANT_DEPENSE.some((r) => ROLES_PAYANT_DEPENSE.includes(r))).toBe(false);
  });
});
