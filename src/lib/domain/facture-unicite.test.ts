import { describe, it, expect } from "vitest";
import {
  canCreateFacture,
  batchValide,
  cleUnicite,
  TYPES_MENSUELS,
  TYPES_GLOBAUX,
  STATUTS_BLOQUANTS,
  EXCLUSIONS,
  type FactureExistante,
} from "./facture-unicite";

// ============================================================
// Tests du domaine : règles d'unicité des factures
// ============================================================
//
// Ces tests valident la logique métier PURE, sans Prisma.
// On teste :
//   - canCreateFacture (unicité par type + mois, statuts bloquants)
//   - batchValide (exclusivité inscription/renouvellement)
//   - cleUnicite (construction des clés de verrouillage UI)
//   - Les ensembles de types (mensuels vs globaux)

describe("canCreateFacture", () => {
  it("autorise la création quand aucune facture existante", () => {
    const result = canCreateFacture("MENSUALITE", "2026-01", []);
    expect(result.autorise).toBe(true);
    expect(result.factureExistante).toBeUndefined();
  });

  it("autorise la création quand la facture existante est ANNULÉE", () => {
    const existantes: FactureExistante[] = [
      { id: "1", numero: "FAC-2026-00001", type: "MENSUALITE", statut: "ANNULEE", mois: "2026-01" },
    ];
    const result = canCreateFacture("MENSUALITE", "2026-01", existantes);
    expect(result.autorise).toBe(true);
  });

  it("bloque la création d'une mensualité EN_ATTENTE pour le même mois", () => {
    const existantes: FactureExistante[] = [
      { id: "1", numero: "FAC-2026-00001", type: "MENSUALITE", statut: "EN_ATTENTE", mois: "2026-01" },
    ];
    const result = canCreateFacture("MENSUALITE", "2026-01", existantes);
    expect(result.autorise).toBe(false);
    expect(result.raison).toBe("existe_deja");
    expect(result.factureExistante?.numero).toBe("FAC-2026-00001");
  });

  it("bloque la création d'une mensualité PAYEE avec raison 'deja_payee'", () => {
    const existantes: FactureExistante[] = [
      { id: "1", numero: "FAC-2026-00001", type: "MENSUALITE", statut: "PAYEE", mois: "2026-01" },
    ];
    const result = canCreateFacture("MENSUALITE", "2026-01", existantes);
    expect(result.autorise).toBe(false);
    expect(result.raison).toBe("deja_payee");
  });

  it("autorise une mensualité pour un mois différent", () => {
    const existantes: FactureExistante[] = [
      { id: "1", numero: "FAC-2026-00001", type: "MENSUALITE", statut: "EN_ATTENTE", mois: "2026-01" },
    ];
    const result = canCreateFacture("MENSUALITE", "2026-02", existantes);
    expect(result.autorise).toBe(true);
  });

  it("autorise la cantine pour le même mois si seule la mensualité existe", () => {
    const existantes: FactureExistante[] = [
      { id: "1", numero: "FAC-2026-00001", type: "MENSUALITE", statut: "EN_ATTENTE", mois: "2026-01" },
    ];
    const result = canCreateFacture("CANTINE", "2026-01", existantes);
    expect(result.autorise).toBe(true);
  });

  it("bloque la cantine pour le même mois si une cantine EN_ATTENTE existe", () => {
    const existantes: FactureExistante[] = [
      { id: "1", numero: "FAC-2026-00001", type: "CANTINE", statut: "EN_ATTENTE", mois: "2026-01" },
    ];
    const result = canCreateFacture("CANTINE", "2026-01", existantes);
    expect(result.autorise).toBe(false);
    expect(result.raison).toBe("existe_deja");
  });

  it("bloque l'inscription si une inscription EN_RETARD existe (type global)", () => {
    const existantes: FactureExistante[] = [
      { id: "1", numero: "FAC-2026-00001", type: "INSCRIPTION", statut: "EN_RETARD", mois: null },
    ];
    const result = canCreateFacture("INSCRIPTION", null, existantes);
    expect(result.autorise).toBe(false);
    expect(result.raison).toBe("existe_deja");
  });

  it("autorise l'inscription si l'existante est ANNULÉE (type global)", () => {
    const existantes: FactureExistante[] = [
      { id: "1", numero: "FAC-2026-00001", type: "INSCRIPTION", statut: "ANNULEE", mois: null },
    ];
    const result = canCreateFacture("INSCRIPTION", null, existantes);
    expect(result.autorise).toBe(true);
  });

  it("autorise le renouvellement même si une inscription existe", () => {
    const existantes: FactureExistante[] = [
      { id: "1", numero: "FAC-2026-00001", type: "INSCRIPTION", statut: "PAYEE", mois: null },
    ];
    const result = canCreateFacture("RENOUVELLEMENT", null, existantes);
    expect(result.autorise).toBe(true);
  });

  it("ignore le mois pour les types globaux (INSCRIPTION)", () => {
    const existantes: FactureExistante[] = [
      { id: "1", numero: "FAC-2026-00001", type: "INSCRIPTION", statut: "EN_ATTENTE", mois: "2026-01" },
    ];
    // Même si on passe un mois différent, ça bloque car INSCRIPTION est global
    const result = canCreateFacture("INSCRIPTION", "2026-09", existantes);
    expect(result.autorise).toBe(false);
  });
});

