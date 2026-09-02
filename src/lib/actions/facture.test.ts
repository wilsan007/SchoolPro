import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const facture = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  };
  const paiement = {
    create: vi.fn(),
    count: vi.fn(),
  };
  const eleve = {
    findUnique: vi.fn(),
  };
  const echeancier = {
    findFirst: vi.fn().mockResolvedValue(null),
  };
  const echeancePaiement = {
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  };
  return {
    default: {
      facture,
      paiement,
      eleve,
      echeancier,
      echeancePaiement,
      // `$transaction` exécute la callback en lui passant un objet `tx`
      // qui partage les mêmes mocks — les assertions `toHaveBeenCalledWith`
      // restent ainsi valables.
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ facture, paiement, eleve, echeancier, echeancePaiement })
      ),
    },
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  // Les actions invalident aussi le cache du tableau de bord.
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/annee-scolaire", () => ({
  anneeActiveId: vi.fn().mockResolvedValue(null),
  anneeActive: vi.fn().mockResolvedValue(null),
  getAnneeCourante: vi.fn().mockResolvedValue(null),
  getAnneeCouranteLibelle: vi.fn().mockResolvedValue(null),
  getContexteAnnees: vi.fn().mockResolvedValue({
    phase: "normale",
    anneeActive: null,
    anneeEcoulee: null,
    anneeAVenir: null,
    joursAvantRentree: null,
  }),
}));

vi.mock("@/lib/demo-now", () => ({
  getDemoNow: vi.fn().mockResolvedValue(new Date()),
  getDemoDate: vi.fn().mockResolvedValue(null),
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
    count: ReturnType<typeof vi.fn>;
  };
  eleve: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  echeancier: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  echeancePaiement: {
    findFirst: ReturnType<typeof vi.fn>;
    findUniqueOrThrow: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

describe("facture actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // role: TENANT_ADMIN → périmètre tenant entier (siteFilterForModel renvoie
    // {}) : les assertions ci-dessous vérifient le `where` sans avoir à
    // reproduire la résolution de périmètre par site à chaque cas.
    mockAuth.mockResolvedValue({
      user: { id: "user1", tenantId: "tenant1", name: "Admin", role: "TENANT_ADMIN" },
    });
    // Élève rattaché à un site par défaut : les tests qui vérifient le
    // rattachement le redéfinissent explicitement.
    mockPrisma.eleve.findUnique.mockResolvedValue({ siteId: "site1" });
    // getExistingFacturesForEleve : pas de factures existantes par défaut
    mockPrisma.facture.findMany.mockResolvedValue([]);
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
        createFacture({ eleveId: "e1", libelle: "Test", montant: 1000, devise: "DJF", type: "MENSUALITE" })
      ).rejects.toThrow("Non autorisé");
    });

    it("throws on invalid data (empty eleveId)", async () => {
      await expect(
        createFacture({ eleveId: "", libelle: "Test", montant: 1000, devise: "DJF", type: "MENSUALITE" })
      ).rejects.toThrow();
    });

    it("throws on invalid data (zero montant)", async () => {
      await expect(
        createFacture({ eleveId: "e1", libelle: "Test", montant: 0, devise: "DJF", type: "MENSUALITE" })
      ).rejects.toThrow();
    });

    it("throws on invalid data (empty libelle)", async () => {
      await expect(
        createFacture({ eleveId: "e1", libelle: "", montant: 1000, devise: "DJF", type: "MENSUALITE" })
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
        type: "MENSUALITE",
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
      await createFacture({ eleveId: "e1", libelle: "Test", montant: 1000, devise: "DJF", type: "MENSUALITE" });
      const call = mockPrisma.facture.create.mock.calls[0][0];
      expect(call.data.numero).toMatch(/^FAC-\d{4}-00001$/);
    });
  });

  describe("enregistrerPaiement", () => {
    it("throws when not authorized", async () => {
      mockAuth.mockResolvedValue(null);
      await expect(
        enregistrerPaiement("f1", { montant: 1000, methode: "waffi" })
      ).rejects.toThrow("Non autorisé");
    });

    it("throws when invoice id is empty", async () => {
      await expect(
        enregistrerPaiement("", { montant: 1000, methode: "waffi" })
      ).rejects.toThrow("Numéro de facture requis");
    });

    it("throws on invalid data (zero montant)", async () => {
      await expect(
        enregistrerPaiement("f1", { montant: 0, methode: "waffi" })
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
        enregistrerPaiement("f1", { montant: 1000, methode: "waffi" })
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
        methode: "waffi",
        reference: "REF123",
      });
      expect(result).toEqual({ success: true, id: "p1" });
      expect(mockPrisma.paiement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            factureId: "f1",
            montant: 10000,
            methode: "waffi",
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
      await enregistrerPaiement("f1", { montant: 10000, methode: "cac_pay" });
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
      await enregistrerPaiement("f1", { montant: 10000, methode: "dahab_plus" });
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
      await enregistrerPaiement("f1", { montant: 1000, methode: "saba_pay" });
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
      mockPrisma.facture.findFirst.mockResolvedValue({ id: "f1", statut: "EN_ATTENTE" });
      mockPrisma.paiement.count.mockResolvedValue(0);
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

    it("throws when invoice is already paid", async () => {
      mockPrisma.facture.findFirst.mockResolvedValue({ id: "f1", statut: "PAYEE" });
      await expect(annulerFacture("f1")).rejects.toThrow("Impossible d'annuler");
    });

    it("throws when invoice has payments", async () => {
      mockPrisma.facture.findFirst.mockResolvedValue({ id: "f1", statut: "EN_ATTENTE" });
      mockPrisma.paiement.count.mockResolvedValue(1);
      await expect(annulerFacture("f1")).rejects.toThrow("déjà des paiements");
    });
  });
});
