import { describe, it, expect } from "vitest";

/**
 * Tests d'intégration de l'isolation par site — resolveSiteScope,
 * siteFilterForModel et requireSiteIdForCreate.
 *
 * Contrairement à `site-scope.test.ts` qui couvre la non-régression des
 * fuites, ce fichier valide les chemins complets (modèle → fragment where)
 * et la garde de création (site obligatoire).
 */

const SITE_A = "site-a";
const SITE_B = "site-b";

describe("resolveSiteScope — rôles et configurations", () => {
  it("SUPER_ADMIN → ALL (accès plateforme, tous sites)", async () => {
    const { resolveSiteScope } = await import("@/lib/site-scope");
    expect(resolveSiteScope({ role: "SUPER_ADMIN", siteId: null, siteIds: [] })).toEqual({
      kind: "ALL",
    });
  });

  it("SUPER_ADMIN avec site sélectionné → SITES (restreint au site choisi)", async () => {
    const { resolveSiteScope } = await import("@/lib/site-scope");
    expect(resolveSiteScope({ role: "SUPER_ADMIN", siteId: SITE_A, siteIds: [] })).toEqual({
      kind: "SITES",
      siteIds: [SITE_A],
    });
  });

  it("TENANT_ADMIN avec siteId null → ALL (vue tous sites)", async () => {
    const { resolveSiteScope } = await import("@/lib/site-scope");
    expect(resolveSiteScope({ role: "TENANT_ADMIN", siteId: null, siteIds: [] })).toEqual({
      kind: "ALL",
    });
  });

  it("TENANT_ADMIN avec siteId 's1' → SITES (restreint au site sélectionné)", async () => {
    const { resolveSiteScope } = await import("@/lib/site-scope");
    expect(resolveSiteScope({ role: "TENANT_ADMIN", siteId: "s1", siteIds: [] })).toEqual({
      kind: "SITES",
      siteIds: ["s1"],
    });
  });

  it("TEACHER avec siteId → SITES (borné au site de rattachement)", async () => {
    const { resolveSiteScope } = await import("@/lib/site-scope");
    expect(resolveSiteScope({ role: "TEACHER", siteId: SITE_A, siteIds: [SITE_A] })).toEqual({
      kind: "SITES",
      siteIds: [SITE_A],
    });
  });

  it("TEACHER sans siteId, multi-sites → SITES (tous ses sites)", async () => {
    const { resolveSiteScope } = await import("@/lib/site-scope");
    expect(resolveSiteScope({ role: "TEACHER", siteId: null, siteIds: [SITE_A, SITE_B] })).toEqual({
      kind: "SITES",
      siteIds: [SITE_A, SITE_B],
    });
  });

  it("TEACHER sans rattachement (tenantHasSites true) → NONE (fail-closed)", async () => {
    const { resolveSiteScope } = await import("@/lib/site-scope");
    expect(resolveSiteScope({ role: "TEACHER", siteId: null, siteIds: [], tenantHasSites: true })).toEqual({
      kind: "NONE",
    });
  });

  it("TEACHER sans rattachement (tenant mono-site) → ALL", async () => {
    const { resolveSiteScope } = await import("@/lib/site-scope");
    expect(
      resolveSiteScope({ role: "TEACHER", siteId: null, siteIds: [], tenantHasSites: false })
    ).toEqual({ kind: "ALL" });
  });

  it("PARENT → RELATION (périmètre personnel, le site ne discrimine pas)", async () => {
    const { resolveSiteScope } = await import("@/lib/site-scope");
    expect(resolveSiteScope({ role: "PARENT", siteId: null, siteIds: [] })).toEqual({
      kind: "RELATION",
    });
  });

  it("STUDENT → RELATION", async () => {
    const { resolveSiteScope } = await import("@/lib/site-scope");
    expect(resolveSiteScope({ role: "STUDENT", siteId: null, siteIds: [] })).toEqual({
      kind: "RELATION",
    });
  });

  it("refuse un site sélectionné hors des sites autorisés (JWT périmé/falsifié)", async () => {
    const { resolveSiteScope } = await import("@/lib/site-scope");
    expect(resolveSiteScope({ role: "TEACHER", siteId: SITE_B, siteIds: [SITE_A] })).toEqual({
      kind: "NONE",
    });
  });
});

