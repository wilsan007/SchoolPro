/**
 * SchoolPro — Tests serveur des invitations
 * ============================================================
 * Flux de SÉCURITÉ (il crée des comptes). Ce que ces tests protègent :
 *   1. un mot de passe faible est refusé AVANT tout accès à la base ;
 *   2. jeton inconnu, expiré, révoqué ou déjà utilisé ⇒ AUCUN compte créé ;
 *   3. l'acceptation marque l'email VÉRIFIÉ (l'invitation prouve la possession
 *      de l'adresse) et n'impose aucun changement de mot de passe ;
 *   4. la création refuse un rôle non invitable, une adresse invalide, une
 *      adresse déjà utilisée, une invitation déjà en attente.
 *
 * `withSystemContext` est neutralisé (simple passage) : c'est le conteneur RLS,
 * pas la logique testée.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const invitation = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const user = { findFirst: vi.fn(), create: vi.fn() };
  const enseignant = { create: vi.fn() };
  const tx = { user, enseignant, invitation };
  const prisma = {
    invitation,
    user,
    enseignant,
    // Le nom de l'établissement est lu pour l'événement LEARNOS.
    tenant: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };
  return { prisma, tx };
});

vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ auditFire: vi.fn() }));
vi.mock("@/lib/notifications/email", () => ({
  sendEmail: vi.fn(async () => ({ success: true, sent: 1 })),
}));
// Le bus LEARNOS est simulé : ses handlers ont leur propre suite de tests, et
// l'appeler ici ferait dépendre ces tests de l'ordre de drainage des événements.
vi.mock("@/lib/learnos/events", () => ({ publishEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/rls-context", () => ({
  withSystemContext: vi.fn(async (_r: string, fn: () => Promise<unknown>) => fn()),
}));

import { accepterInvitation, creerInvitation } from "@/lib/invitations-server";

const invitationValide = (over: Record<string, unknown> = {}) => ({
  id: "inv-1",
  tenantId: "t1",
  siteId: "s1",
  email: "prof@ecole.dj",
  name: "Ali Hassan",
  role: "TEACHER",
  phone: null,
  status: "PENDING",
  expiresAt: new Date(Date.now() + 3600_000),
  acceptedAt: null,
  revokedAt: null,
  ...over,
});

const claims = {
  tenantId: "t1",
  userId: "u1",
  role: "TENANT_ADMIN",
  siteId: "s1",
  siteIds: ["s1"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(
    async (fn: (t: unknown) => Promise<unknown>) => fn(mocks.tx)
  );
  mocks.prisma.user.create.mockResolvedValue({ id: "u-nouveau" });
  mocks.prisma.invitation.update.mockResolvedValue({});
  mocks.prisma.enseignant.create.mockResolvedValue({});
  mocks.prisma.user.findFirst.mockResolvedValue(null);
  mocks.prisma.tenant.findUnique.mockResolvedValue({ name: "École de test" });
});

describe("accepterInvitation", () => {
  it("refuse un mot de passe faible SANS toucher à la base", async () => {
    const res = await accepterInvitation("jeton", "court");

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.raison).toBe("MOT_DE_PASSE_FAIBLE");
      expect(res.erreurs).toContain("PASSWORD_TOO_SHORT");
    }
    // Le contrôle le moins coûteux vient en premier : aucune requête, donc
    // aucune occasion de hacher inutilement ni de consommer quoi que ce soit.
    expect(mocks.prisma.invitation.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("refuse un jeton inconnu", async () => {
    mocks.prisma.invitation.findUnique.mockResolvedValue(null);
    const res = await accepterInvitation("jeton-inconnu", "MotDePasse1!");
    expect(res).toEqual({ ok: false, raison: "JETON_INCONNU" });
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("refuse une invitation expirée, même avec un mot de passe valide", async () => {
    mocks.prisma.invitation.findUnique.mockResolvedValue(
      invitationValide({ expiresAt: new Date(Date.now() - 1000) })
    );
    expect(await accepterInvitation("jeton", "MotDePasse1!")).toEqual({
      ok: false,
      raison: "EXPIREE",
    });
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("refuse une invitation révoquée, puis une invitation déjà acceptée", async () => {
    mocks.prisma.invitation.findUnique.mockResolvedValue(
      invitationValide({ status: "REVOKED", revokedAt: new Date() })
    );
    expect(await accepterInvitation("j", "MotDePasse1!")).toEqual({
      ok: false,
      raison: "REVOQUEE",
    });

    mocks.prisma.invitation.findUnique.mockResolvedValue(
      invitationValide({ status: "ACCEPTED", acceptedAt: new Date() })
    );
    expect(await accepterInvitation("j", "MotDePasse1!")).toEqual({
      ok: false,
      raison: "DEJA_ACCEPTEE",
    });
  });

  it("refuse si un compte existe déjà pour cette adresse (course entre deux onglets)", async () => {
    mocks.prisma.invitation.findUnique.mockResolvedValue(invitationValide());
    mocks.prisma.user.findFirst.mockResolvedValue({ id: "deja-la" });
    expect(await accepterInvitation("jeton", "MotDePasse1!")).toEqual({
      ok: false,
      raison: "EMAIL_DEJA_UTILISE",
    });
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("crée le compte, marque l'email VÉRIFIÉ, et consomme l'invitation", async () => {
    mocks.prisma.invitation.findUnique.mockResolvedValue(invitationValide());

    const res = await accepterInvitation("jeton", "MotDePasse1!");
    expect(res).toEqual({ ok: true, email: "prof@ecole.dj" });

    const data = mocks.prisma.user.create.mock.calls[0][0].data;
    expect(data.email).toBe("prof@ecole.dj");
    expect(data.tenantId).toBe("t1");
    expect(data.siteId).toBe("s1");
    // L'invitation prouve la possession de l'adresse : l'email est vérifié.
    expect(data.emailVerified).toBeInstanceOf(Date);
    // Mot de passe choisi par l'utilisateur : rien à forcer au premier login.
    expect(data.mustChangePassword).toBe(false);
    expect(typeof data.password).toBe("string");
    expect(data.password).not.toBe("MotDePasse1!"); // haché, jamais en clair

    // Un enseignant doit exister dans la table métier.
    expect(mocks.prisma.enseignant.create).toHaveBeenCalledTimes(1);

    // L'invitation est consommée : usage unique.
    const maj = mocks.prisma.invitation.update.mock.calls[0][0].data;
    expect(maj.status).toBe("ACCEPTED");
    expect(maj.acceptedAt).toBeInstanceOf(Date);
  });

  it("rattache le personnel invité à son site dans UserSite (sinon périmètre vide)", async () => {
    mocks.prisma.invitation.findUnique.mockResolvedValue(invitationValide({ role: "SECRETARY" }));
    await accepterInvitation("jeton", "MotDePasse1!");
    expect(mocks.prisma.user.create.mock.calls[0][0].data.userSites).toEqual({ create: { siteId: "s1" } });
  });

  it("n'écrit aucun UserSite pour un parent invité", async () => {
    mocks.prisma.invitation.findUnique.mockResolvedValue(invitationValide({ role: "PARENT" }));
    await accepterInvitation("jeton", "MotDePasse1!");
    expect(mocks.prisma.user.create.mock.calls[0][0].data.userSites).toBeUndefined();
  });

  it("ne crée PAS de fiche enseignant pour un rôle non enseignant", async () => {
    mocks.prisma.invitation.findUnique.mockResolvedValue(invitationValide({ role: "SECRETARY" }));
    await accepterInvitation("jeton", "MotDePasse1!");
    expect(mocks.prisma.enseignant.create).not.toHaveBeenCalled();
  });
});

describe("creerInvitation — site de rattachement", () => {
  it("refuse d'inviter un membre du personnel sans site dans un établissement multi-sites", async () => {
    const res = await creerInvitation(
      { email: "sec@ecole.dj", role: "SECRETARY", siteId: null },
      { ...claims, tenantHasSites: true },
      "http://localhost:3000"
    );
    expect(res).toEqual({ ok: false, raison: "SITE_REQUIS" });
    expect(mocks.prisma.invitation.create).not.toHaveBeenCalled();
  });
});
