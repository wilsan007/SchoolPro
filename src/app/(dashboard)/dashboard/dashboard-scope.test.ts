import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// La page est un Server Component : on neutralise tout ce qui n'a pas de sens
// hors runtime Next (Prisma, next-auth, next-intl, composants clients) afin de
// pouvoir importer et tester la construction PURE des filtres.
vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/guard-page", () => ({ guardPage: vi.fn() }));
vi.mock("@/lib/annee-scolaire", () => ({ getAnneeCouranteLibelle: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(),
  getLocale: vi.fn(),
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
vi.mock("@/components/layout/Header", () => ({ Header: () => null }));
vi.mock("@/components/dashboard/DashboardStats", () => ({ DashboardStats: () => null }));
vi.mock("@/components/dashboard/RecentActivity", () => ({ RecentActivity: () => null }));
vi.mock("@/components/dashboard/QuickActions", () => ({ QuickActions: () => null }));
vi.mock("@/components/dashboard/AbsenceChart", () => ({ AbsenceChart: () => null }));

import {
  buildDashboardWheres,
  dashboardCacheKey,
  type DashboardScopeClaims,
} from "./dashboard-scope";
import {
  siteFilterForModel,
  personalScopeFilter,
  mergeFilters,
  IMPOSSIBLE_ID,
} from "@/lib/site-scope";

/**
 * Non-régression de la fuite constatée sur `/dashboard` : les filtres étaient
 * construits avec `siteFilterForModel` SEUL, or ce fragment est vide (`{}`)
 * pour PARENT et STUDENT (`resolveSiteScope` → `{ kind: "RELATION" }`). Un
 * parent voyait donc les 5 dernières notes nominatives de n'importe quel élève
 * du tenant, plus les effectifs et absences de tout l'établissement.
 */

const TENANT = "tenant-1";
const SITE_A = "site-a";
const SITE_B = "site-b";

const ALL_ROLES = [
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "PRINCIPAL",
  "SECRETARY",
  "TEACHER",
  "CLASS_TEACHER",
  "COUNSELOR",
  "NURSE",
  "ACCOUNTANT",
  "PARENT",
  "STUDENT",
] as const;

const RELATION_ROLES = ["PARENT", "STUDENT"] as const;
const STAFF_ROLES = ALL_ROLES.filter(
  (r) => !RELATION_ROLES.includes(r as (typeof RELATION_ROLES)[number])
);

function claimsFor(role: string, over: Partial<DashboardScopeClaims> = {}): DashboardScopeClaims {
  return {
    role,
    id: `user-${role.toLowerCase()}`,
    siteId: null,
    siteIds: [SITE_A],
    tenantHasSites: true,
    ...over,
  };
}

/** Sérialisation stable, pour chercher une contrainte dans un `where` imbriqué. */
function dump(where: unknown): string {
  return JSON.stringify(where);
}

describe("buildDashboardWheres — les 11 rôles", () => {
  it("produit un filtre non vide pour chaque rôle et chaque modèle", () => {
    for (const role of ALL_ROLES) {
      const w = buildDashboardWheres(TENANT, claimsFor(role));
      for (const [model, where] of Object.entries(w)) {
        if (model === "relationScoped") continue;
        expect(where, `${role}/${model}`).toBeTruthy();
        // Le tenant est toujours contraint : aucun filtre n'est totalement vide.
        expect(dump(where), `${role}/${model}`).toContain(TENANT);
      }
    }
  });

  it("marque PARENT et STUDENT comme périmètre relationnel, et eux seuls", () => {
    for (const role of RELATION_ROLES) {
      expect(buildDashboardWheres(TENANT, claimsFor(role)).relationScoped).toBe(true);
    }
    for (const role of STAFF_ROLES) {
      expect(buildDashboardWheres(TENANT, claimsFor(role)).relationScoped).toBe(false);
    }
  });
});

describe("buildDashboardWheres — périmètre personnel PARENT / STUDENT", () => {
  it("contraint les notes au lien parent → enfants (jamais un filtre vide)", () => {
    const w = buildDashboardWheres(TENANT, claimsFor("PARENT", { id: "user-parent-1" }));
    expect(w.note).toEqual({
      tenantId: TENANT,
      AND: [{ eleve: { parents: { some: { parent: { userId: "user-parent-1" } } } } }],
    });
  });

  it("contraint les notes à l'élève lui-même", () => {
    const w = buildDashboardWheres(TENANT, claimsFor("STUDENT", { id: "user-eleve-1" }));
    expect(w.note).toEqual({
      tenantId: TENANT,
      AND: [{ eleve: { userId: "user-eleve-1" } }],
    });
  });

  it("contraint aussi les absences via la relation eleve", () => {
    for (const role of RELATION_ROLES) {
      const w = buildDashboardWheres(TENANT, claimsFor(role, { id: "u1" }));
      expect(dump(w.absence)).toContain("eleve");
      expect(dump(w.absence)).toContain("u1");
    }
  });

  it("contraint la requête eleve directement (relation null)", () => {
    const parent = buildDashboardWheres(TENANT, claimsFor("PARENT", { id: "p1" }));
    expect(parent.eleve).toEqual({
      tenantId: TENANT,
      deletedAt: null,
      AND: [{ parents: { some: { parent: { userId: "p1" } } } }],
    });

    const student = buildDashboardWheres(TENANT, claimsFor("STUDENT", { id: "e1" }));
    expect(student.eleve).toEqual({
      tenantId: TENANT,
      deletedAt: null,
      AND: [{ userId: "e1" }],
    });
  });

  it("ferme classe et examen (aucun chemin vers l'élève) pour les périmètres relationnels", () => {
    for (const role of RELATION_ROLES) {
      const w = buildDashboardWheres(TENANT, claimsFor(role));
      expect(dump(w.classe)).toContain(IMPOSSIBLE_ID);
      expect(dump(w.examen)).toContain(IMPOSSIBLE_ID);
    }
  });

  it("est fail-closed si l'identité est absente des revendications", () => {
    const w = buildDashboardWheres(TENANT, { role: "PARENT", siteIds: [], tenantHasSites: true });
    for (const model of ["note", "absence", "eleve", "classe", "examen"] as const) {
      expect(dump(w[model]), model).toContain(IMPOSSIBLE_ID);
    }
  });

  // Ce test échoue si quelqu'un revient à `siteFilterForModel` seul.
  it("ne se contente JAMAIS du filtre de site pour PARENT / STUDENT", () => {
    for (const role of RELATION_ROLES) {
      const claims = claimsFor(role);
      // Rappel du défaut : le filtre de site seul est vide pour ces rôles.
      expect(siteFilterForModel("note", claims)).toEqual({});
      expect(siteFilterForModel("absence", claims)).toEqual({});
      expect(siteFilterForModel("eleve", claims)).toEqual({});

      const w = buildDashboardWheres(TENANT, claims);
      const siteOnly = { tenantId: TENANT, ...siteFilterForModel("note", claims) };
      expect(w.note).not.toEqual(siteOnly);
      // Il reste au moins une contrainte au-delà du tenant.
      const and = (w.note as unknown as { AND?: unknown[] }).AND;
      expect(Array.isArray(and)).toBe(true);
      expect((and as unknown[]).length).toBeGreaterThan(0);
    }
  });
});

describe("buildDashboardWheres — personnel : le périmètre de site est préservé", () => {
  it("borne le personnel à ses sites et n'ajoute aucune contrainte personnelle", () => {
    const claims = claimsFor("TEACHER", { siteIds: [SITE_A, SITE_B] });
    const w = buildDashboardWheres(TENANT, claims);
    expect(w.eleve).toEqual(
      mergeFilters({ tenantId: TENANT, deletedAt: null }, siteFilterForModel("eleve", claims))
    );
    expect(dump(w.note)).toContain(SITE_A);
    expect(dump(w.note)).toContain(SITE_B);
    expect(personalScopeFilter(claims, "eleve")).toEqual({});
  });

  it("reste fail-closed pour un personnel sans site de rattachement", () => {
    for (const role of ["SECRETARY", "COUNSELOR", "NURSE", "ACCOUNTANT", "TEACHER", "CLASS_TEACHER", "PRINCIPAL"]) {
      const w = buildDashboardWheres(TENANT, claimsFor(role, { siteIds: [] }));
      expect(dump(w.note), role).toContain(IMPOSSIBLE_ID);
      expect(dump(w.eleve), role).toContain(IMPOSSIBLE_ID);
    }
  });

  it("laisse la direction générale voir tout le tenant", () => {
    for (const role of ["TENANT_ADMIN", "SUPER_ADMIN"]) {
      const w = buildDashboardWheres(TENANT, claimsFor(role, { siteIds: [] }));
      expect(w.note).toEqual({ tenantId: TENANT });
      expect(w.classe).toEqual({ tenantId: TENANT });
    }
  });
});

describe("dashboardCacheKey", () => {
  it("distingue deux rôles portant par ailleurs les mêmes revendications", () => {
    const a = dashboardCacheKey(TENANT, { role: "PARENT", id: "u1", siteIds: [SITE_A] });
    const b = dashboardCacheKey(TENANT, { role: "TEACHER", id: "u1", siteIds: [SITE_A] });
    expect(a).not.toBe(b);
  });

  it("distingue deux utilisateurs de même rôle (périmètre personnel)", () => {
    const a = dashboardCacheKey(TENANT, { role: "PARENT", id: "parent-1" });
    const b = dashboardCacheKey(TENANT, { role: "PARENT", id: "parent-2" });
    expect(a).not.toBe(b);
  });

  it("distingue le tenant, le site sélectionné et le mode mono-site", () => {
    const base: DashboardScopeClaims = { role: "TEACHER", id: "u1", siteIds: [SITE_A, SITE_B] };
    expect(dashboardCacheKey(TENANT, base)).not.toBe(dashboardCacheKey("tenant-2", base));
    expect(dashboardCacheKey(TENANT, base)).not.toBe(
      dashboardCacheKey(TENANT, { ...base, siteId: SITE_A })
    );
    expect(dashboardCacheKey(TENANT, base)).not.toBe(
      dashboardCacheKey(TENANT, { ...base, tenantHasSites: false })
    );
  });

  it("est stable quel que soit l'ordre des sites autorisés", () => {
    expect(dashboardCacheKey(TENANT, { role: "TEACHER", id: "u1", siteIds: [SITE_A, SITE_B] })).toBe(
      dashboardCacheKey(TENANT, { role: "TEACHER", id: "u1", siteIds: [SITE_B, SITE_A] })
    );
  });

  it("accepte indifféremment `id` et `userId`", () => {
    expect(dashboardCacheKey(TENANT, { role: "PARENT", id: "u1" })).toBe(
      dashboardCacheKey(TENANT, { role: "PARENT", userId: "u1" })
    );
  });
});

describe("garde-fous au niveau des sources", () => {
  // Vitest s'exécute depuis la racine du dépôt (cf. vitest.config.ts).
  const root = process.cwd();
  const page = readFileSync(
    path.join(root, "src", "app", "(dashboard)", "dashboard", "page.tsx"),
    "utf8"
  );
  const chart = readFileSync(
    path.join(root, "src", "app", "api", "dashboard", "absences-chart", "route.ts"),
    "utf8"
  );

  it("le dashboard combine périmètre de site ET périmètre personnel", () => {
    // Les fonctions pures vivent désormais dans dashboard-scope.ts, importées
    // par la page. On vérifie la présence du périmètre personnel dans la
    // source qui construit les filtres, et l'import côté page.
    const scope = readFileSync(
      path.join(root, "src", "app", "(dashboard)", "dashboard", "dashboard-scope.ts"),
      "utf8"
    );
    expect(scope).toContain("personalScopeFilter");
    expect(scope).toContain("mergeFilters");
    expect(page).toContain("dashboard-scope");
  });

  it("le graphique d'absences n'utilise plus le filtre de site seul", () => {
    expect(chart).not.toContain("@/lib/site-filter");
    expect(chart).not.toContain("siteFilterForRelation");
    expect(chart).toContain("personalScopeFilter");
    expect(chart).toContain("mergeFilters");
  });

  it("le dashboard aiguille par rôle via accueilPourRole", () => {
    expect(page).toContain("accueilPourRole");
    expect(page).not.toContain('redirect("/super-admin")');
  });
});
