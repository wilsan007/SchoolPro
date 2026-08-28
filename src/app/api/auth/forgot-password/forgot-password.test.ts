import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks des dépendances externes ---

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/audit", () => ({
  auditFire: vi.fn(),
}));

vi.mock("@/lib/password-reset", () => ({
  genererTokenReset: vi.fn(),
}));

vi.mock("@/lib/notifications/email", () => ({
  sendEmail: vi.fn(async () => ({ success: true, sent: 1 })),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimit: vi.fn(() => ({ allowed: true, remaining: 4, resetAt: Date.now() + 900_000 })),
  getClientIP: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: vi.fn(async () => ({ success: true })),
}));

import prisma from "@/lib/prisma";
import { auditFire } from "@/lib/audit";
import { genererTokenReset } from "@/lib/password-reset";
import { sendEmail } from "@/lib/notifications/email";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";
import { verifyTurnstileToken } from "@/lib/security/turnstile";

const mockPrisma = prisma as unknown as {
  user: { findFirst: ReturnType<typeof vi.fn> };
};
const mockGenererTokenReset = genererTokenReset as ReturnType<typeof vi.fn>;
const mockSendEmail = sendEmail as ReturnType<typeof vi.fn>;
const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
const mockGetClientIP = getClientIP as ReturnType<typeof vi.fn>;
const mockVerifyTurnstile = verifyTurnstileToken as ReturnType<typeof vi.fn>;
const mockAuditFire = auditFire as ReturnType<typeof vi.fn>;

function req(body?: unknown, headers?: Record<string, string>) {
  return {
    url: "http://localhost/api/auth/forgot-password",
    headers: new Headers(headers),
    json: async () => body,
  } as unknown as import("next/server").NextRequest;
}

const { POST } = await import("./route");

const VALID_BODY = {
  email: "user@test.com",
  turnstileToken: "valid-turnstile-token",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockReturnValue({ allowed: true, remaining: 4, resetAt: Date.now() + 900_000 });
  mockGetClientIP.mockReturnValue("127.0.0.1");
  mockVerifyTurnstile.mockResolvedValue({ success: true });
  mockGenererTokenReset.mockResolvedValue({ success: true, token: "reset-token-123" });
  mockSendEmail.mockResolvedValue({ success: true, sent: 1 });
});

describe("POST /api/auth/forgot-password", () => {
  it("envoie un email de réinitialisation pour un email existant", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "u1",
      email: "user@test.com",
      name: "User",
    });

    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    expect(mockGenererTokenReset).toHaveBeenCalledWith("user@test.com");
    expect(mockSendEmail).toHaveBeenCalledWith(
      ["user@test.com"],
      "Réinitialisation de votre mot de passe",
      expect.stringContaining("reset-password?token=reset-token-123"),
    );
  });

  it("renvoie la même réponse générique pour un email inexistant (anti-énumération)", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Aucun email envoyé, aucun token généré
    expect(mockGenererTokenReset).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("ne révèle pas si l'email existe ou non (même statut 200)", async () => {
    // Email existant
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "u1",
      email: "exists@test.com",
      name: "User",
    });
    const resExists = await POST(req({ ...VALID_BODY, email: "exists@test.com" }));
    const dataExists = await resExists.json();

    // Email inexistant
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const resNotFound = await POST(req({ ...VALID_BODY, email: "nope@test.com" }));
    const dataNotFound = await resNotFound.json();

    expect(resExists.status).toBe(resNotFound.status);
    expect(dataExists).toEqual(dataNotFound);
  });

  it("refuse après 5 requêtes (rate limiting 5/15min)", async () => {
    mockRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 900_000 });

    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("900");
    // Réponse générique pour ne pas révéler le rate limit
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("vérifie le token Turnstile avant la recherche en base", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    await POST(req(VALID_BODY));

    expect(mockVerifyTurnstile).toHaveBeenCalledWith("valid-turnstile-token", "127.0.0.1");
  });

  it("renvoie une réponse générique si Turnstile échoue", async () => {
    mockVerifyTurnstile.mockResolvedValue({ success: false, error: "invalid-input-response" });

    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // La base n'est pas consultée
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(mockAuditFire).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth:forgot-password",
        verdict: "DENIED",
        reason: "Échec Turnstile",
      }),
    );
  });

  it("renvoie 200 même pour un body invalide (sécurité: pas de révélation)", async () => {
    const res = await POST(req({ email: "not-an-email" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("renvoie 200 même si le body n'est pas du JSON valide", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("normalise l'email avant la recherche en base", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    await POST(req({ ...VALID_BODY, email: "  User@Test.COM  " }));

    const where = mockPrisma.user.findFirst.mock.calls[0][0].where;
    expect(where.email.equals).toBe("user@test.com");
  });

  it("n'envoie pas d'email si la génération du token échoue", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "u1",
      email: "user@test.com",
      name: "User",
    });
    mockGenererTokenReset.mockResolvedValue({ success: false, error: "Erreur serveur" });

    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("utilise l'IP du client comme clé de rate limiting", async () => {
    mockGetClientIP.mockReturnValue("203.0.113.99");
    mockPrisma.user.findFirst.mockResolvedValue(null);
    await POST(req(VALID_BODY));

    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "forgot-pwd:203.0.113.99" }),
    );
  });
});
