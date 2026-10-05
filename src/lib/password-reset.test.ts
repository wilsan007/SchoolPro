import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    verificationToken: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    user: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async () => []),
  },
}));
vi.mock("@/lib/audit", () => ({ auditFire: vi.fn() }));
vi.mock("@/lib/tenant-claims", () => ({ incrementerSessionVersion: vi.fn() }));
vi.mock("@/lib/notifications/email", () => ({ sendEmail: vi.fn(), renderNotificationEmail: vi.fn() }));

import prisma from "@/lib/prisma";
import { genererTokenReset, verifierTokenReset, reinitialiserMotDePasse, PREFIXE_RESET } from "./password-reset";
import { verifierTokenVerification } from "./email-verification";

const db = prisma as unknown as {
  verificationToken: Record<"deleteMany" | "create" | "findUnique" | "delete", ReturnType<typeof vi.fn>>;
  user: Record<"findFirst" | "update", ReturnType<typeof vi.fn>>;
};
const DEMAIN = new Date(Date.now() + 86_400_000);

beforeEach(() => vi.clearAllMocks());

describe("jetons de réinitialisation", () => {
  it("sont rangés sous un identifiant préfixé, sans toucher aux jetons de vérification d'email", async () => {
    await genererTokenReset(" User@Test.com ");

    const identifier = `${PREFIXE_RESET}user@test.com`;
    expect(db.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier } });
    expect(db.verificationToken.create.mock.calls[0][0].data.identifier).toBe(identifier);
  });

  it("rendent l'email sans le préfixe", async () => {
    db.verificationToken.findUnique.mockResolvedValue({ identifier: `${PREFIXE_RESET}user@test.com`, expires: DEMAIN });
    expect(await verifierTokenReset("t")).toEqual({ valid: true, email: "user@test.com" });
  });

  it("un jeton de vérification d'email ne permet pas de changer le mot de passe", async () => {
    db.verificationToken.findUnique.mockResolvedValue({ identifier: "user@test.com", expires: DEMAIN });
    expect((await verifierTokenReset("t")).valid).toBe(false);
    expect((await reinitialiserMotDePasse("t", "Nouveau@2026!")).success).toBe(false);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("un jeton de réinitialisation ne vérifie pas un email", async () => {
    db.verificationToken.findUnique.mockResolvedValue({ identifier: `${PREFIXE_RESET}user@test.com`, expires: DEMAIN });
    expect((await verifierTokenVerification("t")).valid).toBe(false);
  });

  it("la réinitialisation marque l'email vérifié s'il ne l'était pas, et lève le changement forcé", async () => {
    db.verificationToken.findUnique.mockResolvedValue({ identifier: `${PREFIXE_RESET}user@test.com`, expires: DEMAIN });
    db.user.findFirst.mockResolvedValue({ id: "u1", email: "user@test.com", isActive: true, emailVerified: null });

    expect((await reinitialiserMotDePasse("t", "Nouveau@2026!")).success).toBe(true);
    const data = db.user.update.mock.calls[0][0].data;
    expect(data.mustChangePassword).toBe(false);
    expect(data.emailVerified).toBeInstanceOf(Date);
    expect(data.sessionVersion).toEqual({ increment: 1 });
  });

  it("ne réécrit pas la date d'un email déjà vérifié", async () => {
    db.verificationToken.findUnique.mockResolvedValue({ identifier: `${PREFIXE_RESET}user@test.com`, expires: DEMAIN });
    db.user.findFirst.mockResolvedValue({ id: "u1", email: "user@test.com", isActive: true, emailVerified: new Date(0) });

    await reinitialiserMotDePasse("t", "Nouveau@2026!");
    expect(db.user.update.mock.calls[0][0].data).not.toHaveProperty("emailVerified");
  });
});
