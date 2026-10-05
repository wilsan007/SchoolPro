/**
 * Périmètre de sites posé en base (RLS).
 *
 * La base ne doit jamais être PLUS stricte que le droit de l'utilisateur :
 * une direction générale ou un parent dont `siteIds` est vide voient tous les
 * sites — poser leur liste brute en base les aurait privés de tout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { perimetreSitesBase } from "@/lib/site-scope";

describe("perimetreSitesBase", () => {
  it("direction générale : tous les sites, même avec un site sélectionné", () => {
    expect(perimetreSitesBase({ role: "TENANT_ADMIN", siteId: null, siteIds: [], tenantHasSites: true })).toEqual({ scope: "all" });
    expect(perimetreSitesBase({ role: "TENANT_ADMIN", siteId: "s1", siteIds: [], tenantHasSites: true })).toEqual({ scope: "all" });
  });

  it("familles : périmètre personnel, le site ne discrimine pas", () => {
    expect(perimetreSitesBase({ role: "PARENT", siteId: "s1", siteIds: [], tenantHasSites: true })).toEqual({ scope: "all" });
    expect(perimetreSitesBase({ role: "STUDENT", siteId: null, siteIds: [], tenantHasSites: true })).toEqual({ scope: "all" });
  });

  it("personnel : ses sites de rattachement, PAS seulement le site sélectionné", () => {
    expect(perimetreSitesBase({ role: "SECRETARY", siteId: "s1", siteIds: ["s1", "s2"], tenantHasSites: true }))
      .toEqual({ scope: "sites", siteIds: ["s1", "s2"] });
    expect(perimetreSitesBase({ role: "TEACHER", siteId: null, siteIds: ["s1"], tenantHasSites: true }))
      .toEqual({ scope: "sites", siteIds: ["s1"] });
  });

  it("personnel sans rattachement : rien dans un établissement multi-sites, tout en mono-site", () => {
    expect(perimetreSitesBase({ role: "SECRETARY", siteId: "s1", siteIds: [], tenantHasSites: true })).toEqual({ scope: "none" });
    expect(perimetreSitesBase({ role: "SECRETARY", siteId: null, siteIds: [], tenantHasSites: false })).toEqual({ scope: "all" });
  });
});

describe("contexte posé en base", () => {
  const client = { $executeRaw: vi.fn((..._a: unknown[]) => "requete") };
  const valeurs = () => (client.$executeRaw.mock.calls[0] as unknown[]).slice(1);
  const avant = process.env.RLS_SITE_SCOPE;

  beforeEach(() => { vi.resetModules(); client.$executeRaw.mockClear(); });
  afterEach(() => { process.env.RLS_SITE_SCOPE = avant; });

  async function poser(ctx: Record<string, unknown>) {
    const { withRlsContext } = await import("@/lib/rls-context");
    const { applyRlsContext } = await import("@/lib/prisma-rls");
    await withRlsContext(ctx as never, () => applyRlsContext(client as never));
  }
  const ctx = { tenantId: "t1", siteId: "s1", siteIds: ["s1", "s2"], siteScope: "sites", superAdmin: false };

  it("interrupteur coupé (défaut) : signature historique à quatre arguments, sans périmètre", async () => {
    delete process.env.RLS_SITE_SCOPE;
    await poser(ctx);
    expect(valeurs()).toEqual(["t1", "s1", "s1,s2", false]);
  });

  it("interrupteur actif : le périmètre exact part en cinquième argument", async () => {
    process.env.RLS_SITE_SCOPE = "enforce";
    await poser(ctx);
    expect(valeurs()).toEqual(["t1", "s1", "s1,s2", false, "sites"]);
  });

  it("interrupteur actif mais contexte sans périmètre (système, script) : signature historique", async () => {
    process.env.RLS_SITE_SCOPE = "enforce";
    await poser({ tenantId: null, siteId: null, siteIds: [], superAdmin: true });
    expect(valeurs()).toEqual([null, null, "", true]);
  });

  it("withAllSites lève la restriction de site sans toucher au tenant", async () => {
    process.env.RLS_SITE_SCOPE = "enforce";
    const { withRlsContext, withAllSites } = await import("@/lib/rls-context");
    const { applyRlsContext } = await import("@/lib/prisma-rls");
    await withRlsContext(ctx as never, () => withAllSites("unicité du matricule", () => applyRlsContext(client as never)));
    expect(valeurs()).toEqual(["t1", "s1", "s1,s2", false, "all"]);
  });
});