describe("siteFilterForModel — chemins par modèle", () => {
  it("modèle 'column' (eleve) → fragment sur colonne siteId", async () => {
    const { siteFilterForModel } = await import("@/lib/site-scope");
    const filter = siteFilterForModel("eleve", {
      role: "TEACHER",
      siteId: null,
      siteIds: [SITE_A],
    });
    // eleve n'est pas dans SHARED_NULL_MODELS → pas de OR avec siteId: null
    expect(filter).toEqual({
      AND: [{ siteId: { in: [SITE_A] } }],
    });
  });

  it("modèle 'column' partagé (matiere) → inclut les siteId null", async () => {
    const { siteFilterForModel } = await import("@/lib/site-scope");
    const filter = siteFilterForModel("matiere", {
      role: "TEACHER",
      siteId: null,
      siteIds: [SITE_A],
    });
    // matiere est dans SHARED_NULL_MODELS → OR avec siteId: null
    expect(filter).toEqual({
      AND: [{ OR: [{ siteId: { in: [SITE_A] } }, { siteId: null }] }],
    });
  });

  it("modèle avec relation 'one' (note → eleve) → fragment imbriqué", async () => {
    const { siteFilterForModel } = await import("@/lib/site-scope");
    const filter = siteFilterForModel("note", {
      role: "TEACHER",
      siteId: null,
      siteIds: [SITE_A],
    });
    expect(filter).toEqual({
      AND: [{ eleve: { siteId: { in: [SITE_A] } } }],
    });
  });

  it("modèle avec relation 'one' (evaluation → classe) → fragment imbriqué", async () => {
    const { siteFilterForModel } = await import("@/lib/site-scope");
    const filter = siteFilterForModel("evaluation", {
      role: "TEACHER",
      siteId: null,
      siteIds: [SITE_A],
    });
    expect(filter).toEqual({
      AND: [{ classe: { siteId: { in: [SITE_A] } } }],
    });
  });

  it("modèle avec chain (sanction → incident → eleve) → chaîne de relations", async () => {
    const { siteFilterForModel } = await import("@/lib/site-scope");
    const filter = siteFilterForModel("sanction", {
      role: "TEACHER",
      siteId: null,
      siteIds: [SITE_A],
    });
    expect(filter).toEqual({
      AND: [{ incident: { eleve: { siteId: { in: [SITE_A] } } } }],
    });
  });

  it("modèle 'tenant' (periode) → fragment vide (pas de filtrage par site)", async () => {
    const { siteFilterForModel } = await import("@/lib/site-scope");
    const filter = siteFilterForModel("periode", {
      role: "TEACHER",
      siteId: null,
      siteIds: [SITE_A],
    });
    expect(filter).toEqual({});
  });

  it("scope ALL → fragment vide quel que soit le modèle", async () => {
    const { siteFilterForModel } = await import("@/lib/site-scope");
    expect(
      siteFilterForModel("eleve", { role: "TENANT_ADMIN", siteId: null, siteIds: [] })
    ).toEqual({});
    expect(
      siteFilterForModel("note", { role: "TENANT_ADMIN", siteId: null, siteIds: [] })
    ).toEqual({});
  });

  it("scope NONE → DENY_ALL (prédicat impossible)", async () => {
    const { siteFilterForModel, IMPOSSIBLE_ID } = await import("@/lib/site-scope");
    const filter = siteFilterForModel("eleve", {
      role: "TEACHER",
      siteId: null,
      siteIds: [],
      tenantHasSites: true,
    });
    expect(filter).toEqual({ AND: [{ id: IMPOSSIBLE_ID }] });
  });

  it("scope RELATION (parent) → fragment vide (le lien familial discrimine, pas le site)", async () => {
    const { siteFilterForModel } = await import("@/lib/site-scope");
    const filter = siteFilterForModel("eleve", { role: "PARENT", siteId: null, siteIds: [] });
    expect(filter).toEqual({});
  });

  it("modèle inconnu → fail-closed (DENY_ALL)", async () => {
    const { siteFilterForModel, IMPOSSIBLE_ID } = await import("@/lib/site-scope");
    const filter = siteFilterForModel("modeleInexistant", {
      role: "TEACHER",
      siteId: null,
      siteIds: [SITE_A],
    });
    expect(filter).toEqual({ AND: [{ id: IMPOSSIBLE_ID }] });
  });

  it("modèle 'many' (enseignant → sites) → OR some/none", async () => {
    const { siteFilterForModel } = await import("@/lib/site-scope");
    const filter = siteFilterForModel("enseignant", {
      role: "TEACHER",
      siteId: null,
      siteIds: [SITE_A],
    });
    expect(filter).toEqual({
      AND: [
        {
          OR: [
            { sites: { some: { siteId: { in: [SITE_A] } } } },
            { sites: { none: {} } },
          ],
        },
      ],
    });
  });
});

