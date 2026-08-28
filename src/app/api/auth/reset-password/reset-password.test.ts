import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks des dépendances externes ---

vi.mock("@/lib/audit", () => ({
  auditFire: vi.fn(),
}));

vi.mock("@/lib/password-reset", () => ({
  verifierTokenReset: vi.fn(),
  reinitialiserMotDePasse: vi.fn(),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimit: vi.fn(() => ({ allowed: true, remaining: 9, resetAt: Date.now() + 900_000 })),
  getClientIP: vi.fn(() => "127.0.0.1"),
}));

import { auditFire } from "@/lib/audit";
import { verifierTokenReset, reinitialiserMotDePasse } from "@/lib/password-reset";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";

const mockVerifierTokenReset = verifierTokenReset as ReturnType<typeof vi.fn>;
const mockReinitialiserMotDePasse = reinitialiserMotDePasse as ReturnType<typeof vi.fn>;
const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
const mockGetClientIP = getClientIP as ReturnType<typeof vi.fn>;
const mockAuditFire = auditFire as ReturnType<typeof vi.fn>;

function req(body?: unknown) {
  return {
    url: "http://localhost/api/auth/reset-password",
    headers: new Headers(),
    json: async () => body,
  } as unknown as import("next/server").NextRequest;
}

const { POST } = await import("./route");

const VALID_PASSWORD = "Abcdef1!";
const VALID_TOKEN = "valid-reset-token";

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() + 900_000 });
  mockGetClientIP.mockReturnValue("127.0.0.1");
  mockVerifierTokenReset.mockResolvedValue({ valid: true, email: "user@test.com" });
  mockReinitialiserMotDePasse.mockResolvedValue({ success: true });
});

describe("POST /api/auth/reset-password", () => {
  it("réinitialise le mot de passe avec un token valide et un password valide", async () => {
    const res = await POST(req({ token: VALID_TOKEN, password: VALID_PASSWORD }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    expect(mockVerifierTokenReset).toHaveBeenCalledWith(VALID_TOKEN);
    expect(mockReinitialiserMotDePasse).toHaveBeenCalledWith(VALID_TOKEN, VALID_PASSWORD);
  });

  it("refuse si le token est invalide", async () => {
    mockVerifierTokenReset.mockResolvedValue({ valid: false, error: "Token invalide" });

    const res = await POST(req({ token: "bad-token", password: VALID_PASSWORD }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("invalid_token");

    expect(mockReinitialiserMotDePasse).not.toHaveBeenCalled();
    expect(mockAuditFire).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth:reset-password",
        verdict: "DENIED",
        reason: "Token invalide",
      }),
    );
  });

  it("refuse si le token est expiré", async () => {
    mockVerifierTokenReset.mockResolvedValue({ valid: false, error: "Token expiré" });

    const res = await POST(req({ token: "expired-token", password: VALID_PASSWORD }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("invalid_token");
  });

  it("refuse si le password est trop court (< 8)", async () => {
    const res = await POST(req({ token: VALID_TOKEN, password: "Ab1!" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("weak_password");
    expect(data.codes).toContain("PASSWORD_TOO_SHORT");

    // Le token n'est pas vérifié si le password est faible
    expect(mockVerifierTokenReset).not.toHaveBeenCalled();
  });

  it("refuse si le password n'a pas de majuscule", async () => {
    const res = await POST(req({ token: VALID_TOKEN, password: "abcdef1!" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("weak_password");
    expect(data.codes).toContain("PASSWORD_MISSING_UPPERCASE");
  });

  it("refuse si le password n'a pas de minuscule", async () => {
    const res = await POST(req({ token: VALID_TOKEN, password: "ABCDEF1!" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("weak_password");
    expect(data.codes).toContain("PASSWORD_MISSING_LOWERCASE");
  });

  it("refuse si le password n'a pas de chiffre", async () => {
    const res = await POST(req({ token: VALID_TOKEN, password: "Abcdefg!" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("weak_password");
    expect(data.codes).toContain("PASSWORD_MISSING_NUMBER");
  });

  it("refuse si le password n'a pas de caractère spécial", async () => {
    const res = await POST(req({ token: VALID_TOKEN, password: "Abcdef12" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("weak_password");
    expect(data.codes).toContain("PASSWORD_MISSING_SPECIAL");
  });

  it("refuse si la réinitialisation échoue côté service", async () => {
    mockReinitialiserMotDePasse.mockResolvedValue({ success: false, error: "Compte introuvable" });

    const res = await POST(req({ token: VALID_TOKEN, password: VALID_PASSWORD }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("reset_failed");
  });

  it("refuse après 10 requêtes (rate limiting 10/15min)", async () => {
    mockRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 900_000 });

    const res = await POST(req({ token: VALID_TOKEN, password: VALID_PASSWORD }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("900");
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("rate_limited");
  });

  it("refuse si le body est invalide (token manquant)", async () => {
    const res = await POST(req({ password: VALID_PASSWORD }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("invalid_data");
  });

  it("refuse si le body est invalide (password manquant)", async () => {
    const res = await POST(req({ token: VALID_TOKEN }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("invalid_data");
  });

  it("refuse si le body n'est pas du JSON valide", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid_data");
  });

  it("vérifie la complexité du password AVANT de consommer le token", async () => {
    await POST(req({ token: VALID_TOKEN, password: "weak" }));
    // Le token n'est pas vérifié car le password est faible
    expect(mockVerifierTokenReset).not.toHaveBeenCalled();
  });
});
