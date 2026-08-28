import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks des dépendances externes ---

vi.mock("@/lib/prisma", () => ({
  default: {
    invitationReinscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    eleve: { update: vi.fn() },
    campagneReinscription: { update: vi.fn() },
    $transaction: vi.fn((args: unknown[]) => Promise.all(args)),
  },
}));

import prisma from "@/lib/prisma";

const mockPrisma = prisma as unknown as {
  invitationReinscription: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
  eleve: { update: ReturnType<typeof vi.fn> };
  campagneReinscription: { update: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

function req(body?: unknown) {
  return {
    url: "http://localhost/api/reinscription/confirm",
    json: () => Promise.resolve(body),
  } as unknown as import("next/server").NextRequest;
}

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/reinscription/confirm", () => {
  // ── Cas nominaux ──────────────────────────────────────────────

  it("confirme la réinscription quand le parent accepte", async () => {
    mockPrisma.invitationReinscription.findUnique.mockResolvedValue({
      id: "inv-1",
      statut: "INVITE",
      tenantId: "t1",
      eleveId: "ele-1",
      campagneId: "camp-1",
      campagne: { statut: "OUVERTE" },
    });
    mockPrisma.$transaction.mockResolvedValue([
      { id: "inv-1", statut: "CONFIRME" },
      { id: "ele-1", statut: "REINSCRIT" },
    ]);
    mockPrisma.invitationReinscription.groupBy.mockResolvedValue([
      { statut: "CONFIRME", _count: 5 },
      { statut: "REFUSE", _count: 2 },
      { statut: "SANS_REPONSE", _count: 3 },
    ]);
    mockPrisma.campagneReinscription.update.mockResolvedValue({});

    const res = await POST(req({ invitationId: "inv-1", confirme: true }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.statut).toBe("CONFIRME");
    expect(data.message).toContain("confirmée");

    // L'invitation et l'élève sont mis à jour en transaction
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.invitationReinscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1", tenantId: "t1" },
        data: expect.objectContaining({ statut: "CONFIRME" }),
      })
    );
    expect(mockPrisma.eleve.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ele-1", tenantId: "t1" },
        data: { statut: "REINSCRIT" },
      })
    );

    // Les compteurs de campagne sont recalculés
    expect(mockPrisma.campagneReinscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "camp-1", tenantId: "t1" },
        data: { nbReinscrits: 5, nbNonReinscrits: 5 },
      })
    );
  });

  it("refuse la réinscription quand le parent décline", async () => {
    mockPrisma.invitationReinscription.findUnique.mockResolvedValue({
      id: "inv-2",
      statut: "SANS_REPONSE",
      tenantId: "t1",
      eleveId: "ele-2",
      campagneId: "camp-1",
      campagne: { statut: "OUVERTE" },
    });
    mockPrisma.$transaction.mockResolvedValue([
      { id: "inv-2", statut: "REFUSE" },
      { id: "ele-2", statut: "NON_REINSCRIT" },
    ]);
    mockPrisma.invitationReinscription.groupBy.mockResolvedValue([
      { statut: "CONFIRME", _count: 4 },
      { statut: "REFUSE", _count: 1 },
    ]);
    mockPrisma.campagneReinscription.update.mockResolvedValue({});

    const res = await POST(req({ invitationId: "inv-2", confirme: false }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.statut).toBe("REFUSE");
    expect(data.message).toContain("refusée");

    expect(mockPrisma.invitationReinscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statut: "REFUSE" }),
      })
    );
    expect(mockPrisma.eleve.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { statut: "NON_REINSCRIT" },
      })
    );
  });

  // ── Cas d'erreur ──────────────────────────────────────────────

  it("renvoie DONNEES_INVALIDES si invitationId manque", async () => {
    const res = await POST(req({ confirme: true }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("DONNEES_INVALIDES");
  });

  it("renvoie DONNEES_INVALIDES si confirme n'est pas un booléen", async () => {
    const res = await POST(req({ invitationId: "inv-1", confirme: "yes" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("DONNEES_INVALIDES");
  });

  it("renvoie DONNEES_INVALIDES si le body est null", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("DONNEES_INVALIDES");
  });

  it("renvoie INVITATION_INTROUVABLE si l'invitation n'existe pas", async () => {
    mockPrisma.invitationReinscription.findUnique.mockResolvedValue(null);

    const res = await POST(req({ invitationId: "inexistant", confirme: true }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.code).toBe("INVITATION_INTROUVABLE");
  });

  it("renvoie DEJA_REPONDU si l'invitation a déjà été confirmée", async () => {
    mockPrisma.invitationReinscription.findUnique.mockResolvedValue({
      id: "inv-1",
      statut: "CONFIRME",
      tenantId: "t1",
      eleveId: "ele-1",
      campagneId: "camp-1",
      campagne: { statut: "OUVERTE" },
    });

    const res = await POST(req({ invitationId: "inv-1", confirme: true }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("DEJA_REPONDU");
    expect(data.detail).toContain("CONFIRME");
  });

  it("renvoie DEJA_REPONDU si l'invitation a déjà été refusée", async () => {
    mockPrisma.invitationReinscription.findUnique.mockResolvedValue({
      id: "inv-1",
      statut: "REFUSE",
      tenantId: "t1",
      eleveId: "ele-1",
      campagneId: "camp-1",
      campagne: { statut: "OUVERTE" },
    });

    const res = await POST(req({ invitationId: "inv-1", confirme: false }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("DEJA_REPONDU");
  });

  it("renvoie CAMPAGNE_FERMEE si la campagne est TERMINEE", async () => {
    mockPrisma.invitationReinscription.findUnique.mockResolvedValue({
      id: "inv-1",
      statut: "INVITE",
      tenantId: "t1",
      eleveId: "ele-1",
      campagneId: "camp-1",
      campagne: { statut: "TERMINEE" },
    });

    const res = await POST(req({ invitationId: "inv-1", confirme: true }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("CAMPAGNE_FERMEE");
  });

  it("renvoie CAMPAGNE_FERMEE si la campagne est ANNULEE", async () => {
    mockPrisma.invitationReinscription.findUnique.mockResolvedValue({
      id: "inv-1",
      statut: "INVITE",
      tenantId: "t1",
      eleveId: "ele-1",
      campagneId: "camp-1",
      campagne: { statut: "ANNULEE" },
    });

    const res = await POST(req({ invitationId: "inv-1", confirme: true }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("CAMPAGNE_FERMEE");
  });
});
