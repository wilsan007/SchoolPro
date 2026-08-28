import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks des dépendances externes ---

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/audit", () => ({ auditFire: vi.fn() }));

vi.mock("@/lib/erreurs-api", () => ({
  erreurJson: vi.fn((code: string) => {
    const status = code === "NON_AUTORISE" ? 401 : code === "UTILISATEUR_INTROUVABLE" ? 404 : 400;
    return new Response(JSON.stringify({ code }), { status });
  }),
}));

vi.mock("@/lib/password-validation", () => ({
  validerMotDePasse: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
  compare: vi.fn(),
  hash: vi.fn(),
}));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { auditFire } from "@/lib/audit";
import { validerMotDePasse } from "@/lib/password-validation";
import bcrypt from "bcryptjs";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockAuditFire = auditFire as ReturnType<typeof vi.fn>;
const mockValiderMotDePasse = validerMotDePasse as ReturnType<typeof vi.fn>;
const mockBcrypt = bcrypt as unknown as {
  compare: ReturnType<typeof vi.fn>;
  hash: ReturnType<typeof vi.fn>;
};
const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

function req(body?: unknown) {
  return {
    url: "http://localhost/api/auth/set-password",
    json: () => Promise.resolve(body),
  } as unknown as import("next/server").NextRequest;
}

const { POST } = await import("./route");

const SESSION = {
  user: { id: "u1", tenantId: "t1", role: "TENANT_ADMIN" },
};

const HASHED_OLD = "$2a$10$oldhashedpassword";
const HASHED_NEW = "$2a$10$newhashedpassword";

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
  mockValiderMotDePasse.mockReturnValue(null); // password valide par défaut
  mockBcrypt.compare.mockImplementation(async (_plain: string, hash: string) =>
    hash === HASHED_OLD
  );
  mockBcrypt.hash.mockResolvedValue(HASHED_NEW);
  mockPrisma.user.findUnique.mockResolvedValue({
    id: "u1",
    password: HASHED_OLD,
    email: "user@test.com",
  });
  mockPrisma.user.update.mockResolvedValue({});
});

describe("POST /api/auth/set-password", () => {
  // ── Cas nominal ───────────────────────────────────────────────

  it("définit un nouveau mot de passe valide", async () => {
    const res = await POST(
      req({ currentPassword: "OldPass1!", newPassword: "NewPass2@" })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Le mot de passe actuel est vérifié
    expect(mockBcrypt.compare).toHaveBeenCalledWith("OldPass1!", HASHED_OLD);
    // Le nouveau mot de passe est haché et sauvegardé
    expect(mockBcrypt.hash).toHaveBeenCalledWith("NewPass2@", 10);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({
          password: HASHED_NEW,
          mustChangePassword: false,
        }),
      })
    );
    // Audit ALLOWED est tracé
    expect(mockAuditFire).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth:set-password",
        verdict: "ALLOWED",
      })
    );
  });

  // ── Cas d'erreur : authentification ───────────────────────────

  it("renvoie NON_AUTORISE sans session", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await POST(req({ currentPassword: "x", newPassword: "y" }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe("NON_AUTORISE");
  });

  it("renvoie NON_AUTORISE sans userId", async () => {
    mockAuth.mockResolvedValue({ user: { id: null, tenantId: "t1" } });

    const res = await POST(req({ currentPassword: "x", newPassword: "y" }));
    expect(res.status).toBe(401);
  });

  // ── Cas d'erreur : validation du body ─────────────────────────

  it("renvoie DONNEES_INVALIDES si le body est null", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("DONNEES_INVALIDES");
  });

  it("renvoie DONNEES_INVALIDES si currentPassword manque", async () => {
    const res = await POST(req({ newPassword: "NewPass2@" }));
    expect(res.status).toBe(400);
  });

  it("renvoie DONNEES_INVALIDES si newPassword manque", async () => {
    const res = await POST(req({ currentPassword: "OldPass1!" }));
    expect(res.status).toBe(400);
  });

  // ── Cas d'erreur : complexité du mot de passe ─────────────────

  it("renvoie 400 avec les codes d'erreur si le mot de passe est faible", async () => {
    mockValiderMotDePasse.mockReturnValue([
      "PASSWORD_TOO_SHORT",
      "PASSWORD_MISSING_UPPERCASE",
    ]);

    const res = await POST(
      req({ currentPassword: "OldPass1!", newPassword: "weak" })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("weak_password");
    expect(data.codes).toEqual(["PASSWORD_TOO_SHORT", "PASSWORD_MISSING_UPPERCASE"]);

    // La base n'est pas consultée si le mot de passe est invalide
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  // ── Cas d'erreur : utilisateur introuvable ────────────────────

  it("renvoie UTILISATEUR_INTROUVABLE si l'utilisateur n'existe pas", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await POST(
      req({ currentPassword: "OldPass1!", newPassword: "NewPass2@" })
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.code).toBe("UTILISATEUR_INTROUVABLE");
  });

  it("renvoie UTILISATEUR_INTROUVABLE si l'utilisateur n'a pas de mot de passe", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      password: null,
      email: "user@test.com",
    });

    const res = await POST(
      req({ currentPassword: "OldPass1!", newPassword: "NewPass2@" })
    );
    expect(res.status).toBe(404);
  });

  // ── Cas d'erreur : mot de passe actuel incorrect ──────────────

  it("renvoie 400 wrong_current_password si l'ancien mot de passe ne correspond pas", async () => {
    mockBcrypt.compare.mockResolvedValue(false);

    const res = await POST(
      req({ currentPassword: "WrongPass1!", newPassword: "NewPass2@" })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("wrong_current_password");

    // Audit DENIED est tracé
    expect(mockAuditFire).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth:set-password",
        verdict: "DENIED",
        reason: "Mot de passe actuel incorrect",
      })
    );

    // Le mot de passe n'est pas mis à jour
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  // ── Cas d'erreur : même mot de passe que l'ancien ─────────────

  it("renvoie 400 same_as_old si le nouveau mot de passe est identique à l'ancien", async () => {
    // currentPassword correspond, newPassword aussi (same hash)
    mockBcrypt.compare.mockResolvedValue(true);

    const res = await POST(
      req({ currentPassword: "OldPass1!", newPassword: "OldPass1!" })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("same_as_old");

    // Le mot de passe n'est pas mis à jour
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockBcrypt.hash).not.toHaveBeenCalled();
  });
});
