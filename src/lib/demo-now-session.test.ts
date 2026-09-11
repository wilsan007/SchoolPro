import { Role } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  mobile: vi.fn(),
  cookies: new Map<string, string>(),
  headers: new Headers(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/mobile-auth", () => ({ verifyMobileScope: mocks.mobile }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (key: string) => mocks.cookies.has(key) ? { value: mocks.cookies.get(key)! } : undefined }),
  headers: async () => mocks.headers,
}));

import { getDemoDate, getDemoNow } from "./demo-now";

const date = "2025-10-15T10:00:00.000Z";
const admin = { id: "audit-admin", tenantId: "audit-tenant", role: "TENANT_ADMIN" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookies.clear();
  mocks.headers = new Headers();
  mocks.cookies.set("demo_now_enabled", "true");
  mocks.cookies.set("demo_now", encodeURIComponent(date));
  mocks.cookies.set("demo_now_scope", encodeURIComponent(JSON.stringify([admin.id, admin.tenantId])));
  mocks.auth.mockResolvedValue({ user: admin });
});

afterEach(() => vi.useRealTimers());

describe("date de démonstration et session vérifiée", () => {
  it("applique la date au compte et au tenant qui l'ont choisie", async () => {
    expect((await getDemoDate())?.toISOString()).toBe(date);
  });

  it.each(Object.values(Role).filter((role) => role !== "TENANT_ADMIN"))("ignore les cookies pour %s", async (role) => {
    mocks.auth.mockResolvedValue({ user: { ...admin, role } });
    expect(await getDemoDate()).toBeNull();
  });

  it.each([null, { user: { ...admin, id: "" } }, { user: { ...admin, tenantId: null } }])("refuse une session sans périmètre complet %#", async (session) => {
    mocks.auth.mockResolvedValue(session);
    expect(await getDemoDate()).toBeNull();
  });

  it("ignore une date choisie dans un autre tenant", async () => {
    mocks.auth.mockResolvedValue({ user: { ...admin, tenantId: "other-tenant" } });
    expect(await getDemoDate()).toBeNull();
  });

  it("ignore une date choisie par un autre compte", async () => {
    mocks.auth.mockResolvedValue({ user: { ...admin, id: "other-user" } });
    expect(await getDemoDate()).toBeNull();
  });

  it("fallback sur le rôle seul quand le scope cookie manque", async () => {
    // Le scope cookie peut disparaître (expiration, effacement partiel).
    // getDemoDate() ne doit pas rejeter la date : les cookies demo_now et
    // demo_now_enabled sont httpOnly, donc seul le serveur peut les poser
    // (via le POST qui vérifie déjà le rôle). La vérification de rôle
    // (peutDeplacerHorloge) reste le garde-fou essentiel.
    mocks.cookies.delete("demo_now_scope");
    expect((await getDemoDate())?.toISOString()).toBe(date);
  });

  it("rejette sans scope cookie si le rôle n'est pas autorisé", async () => {
    mocks.cookies.delete("demo_now_scope");
    mocks.auth.mockResolvedValue({ user: { ...admin, role: "PARENT" } });
    expect(await getDemoDate()).toBeNull();
  });

  it.each(["%invalid", "not-a-date"])("ignore une date illisible %s", async (value) => {
    mocks.cookies.set("demo_now", value);
    expect(await getDemoDate()).toBeNull();
  });

  it("revient à l'heure réelle lorsque la session est refusée", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T12:00:00.000Z"));
    mocks.auth.mockResolvedValue(null);
    expect((await getDemoNow()).toISOString()).toBe("2026-09-07T12:00:00.000Z");
  });

  it("échoue fermé si la session ne peut pas être vérifiée", async () => {
    mocks.auth.mockRejectedValue(new Error("session unavailable"));
    expect(await getDemoDate()).toBeNull();
  });

  it("empêche une lecture récursive pendant la résolution de session", async () => {
    mocks.auth.mockImplementationOnce(async () => {
      expect(await getDemoDate()).toBeNull();
      return { user: admin };
    });
    expect((await getDemoDate())?.toISOString()).toBe(date);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
  });

  it("vérifie le périmètre mobile lorsqu'un bearer est présent", async () => {
    mocks.headers.set("authorization", "Bearer audit-token");
    mocks.mobile.mockResolvedValue(admin);
    expect((await getDemoDate())?.toISOString()).toBe(date);
    expect(mocks.mobile).toHaveBeenCalledTimes(1);
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("ne remplace pas un bearer invalide par une session web autorisée", async () => {
    mocks.headers.set("authorization", "Bearer invalid-audit-token");
    mocks.mobile.mockResolvedValue(null);
    expect(await getDemoDate()).toBeNull();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("isole deux résolutions de session concurrentes", async () => {
    mocks.auth.mockResolvedValueOnce({ user: admin });
    mocks.auth.mockResolvedValueOnce({ user: { ...admin, role: "PARENT" } });
    const results = await Promise.all([getDemoDate(), getDemoDate()]);
    expect(results[0]?.toISOString()).toBe(date);
    expect(results[1]).toBeNull();
  });
});
