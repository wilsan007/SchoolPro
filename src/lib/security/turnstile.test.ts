import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mock de fetch global (appel à l'API Cloudflare siteverify) ---

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TURNSTILE_SECRET;
  delete process.env.NODE_ENV;
});

// Import après les mocks
const { verifyTurnstileToken, isTurnstileEnabled } = await import("./turnstile");

describe("verifyTurnstileToken — mode développement (bypass)", () => {
  it("contourne la vérification quand TURNSTILE_SECRET n'est pas défini", async () => {
    delete process.env.TURNSTILE_SECRET;
    const result = await verifyTurnstileToken("any-token");
    expect(result.success).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("contourne même avec un token vide en dev", async () => {
    delete process.env.TURNSTILE_SECRET;
    const result = await verifyTurnstileToken("");
    expect(result.success).toBe(true);
  });

  it("contourne même avec un token null en dev", async () => {
    delete process.env.TURNSTILE_SECRET;
    const result = await verifyTurnstileToken(null);
    expect(result.success).toBe(true);
  });
});

describe("verifyTurnstileToken — production (avec TURNSTILE_SECRET)", () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET = "1x0000000000000000000000000000000AA";
    process.env.NODE_ENV = "production";
  });

  it("retourne success:true pour un token valide", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const result = await verifyTurnstileToken("valid-turnstile-token");
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("retourne success:false pour un token invalide", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        "error-codes": ["invalid-input-response"],
      }),
    });

    const result = await verifyTurnstileToken("bad-token");
    expect(result.success).toBe(false);
    expect(result.error).toBe("invalid-input-response");
  });

  it("retourne success:false pour un token vide", async () => {
    const result = await verifyTurnstileToken("");
    expect(result.success).toBe(false);
    expect(result.error).toBe("token_manquant");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("retourne success:false pour un token null", async () => {
    const result = await verifyTurnstileToken(null);
    expect(result.success).toBe(false);
    expect(result.error).toBe("token_manquant");
  });

  it("retourne success:false pour un token undefined", async () => {
    const result = await verifyTurnstileToken(undefined);
    expect(result.success).toBe(false);
    expect(result.error).toBe("token_manquant");
  });

  it("retourne error par défaut 'verification_echouee' si pas d'error-codes", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false }),
    });

    const result = await verifyTurnstileToken("some-token");
    expect(result.success).toBe(false);
    expect(result.error).toBe("verification_echouee");
  });

  it("gère les erreurs réseau (fetch rejette)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const result = await verifyTurnstileToken("valid-token");
    expect(result.success).toBe(false);
    expect(result.error).toBe("erreur_reseau");
  });

  it("transmet l'IP du client quand fournie", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    await verifyTurnstileToken("valid-token", "203.0.113.42");
    const callArgs = mockFetch.mock.calls[0][1];
    const body = callArgs.body as URLSearchParams;
    expect(body.get("remoteip")).toBe("203.0.113.42");
  });

  it("ne transmet pas l'IP si absente", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    await verifyTurnstileToken("valid-token");
    const callArgs = mockFetch.mock.calls[0][1];
    const body = callArgs.body as URLSearchParams;
    expect(body.has("remoteip")).toBe(false);
  });
});

describe("isTurnstileEnabled", () => {
  it("retourne true si NEXT_PUBLIC_TURNSTILE_SITEKEY est défini", () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY = "0x4AAAAAAA";
    expect(isTurnstileEnabled()).toBe(true);
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY;
  });

  it("retourne false si NEXT_PUBLIC_TURNSTILE_SITEKEY n'est pas défini", () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY;
    expect(isTurnstileEnabled()).toBe(false);
  });
});
