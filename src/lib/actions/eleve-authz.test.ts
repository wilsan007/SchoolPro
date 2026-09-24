/**
 * Autorisation des Server Actions d'écriture sur un élève.
 * ============================================================
 *
 * CE QUI ÉTAIT CASSÉ
 *
 * `createEleve` et `updateEleve` ne vérifiaient que l'authentification
 * (`session.user.tenantId`). La route `/eleves/nouveau` était d'autre part
 * régie par `eleves:read`, hérité du parent `/eleves` : masquer le bouton
 * « Nouvel élève » dans l'interface ne protégeait donc rien, un rôle en lecture
 * seule (TEACHER, NURSE, CAISSIER, INSPECTOR…) appelait l'action et créait ou
 * modifiait un élève.
 *
 * CE QUE CES TESTS VERROUILLENT
 *
 *  1. L'action exige `eleves:write` **avant** toute écriture : aucune requête
 *     Prisma ne doit partir quand la permission est refusée.
 *  2. Le refus est un échec explicite, jamais un succès silencieux.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { eleveMock } = vi.hoisted(() => ({
  eleveMock: {
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    eleve: eleveMock,
    $transaction: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/annee-scolaire", () => ({
  getAnneeCouranteLibelle: vi.fn(async () => "2025-2026"),
}));
vi.mock("@/lib/site-filter", () => ({
  siteFilterForModel: () => ({}),
  requireSiteIdForCreate: () => null,
}));
vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: () => ({}),
  requireSiteIdForCreate: () => null,
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(), auditFire: vi.fn() }));
vi.mock("@/lib/eleve-identity-server", () => ({
  trouverDoublon: vi.fn(async () => null),
  resoudreIdentiteKey: vi.fn(async () => "cle"),
  cleDepuisFiche: vi.fn(() => "cle"),
}));

import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { createEleve, updateEleve } from "./eleve";

const sessionValide = {
  user: { id: "u1", tenantId: "t1", role: "TEACHER", email: "t@t.test" },
};

const refus = { status: 403 } as unknown as import("next/server").NextResponse;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(sessionValide as never);
});

describe("createEleve — autorisation", () => {
  it("exige la permission eleves:write", async () => {
    vi.mocked(checkPermission).mockResolvedValue(refus);
    await expect(createEleve({} as never)).rejects.toThrow(/Permissions insuffisantes/);
    expect(checkPermission).toHaveBeenCalledWith("TEACHER", "eleves:write");
  });

  it("n'atteint jamais la base quand la permission est refusée", async () => {
    vi.mocked(checkPermission).mockResolvedValue(refus);
    await expect(createEleve({} as never)).rejects.toThrow();
    expect(eleveMock.create).not.toHaveBeenCalled();
    expect(eleveMock.count).not.toHaveBeenCalled();
    expect(eleveMock.findUnique).not.toHaveBeenCalled();
  });
});

describe("updateEleve — autorisation", () => {
  it("exige la permission eleves:write", async () => {
    vi.mocked(checkPermission).mockResolvedValue(refus);
    await expect(updateEleve("eleve-1", {} as never)).rejects.toThrow(/Permissions insuffisantes/);
    expect(checkPermission).toHaveBeenCalledWith("TEACHER", "eleves:write");
  });

  it("n'atteint jamais la base quand la permission est refusée", async () => {
    vi.mocked(checkPermission).mockResolvedValue(refus);
    await expect(updateEleve("eleve-1", {} as never)).rejects.toThrow();
    expect(eleveMock.update).not.toHaveBeenCalled();
    expect(eleveMock.findFirst).not.toHaveBeenCalled();
  });
});

describe("Écritures — sans session", () => {
  it("refuse un visiteur non authentifié", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(createEleve({} as never)).rejects.toThrow(/Non autorisé/);
    expect(checkPermission).not.toHaveBeenCalled();
  });
});
