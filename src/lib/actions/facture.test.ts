import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    facture: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    paiement: {
      create: vi.fn(),
    },
    // `createFacture` lit le site de l'élève pour rattacher la facture au bon
    // site — sans ce délégué, l'action échoue avant toute assertion.
    eleve: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  // Les actions invalident aussi le cache du tableau de bord.
  revalidateTag: vi.fn(),
}));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  getFacturesForTenant,
  getFactureForDetail,
  createFacture,
  enregistrerPaiement,
  annulerFacture,
} from "@/lib/actions/facture";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  facture: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  paiement: {
    create: ReturnType<typeof vi.fn>;
  };
  eleve: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

describe("facture actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "user1", tenantId: "tenant1", name: "Admin" },
    });
    // Élève rattaché à un site par défaut : les tests qui vérifient le
    // rattachement le redéfinissent explicitement.
    mockPrisma.eleve.findUnique.mockResolvedValue({ siteId: "site1" });
  });

  describe("getFacturesForTenant", () => {
    it("returns empty array when no session", async () => {
      mockAuth.mockResolvedValue(null);
      const result = await getFacturesForTenant();
      expect(result).toEqual([]);
    });

    it("returns factures with includes", async () => {
      const mockFactures = [
        { id: "f1", numero: "FAC-2025-00001", montant: 50000 },
      ];
      mockPrisma.facture.findMany.mockResolvedValue(mockFactures);
      const result = await getFacturesForTenant();
      expect(result).toEqual(mockFactures);
      expect(mockPrisma.facture.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "tenant1" }),
        })
      );
    });

    it("applies statut filter", async () => {
      mockPrisma.facture.findMany.mockResolvedValue([]);
      await getFacturesForTenant({ statut: "PAYEE" });
      expect(mockPrisma.facture.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ statut: "PAYEE" }),
        })
      );
    });

    it("applies eleveId filter", async () => {
      mockPrisma.facture.findMany.mockResolvedValue([]);
      await getFacturesForTenant({ eleveId: "eleve1" });
      expect(mockPrisma.facture.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ eleveId: "eleve1" }),
        })
      );
    });

    it("ignores ALL statut filter", async () => {
      mockPrisma.facture.findMany.mockResolvedValue([]);
      await getFacturesForTenant({ statut: "ALL" });
      const call = mockPrisma.facture.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty("statut");
    });
  });

  describe("getFactureForDetail", () => {
    it("returns null when no session", async () => {
      mockAuth.mockResolvedValue(null);
      const result = await getFactureForDetail("f1");
      expect(result).toBeNull();
    });

    it("returns facture with includes", async () => {
      const mockFacture = { id: "f1", montant: 50000, paiements: [] };
      mockPrisma.facture.findFirst.mockResolvedValue(mockFacture);
      const result = await getFactureForDetail("f1");
      expect(result).toEqual(mockFacture);
      expect(mockPrisma.facture.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "f1", tenantId: "tenant1" },
        })
      );
    });
  });

  describe("createFacture", () => {
    it("throws when not authorized", async () => {
      mockAuth.mockResolvedValue(null);
      await expect(
        createFacture({ eleveId: "e1", libelle: "Test", montant: 1000, devise: "DJF" })
      ).rejects.toThrow("Non autorisé");
    });

    it("throws on invalid data (empty eleveId)", async () => {
      await expect(
        createFacture({ eleveId: "", libelle: "Test", montant: 1000, devise: "DJF" })
      ).rejects.toThrow();
    });

    it("throws on invalid data (zero montant)", async () => {
      await expect(
        createFacture({ eleveId: "e1", libelle: "Test", montant: 0, devise: "DJF" })
      ).rejects.toThrow();
    });

    it("throws on invalid data (empty libelle)", async () => {
      await expect(
        createFacture({ eleveId: "e1", libelle: "", montant: 1000, devise: "DJF" })
      ).rejects.toThrow();
    });

    it("creates facture with correct data and returns success", async () => {
      mockPrisma.facture.count.mockResolvedValue(5);
      mockPrisma.facture.create.mockResolvedValue({ id: "new-facture-id" });
      const result = await createFacture({
        eleveId: "e1",
        libelle: "Scolarité 2025",
        montant: 50000,
        devise: "DJF",
        echeance: "2025-12-31",
      });
      expect(result).toEqual({ success: true, id: "new-facture-id" });
      expect(mockPrisma.facture.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "tenant1",
            eleveId: "e1",
            libelle: "Scolarité 2025",
            montant: 50000,
            statut: "EN_ATTENTE",
            createdById: "user1",
          }),
        })
      );
    });

    it("generates correct invoice number", async () => {
      mockPrisma.facture.count.mockResolvedValue(0);
      mockPrisma.facture.create.mockResolvedValue({ id: "f1" });
      await createFacture({ eleveId: "e1", libelle: "Test", montant: 1000, devise: "DJF" });
      const call = mockPrisma.facture.create.mock.calls[0][0];
      expect(call.data.numero).toMatch(/^FAC-\d{4}-00001$/);
    });
  });

  describe("enregistrerPaiement", () => {
    it("throws when not authorized", async () => {
      mockAuth.mockResolvedValue(null);
      await expect(
        enregistrerPaiement("f1", { montant: 1000, methode: "WAFFI" })
      ).rejects.toThrow("Non autorisé");
    });

    it("throws on invalid data (zero montant)", async () => {
      await expect(
        enregistrerPaiement("f1", { montant: 0, methode: "WAFFI" })
      ).rejects.toThrow();
    });

    it("throws on invalid data (empty methode)", async () => {
      await expect(
        enregistrerPaiement("f1", { montant: 1000, methode: "" })
      ).rejects.toThrow();
    });

    it("throws when facture not found", async () => {
      mockPrisma.facture.findFirst.mockResolvedValue(null);
      await expect(
        enregistrerPaiement("f1", { montant: 1000, methode: "WAFFI" })
      ).rejects.toThrow("Facture non trouvée");
    });

    it("creates payment and updates statut to PAYEE when fully paid", async () => {
      mockPrisma.facture.findFirst.mockResolvedValue({
        id: "f1",
        montant: 50000,
        statut: "EN_ATTENTE",
        echeance: null,
        paiements: [{ montant: 40000 }],
      });
      mockPrisma.paiement.create.mockResolvedValue({ id: "p1" });
      const result = await enregistrerPaiement("f1", {
        montant: 10000,
        methode: "WAFFI",
        reference: "REF123",
      });
      expect(result).toEqual({ success: true, id: "p1" });
      expect(mockPrisma.paiement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            factureId: "f1",
            montant: 10000,
            methode: "WAFFI",
            reference: "REF123",
            enregistreParId: "user1",
          }),
        })
      );
      expect(mockPrisma.facture.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statut: "PAYEE" },
        })
      );
    });

    it("keeps statut when partially paid", async () => {
      mockPrisma.facture.findFirst.mockResolvedValue({
        id: "f1",
        montant: 50000,
        statut: "EN_ATTENTE",
        echeance: null,
        paiements: [],
      });
      mockPrisma.paiement.create.mockResolvedValue({ id: "p2" });
      await enregistrerPaiement("f1", { montant: 10000, methode: "CAC_PAY" });
      expect(mockPrisma.facture.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statut: "EN_ATTENTE" },
        })
      );
    });

    it("sets statut to EN_RETARD when overdue and partially paid", async () => {
      const pastDate = new Date("2020-01-01");
      mockPrisma.facture.findFirst.mockResolvedValue({
        id: "f1",
        montant: 50000,
        statut: "EN_ATTENTE",
        echeance: pastDate,
        paiements: [],
      });
      mockPrisma.paiement.create.mockResolvedValue({ id: "p3" });
      await enregistrerPaiement("f1", { montant: 10000, methode: "DAHAB_PLUS" });
      expect(mockPrisma.facture.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statut: "EN_RETARD" },
        })
      );
    });

    it("handles null reference", async () => {
      mockPrisma.facture.findFirst.mockResolvedValue({
        id: "f1",
        montant: 1000,
        statut: "EN_ATTENTE",
        echeance: null,
        paiements: [],
      });
      mockPrisma.paiement.create.mockResolvedValue({ id: "p4" });
      await enregistrerPaiement("f1", { montant: 1000, methode: "SABA_PAY" });
      const call = mockPrisma.paiement.create.mock.calls[0][0];
      expect(call.data.reference).toBeNull();
    });
  });

  describe("annulerFacture", () => {
    it("throws when not authorized", async () => {
      mockAuth.mockResolvedValue(null);
      await expect(annulerFacture("f1")).rejects.toThrow("Non autorisé");
    });

    it("throws when facture not found", async () => {
      mockPrisma.facture.findFirst.mockResolvedValue(null);
      await expect(annulerFacture("f1")).rejects.toThrow("Facture non trouvée");
    });

    it("cancels facture and returns success", async () => {
      mockPrisma.facture.findFirst.mockResolvedValue({ id: "f1" });
      mockPrisma.facture.update.mockResolvedValue({ id: "f1", statut: "ANNULEE" });
      const result = await annulerFacture("f1");
      expect(result).toEqual({ success: true });
      expect(mockPrisma.facture.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "f1" },
          data: { statut: "ANNULEE" },
        })
      );
    });
  });
});
