import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: vi.fn() },
    userSite: { findMany: vi.fn(), findFirst: vi.fn() },
    enseignantSite: { findMany: vi.fn(), findFirst: vi.fn() },
    userTenant: { findFirst: vi.fn() },
    // `deriveClaims` liste les sites du tenant (et non plus seulement leur
    // nombre) : la sélection d'un site par la direction générale se vérifie
    // contre cette liste.
    site: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { deriveClaims, resolveSiteAccess } from "@/lib/tenant-claims";

const db = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  userSite: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  enseignantSite: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  userTenant: { findFirst: ReturnType<typeof vi.fn> };
  site: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
};

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const SITE_A1 = "site-a1";
const SITE_B1 = "site-b1";

/** `n` sites appartenant au tenant actif, `SITE_A1` en tête. */
const sitesDuTenant = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i === 0 ? SITE_A1 : `site-a${i + 1}` }));

beforeEach(() => {
  vi.clearAllMocks();
  db.userSite.findMany.mockResolvedValue([]);
  db.enseignantSite.findMany.mockResolvedValue([]);
  db.site.findMany.mockResolvedValue(sitesDuTenant(0));
});

describe("deriveClaims", () => {
  it("refuse un compte désactivé", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "TEACHER",
      isActive: false,
      tenantId: TENANT_A,
      siteId: null,
      userTenants: [],
      userRoles: [],
    });

    expect(await deriveClaims("u1")).toBeNull();
  });

  it("retient le tenant demandé lorsqu'une adhésion active existe", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "TEACHER",
      isActive: true,
      tenantId: TENANT_A,
      siteId: null,
      userTenants: [
        { tenantId: TENANT_A, role: "TEACHER", isDefault: true, tenant: t(TENANT_A) },
        { tenantId: TENANT_B, role: "TENANT_ADMIN", isDefault: false, tenant: t(TENANT_B) },
      ],
      userRoles: [],
    });

    const claims = await deriveClaims("u1", TENANT_B);
    expect(claims?.tenantId).toBe(TENANT_B);
    expect(claims?.role).toBe("TENANT_ADMIN");
  });

  // Le tenant demandé n'est qu'une préférence : sans adhésion, il est ignoré.
  it("ignore un tenant demandé sans adhésion active", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "TEACHER",
      isActive: true,
      tenantId: TENANT_A,
      siteId: null,
      userTenants: [
        { tenantId: TENANT_A, role: "TEACHER", isDefault: true, tenant: t(TENANT_A) },
      ],
      userRoles: [],
    });

    const claims = await deriveClaims("u1", TENANT_B);
    expect(claims?.tenantId).toBe(TENANT_A);
    expect(claims?.role).toBe("TEACHER");
  });

  // Régression : `siteIds` était calculé sans borner au tenant actif.
  it("ne retient que les sites du tenant actif", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "TEACHER",
      isActive: true,
      tenantId: TENANT_A,
      siteId: null,
      userTenants: [
        { tenantId: TENANT_A, role: "TEACHER", isDefault: true, tenant: t(TENANT_A) },
      ],
      userRoles: [],
    });
    db.userSite.findMany.mockResolvedValue([{ siteId: SITE_A1, role: "TEACHER" }]);
    db.site.findMany.mockResolvedValue(sitesDuTenant(2));

    const claims = await deriveClaims("u1", TENANT_A);
    expect(claims?.siteIds).toEqual([SITE_A1]);
    // La requête est bien contrainte par le tenant du site.
    expect(db.userSite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", site: { tenantId: TENANT_A } },
      })
    );
  });

  // Régression : `siteIds` omettait les affectations d'enseignants, si bien
  // qu'un enseignant se connectait avec un périmètre vide.
  it("combine UserSite et EnseignantSite", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "TEACHER",
      isActive: true,
      tenantId: TENANT_A,
      siteId: null,
      userTenants: [
        { tenantId: TENANT_A, role: "TEACHER", isDefault: true, tenant: t(TENANT_A) },
      ],
      userRoles: [],
    });
    db.userSite.findMany.mockResolvedValue([]);
    db.enseignantSite.findMany.mockResolvedValue([{ siteId: SITE_A1 }]);
    db.site.findMany.mockResolvedValue(sitesDuTenant(1));

    const claims = await deriveClaims("u1", TENANT_A);
    expect(claims?.siteIds).toEqual([SITE_A1]);
  });

  // Régression : un siteId persisté d'un autre tenant était conservé.
  it("écarte un siteId persisté hors du tenant actif", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "TEACHER",
      isActive: true,
      tenantId: TENANT_A,
      siteId: SITE_B1,
      userTenants: [
        { tenantId: TENANT_A, role: "TEACHER", isDefault: true, tenant: t(TENANT_A) },
      ],
      userRoles: [],
    });
    db.userSite.findMany.mockResolvedValue([{ siteId: SITE_A1, role: "TEACHER" }]);
    db.site.findMany.mockResolvedValue(sitesDuTenant(2));

    const claims = await deriveClaims("u1", TENANT_A);
    expect(claims?.siteId).toBeNull();
  });

  // Régression : le rôle d'une ligne UserSite d'un AUTRE tenant était adopté.
  it("n'adopte pas le rôle d'un site d'un autre tenant", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "PARENT",
      isActive: true,
      tenantId: TENANT_A,
      siteId: SITE_B1, // site de l'établissement B, où l'utilisateur est admin
      userTenants: [
        { tenantId: TENANT_A, role: "PARENT", isDefault: true, tenant: t(TENANT_A) },
        { tenantId: TENANT_B, role: "TENANT_ADMIN", isDefault: false, tenant: t(TENANT_B) },
      ],
      userRoles: [],
    });
    // Dans le tenant A, aucun rattachement de site.
    db.userSite.findMany.mockResolvedValue([]);
    db.site.findMany.mockResolvedValue(sitesDuTenant(1));

    const claims = await deriveClaims("u1", TENANT_A);
    expect(claims?.tenantId).toBe(TENANT_A);
    expect(claims?.role).toBe("PARENT");
    expect(claims?.siteId).toBeNull();
    expect(claims?.siteIds).toEqual([]);
  });

  it("signale un établissement mono-site", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "TEACHER",
      isActive: true,
      tenantId: TENANT_A,
      siteId: null,
      userTenants: [
        { tenantId: TENANT_A, role: "TEACHER", isDefault: true, tenant: t(TENANT_A) },
      ],
      userRoles: [],
    });
    db.site.findMany.mockResolvedValue(sitesDuTenant(0));

    const claims = await deriveClaims("u1", TENANT_A);
    expect(claims?.tenantHasSites).toBe(false);
  });

  it("applique le rôle propre au site sélectionné", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "TEACHER",
      isActive: true,
      tenantId: TENANT_A,
      siteId: SITE_A1,
      userTenants: [
        { tenantId: TENANT_A, role: "TEACHER", isDefault: true, tenant: t(TENANT_A) },
      ],
      userRoles: [],
    });
    db.userSite.findMany.mockResolvedValue([{ siteId: SITE_A1, role: "PRINCIPAL" }]);
    db.site.findMany.mockResolvedValue(sitesDuTenant(2));

    const claims = await deriveClaims("u1", TENANT_A);
    expect(claims?.siteId).toBe(SITE_A1);
    // Le rôle actif est toujours celui de UserTenant (tenantRole),
    // pas celui de UserSite qui sert uniquement à valider l'accès au site.
    expect(claims?.role).toBe("TEACHER");
  });
});

