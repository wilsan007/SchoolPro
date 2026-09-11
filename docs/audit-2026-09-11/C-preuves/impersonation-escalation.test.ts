// @vitest-environment node
/**
 * PREUVE DE CONCEPT — escalade inter-tenant via POST /api/auth/session.
 * Un utilisateur ordinaire (TENANT_ADMIN du tenant A) envoie lui-même un
 * `update` de session contenant les champs d'usurpation. Attendu d'un code
 * sûr : tenantId inchangé. Ce test échoue (= faille) si tenantId bascule.
 */
import { describe, it, expect, vi } from "vitest";
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
process.env.AUTH_SECRET = "poc-secret-poc-secret-poc-secret-0123456789";
process.env.AUTH_URL = "http://localhost:3000";

describe("POC impersonation", () => {
  it("un utilisateur non SUPER_ADMIN ne doit pas pouvoir changer de tenant", async () => {
    const { encode, decode } = await import("next-auth/jwt");
    const { handlers } = await import("@/lib/auth");
    const { NextRequest } = await import("next/server.js");
    const { CLAIMS_VERSION } = await import("@/lib/tenant-claims");
    const salt = "authjs.session-token";
    const token = await encode({
      salt, secret: process.env.AUTH_SECRET!,
      token: { id: "user-a", sub: "user-a", role: "TENANT_ADMIN", tenantId: "tenant-A", claimsVersion: CLAIMS_VERSION },
    });
    // 1. Jeton CSRF (obtenable par tout utilisateur)
    const csrfRes = await handlers.GET(new NextRequest("http://localhost:3000/api/auth/csrf", { headers: { cookie: `${salt}=${token}` } }) as never);
    const { csrfToken } = await csrfRes.json();
    const csrfCookie = csrfRes.headers.getSetCookie().map((c: string) => c.split(";")[0]).join("; ");
    // 2. Mise à jour de session forgée
    const res = await handlers.POST(new NextRequest("http://localhost:3000/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${salt}=${token}; ${csrfCookie}` },
      body: JSON.stringify({ csrfToken, data: { impersonating: true, originalTenantId: "x", tenantId: "tenant-VICTIME" } }),
    }) as never);
    const newCookie = res.headers.getSetCookie().find((c: string) => c.startsWith(salt + "="))!;
    const newJwt = await decode({ salt, secret: process.env.AUTH_SECRET!, token: newCookie.split(";")[0].slice(salt.length + 1) });
    console.log("tenantId après update forgé :", newJwt?.tenantId, "| rôle :", newJwt?.role);
    expect(newJwt?.tenantId).toBe("tenant-A");
  });
});
