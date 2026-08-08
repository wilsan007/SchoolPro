import { describe, it, expect } from "vitest";
import {
  resolveSiteScope,
  siteFilterFromSession,
  siteFilterForRelation,
  canAccessSite,
  personalScopeFilter,
  eleveScopeFilter,
  mergeFilters,
  siteIdForCreate,
  IMPOSSIBLE_ID,
} from "@/lib/site-scope";

/**
 * Tests de non-régression de l'isolation par site.
 *
 * Chaque cas correspond à une fuite constatée. Ils doivent rester rouges si la
 * logique revient à un comportement « fail-open ».
 */

const SITE_A = "site-a";
const SITE_B = "site-b";

describe("resolveSiteScope", () => {
  it("donne accès à tous les sites au directeur sans site sélectionné", () => {
    expect(resolveSiteScope({ role: "TENANT_ADMIN", siteId: null, siteIds: [] })).toEqual({
      kind: "ALL",
    });
  });

  it("restreint le directeur au site qu'il a sélectionné", () => {
    expect(resolveSiteScope({ role: "TENANT_ADMIN", siteId: SITE_A, siteIds: [] })).toEqual({
      kind: "SITES",
      siteIds: [SITE_A],
    });
  });

  it("borne le personnel à ses sites de rattachement", () => {
    expect(
      resolveSiteScope({ role: "TEACHER", siteId: null, siteIds: [SITE_A, SITE_B] })
    ).toEqual({ kind: "SITES", siteIds: [SITE_A, SITE_B] });
  });

  // Régression : un personnel sans rattachement voyait TOUT le tenant.
  it("refuse tout accès au personnel sans rattachement de site (fail-closed)", () => {
    expect(resolveSiteScope({ role: "TEACHER", siteId: null, siteIds: [] })).toEqual({
      kind: "NONE",
    });
    expect(resolveSiteScope({ role: "SECRETARY", siteId: null, siteIds: [] })).toEqual({
      kind: "NONE",
    });
    expect(resolveSiteScope({ role: "ACCOUNTANT", siteId: null, siteIds: null })).toEqual({
      kind: "NONE",
    });
  });

  // Régression : un JWT désignant un site non autorisé était honoré.
  it("refuse un site sélectionné absent des sites autorisés", () => {
    expect(
      resolveSiteScope({ role: "TEACHER", siteId: SITE_B, siteIds: [SITE_A] })
    ).toEqual({ kind: "NONE" });
  });

  it("n'applique pas de découpage dans un établissement mono-site", () => {
    expect(
      resolveSiteScope({ role: "TEACHER", siteId: null, siteIds: [], tenantHasSites: false })
    ).toEqual({ kind: "ALL" });
  });

  it("traite parent et élève comme un périmètre relationnel", () => {
    expect(resolveSiteScope({ role: "PARENT", siteId: null, siteIds: [] })).toEqual({
      kind: "RELATION",
    });
    expect(resolveSiteScope({ role: "STUDENT", siteId: null, siteIds: [] })).toEqual({
      kind: "RELATION",
    });
  });

  it("ignore les entrées vides ou dupliquées dans siteIds", () => {
    expect(
      resolveSiteScope({ role: "TEACHER", siteId: null, siteIds: [SITE_A, SITE_A, ""] })
    ).toEqual({ kind: "SITES", siteIds: [SITE_A] });
  });
});

describe("siteFilterFromSession", () => {
  it("encapsule le prédicat dans AND pour résister à l'étalement", () => {
    const filter = siteFilterFromSession({ role: "TEACHER", siteId: null, siteIds: [SITE_A] });
    expect(filter).toHaveProperty("AND");
    expect(filter).not.toHaveProperty("OR");
  });

  // Régression : `{ tenantId, ...siteFilter, ...(q && { OR: [...] }) }` écrasait
  // un `OR` de premier niveau — le filtre de site disparaissait dès qu'une
  // recherche textuelle était active.
  it("survit à un OR de recherche construit par l'appelant", () => {
    const siteFilter = siteFilterFromSession({
      role: "TEACHER",
      siteId: null,
      siteIds: [SITE_A],
    });

    const where = {
      tenantId: "t1",
      ...siteFilter,
      ...(true && { OR: [{ nom: { contains: "dupont" } }] }),
    } as Record<string, unknown>;

    expect(where.AND).toBeDefined();
    expect(where.AND).toEqual([{ OR: [{ siteId: { in: [SITE_A] } }, { siteId: null }] }]);
    expect(where.OR).toEqual([{ nom: { contains: "dupont" } }]);
  });

  it("ne renvoie aucun filtre pour un accès tenant complet", () => {
    expect(siteFilterFromSession({ role: "TENANT_ADMIN", siteId: null, siteIds: [] })).toEqual({});
  });

  it("produit un prédicat impossible quand l'accès est refusé", () => {
    const filter = siteFilterFromSession({ role: "TEACHER", siteId: null, siteIds: [] });
    expect(filter).toEqual({ AND: [{ id: IMPOSSIBLE_ID }] });
  });

  it("accepte l'ancienne signature positionnelle", () => {
    expect(siteFilterFromSession("TEACHER", null, [SITE_A])).toEqual({
      AND: [{ OR: [{ siteId: { in: [SITE_A] } }, { siteId: null }] }],
    });
  });
});

