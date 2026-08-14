import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Garde-fou pour le périmètre personnel des attestations.
 *
 * La route `/api/learnos/attestations` liste des feuilles d'exercices de type
 * « attestation » : ces données sont nominatives (nom, prénom, classe de
 * l'élève). Pour PARENT et STUDENT, `siteFilterForModel` seul renvoie un filtre
 * vide (périmètre relationnel) : sans `personalScopeFilter`, la route
 * exposerait les attestations de tout le tenant.
 *
 * Ce test est un garde-fou au niveau des sources, sur le modèle de
 * `dashboard-scope.test.ts` : il vérifie que le fichier source importe et
 * utilise `personalScopeFilter` et `mergeFilters`. Si quelqu'un retire ces
 * imports, le test échoue avant même qu'une fuite ne se produise en production.
 */

// Neutraliser les dépendances pour pouvoir importer la route si besoin.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));
vi.mock("@/lib/teacher-classes", () => ({
  getTeacherScope: vi.fn(),
  isTeacherRole: vi.fn(() => false),
}));

describe("garde-fou source : périmètre personnel des attestations", () => {
  const root = process.cwd();
  const source = readFileSync(
    path.join(root, "src", "app", "api", "learnos", "attestations", "route.ts"),
    "utf8"
  );

  it("importe personalScopeFilter depuis @/lib/site-scope", () => {
    expect(source).toContain("personalScopeFilter");
    expect(source).toMatch(/from\s+["']@\/lib\/site-scope["']/);
  });

  it("importe mergeFilters pour combiner les filtres sans écrasement", () => {
    expect(source).toContain("mergeFilters");
  });

  it("applique personalScopeFilter dans la requête findMany (pas seulement l'import)", () => {
    // L'import seul ne suffit pas : il faut que le filtre soit passé au `where`.
    // On vérifie la présence de la variable `relationFilter` construite puis
    // utilisée dans le `mergeFilters`.
    expect(source).toContain("personalScopeFilter(session.user");
    expect(source).toContain("relationFilter");
  });

  it("utilise mergeFilters pour construire le where (pas un étalement qui écraserait le filtre)", () => {
    // Un étalement `{ tenantId, ...siteFilter, ...(q && { OR: [...] }) }`
    // écraserait un OR de premier niveau. `mergeFilters` encapsule dans AND.
    expect(source).toMatch(/mergeFilters\s*\(/);
    expect(source).not.toMatch(/where:\s*\{\s*tenantId,\s*\.\.\.siteFilter/);
  });
});