describe("resolveSiteAccess", () => {
  // Le coeur de la faille d'escalade inter-tenant.
  it("refuse un site qui n'appartient pas au tenant demandé", async () => {
    db.site.findFirst.mockResolvedValue(null); // site absent DE CE tenant

    expect(await resolveSiteAccess("u1", TENANT_A, SITE_B1)).toBeNull();
    expect(db.site.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SITE_B1, tenantId: TENANT_A, actif: true },
      })
    );
    // Aucune adoption de rôle ne doit être tentée.
    expect(db.userSite.findFirst).not.toHaveBeenCalled();
  });

  it("accepte un rattachement explicite et applique le rôle du site", async () => {
    db.site.findFirst.mockResolvedValue({ id: SITE_A1 });
    db.userSite.findFirst.mockResolvedValue({ role: "PRINCIPAL" });

    expect(await resolveSiteAccess("u1", TENANT_A, SITE_A1)).toEqual({ role: "PRINCIPAL" });
  });

  it("refuse un utilisateur sans rattachement ni rôle de direction", async () => {
    db.site.findFirst.mockResolvedValue({ id: SITE_A1 });
    db.userSite.findFirst.mockResolvedValue(null);
    db.enseignantSite.findFirst.mockResolvedValue(null);
    db.userTenant.findFirst.mockResolvedValue({ role: "SECRETARY" });
    db.user.findUnique.mockResolvedValue({ role: "SECRETARY", tenantId: TENANT_A });

    expect(await resolveSiteAccess("u1", TENANT_A, SITE_A1)).toBeNull();
  });

  it("autorise la direction générale du tenant sur un site sans rattachement", async () => {
    db.site.findFirst.mockResolvedValue({ id: SITE_A1 });
    db.userSite.findFirst.mockResolvedValue(null);
    db.enseignantSite.findFirst.mockResolvedValue(null);
    db.userTenant.findFirst.mockResolvedValue({ role: "TENANT_ADMIN" });
    db.user.findUnique.mockResolvedValue({ role: "TENANT_ADMIN", tenantId: TENANT_A });

    expect(await resolveSiteAccess("u1", TENANT_A, SITE_A1)).toEqual({ role: "TENANT_ADMIN" });
  });

  // Le rôle doit venir de l'adhésion AU TENANT DEMANDÉ, pas de `User.role`
  // qu'une bascule antérieure a pu écraser avec le rôle d'un autre tenant.
  it("ignore User.role quand il appartient à un autre tenant", async () => {
    db.site.findFirst.mockResolvedValue({ id: SITE_A1 });
    db.userSite.findFirst.mockResolvedValue(null);
    db.enseignantSite.findFirst.mockResolvedValue(null);
    db.userTenant.findFirst.mockResolvedValue(null); // pas d'adhésion au tenant A
    db.user.findUnique.mockResolvedValue({ role: "TENANT_ADMIN", tenantId: TENANT_B });

    expect(await resolveSiteAccess("u1", TENANT_A, SITE_A1)).toBeNull();
  });

  it("autorise un enseignant affecté au site", async () => {
    db.site.findFirst.mockResolvedValue({ id: SITE_A1 });
    db.userSite.findFirst.mockResolvedValue(null);
    db.enseignantSite.findFirst.mockResolvedValue({ id: "es1" });
    db.userTenant.findFirst.mockResolvedValue({ role: "TEACHER" });
    db.user.findUnique.mockResolvedValue({ role: "TEACHER", tenantId: TENANT_A });

    expect(await resolveSiteAccess("u1", TENANT_A, SITE_A1)).toEqual({ role: "TEACHER" });
  });
});

function t(id: string) {
  return { id, name: `Tenant ${id}`, slug: id, logoUrl: null, country: "DJ" };
}