describe("siteFilterForRelation", () => {
  it("filtre via la relation indiquée", () => {
    expect(
      siteFilterForRelation({ role: "TEACHER", siteId: null, siteIds: [SITE_A] }, "eleve")
    ).toEqual({
      AND: [{ eleve: { OR: [{ siteId: { in: [SITE_A] } }, { siteId: null }] } }],
    });
  });

  it("utilise `eleve` par défaut", () => {
    const filter = siteFilterForRelation({ role: "TEACHER", siteId: null, siteIds: [SITE_A] });
    expect(Object.keys((filter.AND as Record<string, unknown>[])[0])).toEqual(["eleve"]);
  });

  it("refuse l'accès quand le périmètre est vide", () => {
    expect(
      siteFilterForRelation({ role: "TEACHER", siteId: null, siteIds: [] }, "eleve")
    ).toEqual({ AND: [{ id: IMPOSSIBLE_ID }] });
  });
});

describe("canAccessSite", () => {
  it("autorise la direction générale sur n'importe quel site", () => {
    expect(canAccessSite({ role: "TENANT_ADMIN", siteId: null, siteIds: [] }, SITE_B)).toBe(true);
  });

  it("refuse un site hors du périmètre", () => {
    expect(canAccessSite({ role: "TEACHER", siteId: null, siteIds: [SITE_A] }, SITE_B)).toBe(false);
  });

  it("autorise un site du périmètre", () => {
    expect(canAccessSite({ role: "TEACHER", siteId: null, siteIds: [SITE_A] }, SITE_A)).toBe(true);
  });

  it("autorise les enregistrements partagés (sans site)", () => {
    expect(canAccessSite({ role: "TEACHER", siteId: null, siteIds: [SITE_A] }, null)).toBe(true);
  });

  it("refuse tout quand le périmètre est vide", () => {
    expect(canAccessSite({ role: "TEACHER", siteId: null, siteIds: [] }, SITE_A)).toBe(false);
    expect(canAccessSite({ role: "TEACHER", siteId: null, siteIds: [] }, null)).toBe(false);
  });
});

describe("personalScopeFilter", () => {
  // Régression : le rôle PARENT dispose de `notes:read` / `bulletins:read` et
  // lisait les données de tous les élèves du tenant.
  it("borne un parent à ses propres enfants", () => {
    expect(personalScopeFilter({ role: "PARENT", id: "u1" }, "eleve")).toEqual({
      AND: [{ eleve: { parents: { some: { parent: { userId: "u1" } } } } }],
    });
  });

  it("borne un élève à son propre dossier", () => {
    expect(personalScopeFilter({ role: "STUDENT", id: "u2" }, "eleve")).toEqual({
      AND: [{ eleve: { userId: "u2" } }],
    });
  });

  it("s'applique directement sur Eleve quand relation vaut null", () => {
    expect(personalScopeFilter({ role: "STUDENT", id: "u2" }, null)).toEqual({
      AND: [{ userId: "u2" }],
    });
  });

  it("n'ajoute rien pour le personnel", () => {
    expect(personalScopeFilter({ role: "TEACHER", id: "u3" }, "eleve")).toEqual({});
  });

  it("refuse tout accès à un parent sans identité", () => {
    expect(personalScopeFilter({ role: "PARENT" }, "eleve")).toEqual({
      AND: [{ id: IMPOSSIBLE_ID }],
    });
  });
});

describe("mergeFilters", () => {
  it("concatène les AND au lieu de les écraser", () => {
    const merged = mergeFilters(
      { AND: [{ a: 1 }] },
      { AND: [{ b: 2 }] },
      { tenantId: "t1" }
    );
    expect(merged).toEqual({ tenantId: "t1", AND: [{ a: 1 }, { b: 2 }] });
  });

  it("ignore les fragments vides", () => {
    expect(mergeFilters({ tenantId: "t1" }, {}, null, undefined)).toEqual({ tenantId: "t1" });
  });
});

describe("eleveScopeFilter", () => {
  it("cumule isolation de site et périmètre personnel pour un parent", () => {
    const filter = eleveScopeFilter({ role: "PARENT", id: "u1", siteId: null, siteIds: [] }, "eleve");
    // Périmètre relationnel : pas de contrainte de site, mais lien familial obligatoire.
    expect(filter).toEqual({
      AND: [{ eleve: { parents: { some: { parent: { userId: "u1" } } } } }],
    });
  });

  it("applique la seule contrainte de site pour le personnel", () => {
    const filter = eleveScopeFilter({ role: "TEACHER", id: "u3", siteId: null, siteIds: [SITE_A] });
    expect(filter).toEqual({
      AND: [{ eleve: { OR: [{ siteId: { in: [SITE_A] } }, { siteId: null }] } }],
    });
  });
});

describe("siteIdForCreate", () => {
  // Régression : un fragment `where` était étalé dans un `data` de création,
  // produisant soit une erreur Prisma, soit un enregistrement sans site donc
  // visible depuis tous les sites.
  it("renvoie le site actif quand il est unique", () => {
    expect(siteIdForCreate({ role: "TEACHER", siteId: SITE_A, siteIds: [SITE_A] })).toBe(SITE_A);
    expect(siteIdForCreate({ role: "TENANT_ADMIN", siteId: SITE_A, siteIds: [] })).toBe(SITE_A);
  });

  it("renvoie null quand aucun site unique ne se dégage", () => {
    expect(siteIdForCreate({ role: "TENANT_ADMIN", siteId: null, siteIds: [] })).toBeNull();
    expect(siteIdForCreate({ role: "TEACHER", siteId: null, siteIds: [SITE_A, SITE_B] })).toBeNull();
  });

  it("ne renvoie jamais un objet de prédicat", () => {
    const value = siteIdForCreate({ role: "TEACHER", siteId: SITE_A, siteIds: [SITE_A] });
    expect(typeof value === "string" || value === null).toBe(true);
  });
});
