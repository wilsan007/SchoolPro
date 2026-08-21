import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Contrôle d'accès de la Time Machine.
 *
 * Le bouton se retire pour les rôles non autorisés, mais un bouton masqué
 * n'empêche personne d'appeler la route : c'est ce refus-là que ces tests
 * verrouillent. Depuis l'ajout de l'horizon (`demo-horizon`), déplacer
 * l'horloge masque des données — le contrôle n'est plus cosmétique.
 */

const session = vi.hoisted(() => ({ valeur: null as { user?: { role?: string } } | null }));

vi.mock("@/lib/auth", () => ({
  auth: async () => session.valeur,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const { GET, POST, DELETE } = await import("./route");

// `NextRequest` n'apporte rien ici : le gestionnaire ne lit que le corps.
const requete = (body: unknown) =>
  new Request("http://localhost/api/demo-now", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];

describe("GET /api/demo-now", () => {
  beforeEach(() => {
    session.valeur = null;
  });

  it("rend autorise: true pour l'administrateur du tenant", async () => {
    session.valeur = { user: { role: "TENANT_ADMIN" } };
    const data = await (await GET()).json();
    expect(data.autorise).toBe(true);
  });

  it.each(["TEACHER", "PARENT", "STUDENT", "PRINCIPAL", "SUPER_ADMIN"])(
    "rend autorise: false pour %s",
    async (role) => {
      session.valeur = { user: { role } };
      const data = await (await GET()).json();
      expect(data.autorise).toBe(false);
      // L'état de l'horloge ne regarde pas un compte qui ne peut pas la bouger.
      expect(data.enabled).toBe(false);
    }
  );

  it("rend autorise: false sans session", async () => {
    session.valeur = null;
    const data = await (await GET()).json();
    expect(data.autorise).toBe(false);
  });
});

describe("POST /api/demo-now", () => {
  it("accepte une date de l'administrateur du tenant", async () => {
    session.valeur = { user: { role: "TENANT_ADMIN" } };
    const res = await POST(requete({ date: "2026-02-15T10:00:00.000Z" }));
    expect(res.status).toBe(200);
    // Les cookies doivent être httpOnly, sans quoi la restriction se
    // contournerait en écrivant `document.cookie`.
    const cookies = res.headers.getSetCookie().join(" ");
    expect(cookies).toMatch(/httpOnly/i);
  });

  it.each(["TEACHER", "PARENT", "STUDENT", "SUPER_ADMIN"])(
    "refuse %s avec un 403",
    async (role) => {
      session.valeur = { user: { role } };
      const res = await POST(requete({ date: "2026-02-15T10:00:00.000Z" }));
      expect(res.status).toBe(403);
    }
  );

  it("refuse un visiteur non authentifié", async () => {
    session.valeur = null;
    const res = await POST(requete({ date: "2026-02-15T10:00:00.000Z" }));
    expect(res.status).toBe(403);
  });

  it("rejette une date invalide, même pour un compte autorisé", async () => {
    session.valeur = { user: { role: "TENANT_ADMIN" } };
    const res = await POST(requete({ date: "pas-une-date" }));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/demo-now", () => {
  it("laisse l'administrateur du tenant revenir au temps réel", async () => {
    session.valeur = { user: { role: "TENANT_ADMIN" } };
    expect((await DELETE()).status).toBe(200);
  });

  it("refuse les autres rôles", async () => {
    session.valeur = { user: { role: "PARENT" } };
    expect((await DELETE()).status).toBe(403);
  });
});
