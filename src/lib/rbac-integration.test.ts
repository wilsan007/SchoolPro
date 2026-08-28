import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests d'intégration du RBAC — checkPermission et authorize.
 *
 * `checkPermission` est une garde synchrone qui retourne `null` si la
 * permission est accordée, ou une `NextResponse` 403 si refusée.
 * `authorize` est la garde asynchrone qui vérifie aussi la session (401
 * si non authentifié).
 */

// ------------------------------------------------------------
// Mocks des dépendances
// ------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  auditFire: vi.fn(),
  audit: vi.fn(),
}));

// Mock léger de NextResponse : la vraie classe étend Response et ajoute
// .json() statique. On la reproduit pour éviter de charger next/server
// (qui peut poser problème dans l'environnement vitest jsdom).
vi.mock("next/server", () => {
  class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit): NextResponse {
      const headers = new Headers(init?.headers);
      headers.set("content-type", "application/json");
      return new NextResponse(JSON.stringify(body), {
        ...init,
        headers,
      });
    }
  }
  return { NextResponse };
});

// ------------------------------------------------------------
// Imports APRÈS les mocks
// ------------------------------------------------------------

import { auth } from "@/lib/auth";
import { auditFire } from "@/lib/audit";
import { checkPermission, authorize } from "@/lib/rbac";
import type { Role } from "@prisma/client";

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/** Construit une session NextAuth simulée. */
function makeSession(overrides: Partial<{
  id: string;
  role: Role;
  tenantId: string | null;
  siteId: string | null;
  siteIds: string[];
}> = {}) {
  return {
    user: {
      id: overrides.id ?? "user-1",
      role: overrides.role ?? "TENANT_ADMIN",
      // Si overrides.tenantId est explicitement null, on garde null
      tenantId: overrides.hasOwnProperty("tenantId") ? overrides.tenantId : "tenant-1",
      siteId: overrides.siteId ?? null,
      siteIds: overrides.siteIds ?? [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ------------------------------------------------------------
// checkPermission
// ------------------------------------------------------------

describe("checkPermission", () => {
  it("retourne null si la permission est accordée", () => {
    // TENANT_ADMIN a "eleves:*" → "eleves:write" est accordée
    const result = checkPermission("TENANT_ADMIN" as Role, "eleves:write");
    expect(result).toBeNull();
  });

  it("retourne null pour SUPER_ADMIN (toutes permissions via '*')", () => {
    const result = checkPermission("SUPER_ADMIN" as Role, "finance:delete");
    expect(result).toBeNull();
  });

  it("retourne null pour une permission de module large (eleves:*)", () => {
    // TEACHER a "eleves:read" mais pas "eleves:write"
    const result = checkPermission("TEACHER" as Role, "eleves:read");
    expect(result).toBeNull();
  });

  it("retourne une Response 403 si la permission est refusée", () => {
    // TEACHER n'a pas "eleves:write"
    const result = checkPermission("TEACHER" as Role, "eleves:write");
    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Response);
  });

  it("la Response 403 a le bon statut HTTP", () => {
    const result = checkPermission("TEACHER" as Role, "eleves:write");
    expect(result).not.toBeNull();
    expect((result as Response).status).toBe(403);
  });

  it("la Response 403 contient un message d'erreur", async () => {
    const result = checkPermission("TEACHER" as Role, "finance:write");
    expect(result).not.toBeNull();
    const body = await (result as Response).json();
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
  });

  it("journalise le refus via auditFire", () => {
    const result = checkPermission("TEACHER" as Role, "eleves:write");
    expect(result).not.toBeNull();
    expect(auditFire).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth:check",
        verdict: "DENIED",
        resource: "eleves:write",
        reason: "Privilèges insuffisants",
      })
    );
  });

  it("n'appelle pas auditFire quand la permission est accordée", () => {
    checkPermission("TENANT_ADMIN" as Role, "eleves:write");
    expect(auditFire).not.toHaveBeenCalled();
  });

  it("refuse une permission inexistante pour un rôle sans wildcard", () => {
    // NURSE n'a pas "finance:read"
    const result = checkPermission("NURSE" as Role, "finance:read");
    expect(result).not.toBeNull();
    expect((result as Response).status).toBe(403);
  });

  it("refuse un rôle inconnu (non présent dans la matrice)", () => {
    const result = checkPermission("ROLE_INEXISTANT" as Role, "eleves:read");
    expect(result).not.toBeNull();
    expect((result as Response).status).toBe(403);
  });

  it("accorde une permission via wildcard de module (notes:*)", () => {
    // TENANT_ADMIN a "notes:*"
    const result = checkPermission("TENANT_ADMIN" as Role, "notes:delete");
    expect(result).toBeNull();
  });
});

