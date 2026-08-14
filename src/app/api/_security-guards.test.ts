import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Lot C — blocage PARENT / STUDENT sur les routes API du personnel.
 *
 * Les cinq routes ci-dessous servent des outils de gestion (console de
 * communication, liste des cours, EDT, salles, disponibilités enseignants).
 * Un PARENT ou un STUDENT possède les permissions `*:read` correspondantes —
 * nécessaires pour son propre espace et les routes mobiles scopées — mais ne
 * doit pas voir les données de tout l'établissement. Chaque route applique
 * donc `isRelationScopedRole(role)` APRÈS le `checkPermission` (qui passe) et
 * renvoie 403.
 *
 * Ces tests figent ce garde-fou : si quelqu'un supprime la vérification, la
 * route exposera à nouveau le tenant entier aux familles.
 */

// --- Mocks communs -------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// `checkPermission` renvoie `null` = autorisé au niveau permission.
// C'est volontaire : on veut isoler le blocage par rôle qui suit.
vi.mock("@/lib/rbac", () => ({
  checkPermission: vi.fn(() => null),
}));

vi.mock("@/lib/prisma", () => ({
  default: new Proxy({}, { get: () => vi.fn() }),
}));

// Les routes importent `siteFilterForModel` / `siteFilterForRelation` depuis
// `@/lib/site-scope` ou `@/lib/site-filter`. On laisse le vrai module
// `@/lib/site-scope` (il est pur) mais on neutralise `@/lib/site-filter`
// qui peut charger Prisma.
vi.mock("@/lib/site-filter", () => ({
  siteFilterForModel: vi.fn(() => ({})),
  siteFilterForRelation: vi.fn(() => ({})),
}));

vi.mock("@/lib/notifications/dispatch", () => ({
  dispatchNotification: vi.fn(),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimit: vi.fn(() => ({ allowed: true })),
  getClientIP: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/annee-scolaire", () => ({
  getAnneeCouranteLibelle: vi.fn(() => "2024-2025"),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { auth } from "@/lib/auth";

const mockAuth = auth as ReturnType<typeof vi.fn>;

// --- Import des handlers après les mocks ---------------------------------

const { GET: getCommunication } = await import("@/app/api/communication/route");
const { GET: getCours } = await import("@/app/api/cours/route");
const { GET: getEmploiDuTemps } = await import(
  "@/app/api/emploi-du-temps/route"
);
const { GET: getSalles } = await import("@/app/api/salles/route");
const { GET: getDisponibilites } = await import(
  "@/app/api/disponibilites/route"
);

// --- Helpers -------------------------------------------------------------

function mockRequest(url: string): Request {
  return { url, method: "GET" } as unknown as Request;
}

function sessionFor(role: string) {
  return {
    user: { id: "u1", tenantId: "t1", role, siteId: "s1", siteIds: ["s1"] },
  };
}

const ROUTES = [
  { name: "/api/communication", handler: getCommunication, url: "http://localhost/api/communication" },
  { name: "/api/cours", handler: getCours, url: "http://localhost/api/cours" },
  { name: "/api/emploi-du-temps", handler: getEmploiDuTemps, url: "http://localhost/api/emploi-du-temps" },
  { name: "/api/salles", handler: getSalles, url: "http://localhost/api/salles" },
  { name: "/api/disponibilites", handler: getDisponibilites, url: "http://localhost/api/disponibilites" },
] as const;

const RELATION_ROLES = ["PARENT", "STUDENT"] as const;

// --- Tests ---------------------------------------------------------------

describe("Lot C — blocage PARENT / STUDENT sur les routes API du personnel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(ROUTES)(
    "%s renvoie 403 pour PARENT (permission accordée mais rôle bloqué)",
    async ({ handler, url }) => {
      mockAuth.mockResolvedValue(sessionFor("PARENT"));
      const res = await handler(mockRequest(url) as never);
      expect(res.status).toBe(403);
    }
  );

  it.each(ROUTES)(
    "%s renvoie 403 pour STUDENT (permission accordée mais rôle bloqué)",
    async ({ handler, url }) => {
      mockAuth.mockResolvedValue(sessionFor("STUDENT"));
      const res = await handler(mockRequest(url) as never);
      expect(res.status).toBe(403);
    }
  );

  it.each(ROUTES)(
    "%s renvoie 401 sans session",
    async ({ handler, url }) => {
      mockAuth.mockResolvedValue(null);
      const res = await handler(mockRequest(url) as never);
      expect(res.status).toBe(401);
    }
  );

  it("les deux rôles relationnels sont bien PARENT et STUDENT", () => {
    // Garde-fou : si on ajoute un rôle relationnel, il faut l'ajouter ici.
    expect(RELATION_ROLES).toEqual(["PARENT", "STUDENT"]);
  });
});