describe("batchValide", () => {
  it("valide un batch avec un seul type", () => {
    expect(batchValide(["MENSUALITE"])).toBe(true);
    expect(batchValide(["INSCRIPTION"])).toBe(true);
  });

  it("valide un batch avec mensualité + cantine + transport (pas d'exclusion)", () => {
    expect(batchValide(["MENSUALITE", "CANTINE", "TRANSPORT"])).toBe(true);
  });

  it("rejette un batch avec INSCRIPTION + RENOUVELLEMENT (exclusion mutuelle)", () => {
    expect(batchValide(["INSCRIPTION", "RENOUVELLEMENT"])).toBe(false);
    expect(batchValide(["RENOUVELLEMENT", "INSCRIPTION"])).toBe(false);
  });

  it("valide un batch avec INSCRIPTION + MENSUALITE (pas d'exclusion)", () => {
    expect(batchValide(["INSCRIPTION", "MENSUALITE"])).toBe(true);
  });

  it("valide un batch vide", () => {
    expect(batchValide([])).toBe(true);
  });
});

describe("cleUnicite", () => {
  it("construit la clé avec le mois pour les types mensuels", () => {
    expect(cleUnicite("MENSUALITE", "2026-01")).toBe("MENSUALITE|2026-01");
    expect(cleUnicite("CANTINE", "2026-03")).toBe("CANTINE|2026-03");
    expect(cleUnicite("TRANSPORT", "2026-09")).toBe("TRANSPORT|2026-09");
  });

  it("construit la clé sans mois pour les types globaux", () => {
    expect(cleUnicite("INSCRIPTION", null)).toBe("INSCRIPTION");
    expect(cleUnicite("RENOUVELLEMENT", "2026-01")).toBe("RENOUVELLEMENT");
    expect(cleUnicite("LIBRE", null)).toBe("LIBRE");
  });
});

describe("Ensembles de types", () => {
  it("TYPES_MENSUELS contient MENSUALITE, CANTINE, TRANSPORT", () => {
    expect(TYPES_MENSUELS.has("MENSUALITE")).toBe(true);
    expect(TYPES_MENSUELS.has("CANTINE")).toBe(true);
    expect(TYPES_MENSUELS.has("TRANSPORT")).toBe(true);
    expect(TYPES_MENSUELS.has("INSCRIPTION")).toBe(false);
  });

  it("TYPES_GLOBAUX contient INSCRIPTION, RENOUVELLEMENT, LIBRE", () => {
    expect(TYPES_GLOBAUX.has("INSCRIPTION")).toBe(true);
    expect(TYPES_GLOBAUX.has("RENOUVELLEMENT")).toBe(true);
    expect(TYPES_GLOBAUX.has("LIBRE")).toBe(true);
    expect(TYPES_GLOBAUX.has("MENSUALITE")).toBe(false);
  });

  it("STATUTS_BLOQUANTS contient EN_ATTENTE, PAYEE, EN_RETARD (pas ANNULEE)", () => {
    expect(STATUTS_BLOQUANTS.has("EN_ATTENTE")).toBe(true);
    expect(STATUTS_BLOQUANTS.has("PAYEE")).toBe(true);
    expect(STATUTS_BLOQUANTS.has("EN_RETARD")).toBe(true);
    expect(STATUTS_BLOQUANTS.has("ANNULEE")).toBe(false);
  });

  it("EXCLUSIONS : INSCRIPTION ↔ RENOUVELLEMENT", () => {
    expect(EXCLUSIONS.INSCRIPTION).toBe("RENOUVELLEMENT");
    expect(EXCLUSIONS.RENOUVELLEMENT).toBe("INSCRIPTION");
    expect(EXCLUSIONS.MENSUALITE).toBeUndefined();
  });
});