// ------------------------------------------------------------
// authorize — session et 401
// ------------------------------------------------------------

describe("authorize — session et authentification", () => {
  it("retourne 401 si pas de session (non authentifié)", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const gate = await authorize({ permission: "eleves:read" });

    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(401);
      const body = await gate.response.json();
      expect(body.error).toContain("authentifié");
    }
  });

  it("retourne 401 si la session n'a pas d'ID utilisateur", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: null } } as never);

    const gate = await authorize({ permission: "eleves:read" });

    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(401);
    }
  });

  it("journalise le refus 401 via auditFire", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    await authorize({ permission: "eleves:read" });

    expect(auditFire).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth:check",
        verdict: "DENIED",
        reason: "Non authentifié",
      })
    );
  });
});

// ------------------------------------------------------------
// authorize — tenant
// ------------------------------------------------------------

describe("authorize — vérification du tenant", () => {
  it("retourne 403 si pas de tenantId (et non SUPER_ADMIN)", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession({ tenantId: null, role: "TEACHER" }) as never
    );

    const gate = await authorize({ permission: "eleves:read" });

    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(403);
      const body = await gate.response.json();
      expect(body.error).toContain("établissement");
    }
  });

  it("exempte SUPER_ADMIN de l'exigence de tenantId", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession({ tenantId: null, role: "SUPER_ADMIN" }) as never
    );

    const gate = await authorize({ permission: "eleves:read" });

    expect(gate.ok).toBe(true);
  });

  it("accepte requireTenant=false (pas de tenant requis)", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession({ tenantId: null, role: "TEACHER" }) as never
    );

    const gate = await authorize({ permission: "eleves:read", requireTenant: false });

    // TEACHER a "eleves:read" → autorisé même sans tenant
    expect(gate.ok).toBe(true);
  });
});

// ------------------------------------------------------------
// authorize — permissions
// ------------------------------------------------------------

describe("authorize — vérification des permissions", () => {
  it("retourne ok=true si la permission est accordée", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession({ role: "TENANT_ADMIN" }) as never
    );

    const gate = await authorize({ permission: "eleves:write" });

    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.userId).toBe("user-1");
      expect(gate.tenantId).toBe("tenant-1");
      expect(gate.role).toBe("TENANT_ADMIN");
    }
  });

  it("retourne 403 si la permission est refusée", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession({ role: "TEACHER" }) as never
    );

    const gate = await authorize({ permission: "eleves:write" });

    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(403);
      const body = await gate.response.json();
      expect(body.error).toContain("privilèges");
    }
  });

  it("accepte un tableau de permissions (OU logique — une suffit)", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession({ role: "TEACHER" }) as never
    );

    // TEACHER a "eleves:read" mais pas "eleves:write" ni "finance:write"
    const gate = await authorize({
      permission: ["eleves:write", "eleves:read", "finance:write"],
    });

    expect(gate.ok).toBe(true);
  });

  it("retourne 403 si AUCUNE permission du tableau n'est accordée", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession({ role: "TEACHER" }) as never
    );

    const gate = await authorize({
      permission: ["eleves:write", "finance:write", "rh:write"],
    });

    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(403);
    }
  });

  it("journalise le refus de permission via auditFire", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession({ role: "TEACHER" }) as never
    );

    await authorize({ permission: "eleves:write" });

    expect(auditFire).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth:check",
        verdict: "DENIED",
        reason: "Privilèges insuffisants",
        metadata: expect.objectContaining({ role: "TEACHER" }),
      })
    );
  });

  it("ok=true sans permission requise (juste authentifié + tenant)", async () => {
    vi.mocked(auth).mockResolvedValue(makeSession() as never);

    const gate = await authorize();

    expect(gate.ok).toBe(true);
  });
});

// ------------------------------------------------------------
// authorize — SUPER_ADMIN
// ------------------------------------------------------------

describe("authorize — SUPER_ADMIN", () => {
  it("SUPER_ADMIN accède à n'importe quelle permission", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession({ role: "SUPER_ADMIN" }) as never
    );

    const gate = await authorize({ permission: "nimporte:quoi" });

    expect(gate.ok).toBe(true);
  });

  it("SUPER_ADMIN sans tenantId est autorisé", async () => {
    vi.mocked(auth).mockResolvedValue(
      makeSession({ role: "SUPER_ADMIN", tenantId: null }) as never
    );

    const gate = await authorize({ permission: "eleves:read" });

    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.tenantId).toBe("");
    }
  });
});