describe("requireSiteIdForCreate — garde de création", () => {
  it("retourne null quand le tenant n'a pas de sites (mono-site)", async () => {
    const { requireSiteIdForCreate } = await import("@/lib/site-scope");
    expect(
      requireSiteIdForCreate({ role: "TENANT_ADMIN", siteId: null, siteIds: [], tenantHasSites: false })
    ).toBeNull();
  });

  it("retourne null quand tenantHasSites est undefined (compat)", async () => {
    const { requireSiteIdForCreate } = await import("@/lib/site-scope");
    expect(requireSiteIdForCreate({ role: "TENANT_ADMIN", siteId: null, siteIds: [] })).toBeNull();
  });

  it("retourne une erreur pour TENANT_ADMIN sans site sélectionné (vue ALL)", async () => {
    const { requireSiteIdForCreate } = await import("@/lib/site-scope");
    const result = requireSiteIdForCreate({
      role: "TENANT_ADMIN",
      siteId: null,
      siteIds: [],
      tenantHasSites: true,
    });
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
    expect(result).toContain("site");
  });

  it("retourne null pour TENANT_ADMIN avec un site sélectionné", async () => {
    const { requireSiteIdForCreate } = await import("@/lib/site-scope");
    expect(
      requireSiteIdForCreate({
        role: "TENANT_ADMIN",
        siteId: SITE_A,
        siteIds: [],
        tenantHasSites: true,
      })
    ).toBeNull();
  });

  it("retourne null pour TEACHER avec un site unique", async () => {
    const { requireSiteIdForCreate } = await import("@/lib/site-scope");
    expect(
      requireSiteIdForCreate({
        role: "TEACHER",
        siteId: SITE_A,
        siteIds: [SITE_A],
        tenantHasSites: true,
      })
    ).toBeNull();
  });

  it("retourne une erreur pour TEACHER multi-sites sans site sélectionné", async () => {
    const { requireSiteIdForCreate } = await import("@/lib/site-scope");
    const result = requireSiteIdForCreate({
      role: "TEACHER",
      siteId: null,
      siteIds: [SITE_A, SITE_B],
      tenantHasSites: true,
    });
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });

  it("retourne null pour SUPER_ADMIN avec un site sélectionné", async () => {
    const { requireSiteIdForCreate } = await import("@/lib/site-scope");
    expect(
      requireSiteIdForCreate({
        role: "SUPER_ADMIN",
        siteId: SITE_A,
        siteIds: [],
        tenantHasSites: true,
      })
    ).toBeNull();
  });

  it("retourne une erreur pour SUPER_ADMIN sans site sélectionné (tenant multi-sites)", async () => {
    const { requireSiteIdForCreate } = await import("@/lib/site-scope");
    const result = requireSiteIdForCreate({
      role: "SUPER_ADMIN",
      siteId: null,
      siteIds: [],
      tenantHasSites: true,
    });
    expect(result).not.toBeNull();
  });
});

describe("siteIdForCreate — valeur à inscrire sur l'enregistrement", () => {
  it("renvoie le site unique pour TEACHER", async () => {
    const { siteIdForCreate } = await import("@/lib/site-scope");
    expect(siteIdForCreate({ role: "TEACHER", siteId: SITE_A, siteIds: [SITE_A] })).toBe(SITE_A);
  });

  it("renvoie le site sélectionné pour TENANT_ADMIN", async () => {
    const { siteIdForCreate } = await import("@/lib/site-scope");
    expect(siteIdForCreate({ role: "TENANT_ADMIN", siteId: SITE_A, siteIds: [] })).toBe(SITE_A);
  });

  it("renvoie null pour TENANT_ADMIN sans site (vue ALL)", async () => {
    const { siteIdForCreate } = await import("@/lib/site-scope");
    expect(siteIdForCreate({ role: "TENANT_ADMIN", siteId: null, siteIds: [] })).toBeNull();
  });

  it("renvoie null pour TEACHER multi-sites sans sélection", async () => {
    const { siteIdForCreate } = await import("@/lib/site-scope");
    expect(siteIdForCreate({ role: "TEACHER", siteId: null, siteIds: [SITE_A, SITE_B] })).toBeNull();
  });
});
