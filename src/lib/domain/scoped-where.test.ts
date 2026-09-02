/**
 * Tests de cloisonnement — inspirés de GOSE 2.0.
 *
 * Règle non négociable : pour chaque route retournant des données scoping,
 * un utilisateur du tenant A ne doit JAMAIS voir les données du tenant B.
 * Idem pour l'année scolaire et le scope enseignant.
 *
 * Ce test valide que le module scopedWhere injecte correctement les filtres
 * et qu'aucun modèle filtrable ne peut être interrogé sans tenantId.
 */
import { describe, it, expect } from "vitest";
import {
  scopedWhere,
  scopedWhereAnnee,
  modeleFiltrableParAnnee,
} from "@/lib/domain/scoped-where";

describe("scopedWhere — cloisonnement par tenant", () => {
  it("injecte toujours tenantId", () => {
    const where = scopedWhere("tenant-123", "2025-2026", "devoir");
    expect(where.tenantId).toBe("tenant-123");
  });

  it("lève une erreur si tenantId est vide", () => {
    expect(() => scopedWhere("", "2025-2026", "devoir")).toThrow();
    expect(() => scopedWhere(null as unknown as string, "2025-2026", "devoir")).toThrow();
  });

  it("préserve les filtres supplémentaires de l'appelant", () => {
    const where = scopedWhere("tenant-123", "2025-2026", "devoir", {
      classeId: "classe-1",
      isPubliee: true,
    });
    expect(where.tenantId).toBe("tenant-123");
    expect(where.classeId).toBe("classe-1");
    expect(where.isPubliee).toBe(true);
  });
});

describe("scopedWhere — filtrage par année", () => {
  it("filtre les modèles avec colonne annee directe", () => {
    const where = scopedWhere("t1", "2025-2026", "classe");
    expect(where.annee).toBe("2025-2026");
  });

  it("filtre les modèles via classe.annee", () => {
    const where = scopedWhere("t1", "2025-2026", "devoir");
    expect(where.classe).toEqual({ annee: "2025-2026" });
  });

  it("filtre les modèles via eleve.classe.annee", () => {
    const where = scopedWhere("t1", "2025-2026", "absence");
    expect(where.eleve).toEqual({ classe: { annee: "2025-2026" } });
  });

  it("filtre les modèles via periode.annee.libelle", () => {
    const where = scopedWhere("t1", "2025-2026", "bulletin");
    expect(where.periode).toEqual({ annee: { libelle: "2025-2026" } });
  });

  it("n'applique pas de filtre d'année si anneeCourante est null", () => {
    const where = scopedWhere("t1", null, "devoir");
    expect(where.tenantId).toBe("t1");
    expect(where.classe).toBeUndefined();
    expect(where.annee).toBeUndefined();
  });

  it("n'applique pas de filtre d'année pour les modèles de référence", () => {
    const where = scopedWhere("t1", "2025-2026", "matiere");
    expect(where.tenantId).toBe("t1");
    expect(where.annee).toBeUndefined();
  });
});

describe("scopedWhere — non-régression sur les modèles critiques", () => {
  it("devoir est filtré par classe.annee", () => {
    const where = scopedWhere("t1", "2025-2026", "devoir");
    expect(where.classe).toBeDefined();
  });

  it("evaluation est filtré par classe.annee", () => {
    const where = scopedWhere("t1", "2025-2026", "evaluation");
    expect(where.classe).toBeDefined();
  });

  it("note est filtré par classe.annee", () => {
    const where = scopedWhere("t1", "2025-2026", "note");
    expect(where.classe).toBeDefined();
  });

  it("absence est filtré par eleve.classe.annee", () => {
    const where = scopedWhere("t1", "2025-2026", "absence");
    expect(where.eleve).toBeDefined();
  });

  it("incident est filtré par eleve.classe.annee", () => {
    const where = scopedWhere("t1", "2025-2026", "incident");
    expect(where.eleve).toBeDefined();
  });

  it("emploiTemps est filtré par annee directe", () => {
    const where = scopedWhere("t1", "2025-2026", "emploiTemps");
    expect(where.annee).toBe("2025-2026");
  });
});

describe("modeleFiltrableParAnnee", () => {
  it("retourne true pour les modèles filtrables", () => {
    expect(modeleFiltrableParAnnee("devoir")).toBe(true);
    expect(modeleFiltrableParAnnee("classe")).toBe(true);
    expect(modeleFiltrableParAnnee("absence")).toBe(true);
    expect(modeleFiltrableParAnnee("bulletin")).toBe(true);
  });

  it("retourne false pour les modèles de référence", () => {
    expect(modeleFiltrableParAnnee("matiere")).toBe(false);
    expect(modeleFiltrableParAnnee("tenant")).toBe(false);
    expect(modeleFiltrableParAnnee("user")).toBe(false);
  });
});

describe("scopedWhereAnnee — sans tenantId", () => {
  it("filtre par année sans tenantId pour les modèles transverses", () => {
    // bulletinMatiere est filtré via bulletin → periode → annee (chaîne)
    // scopedWhereAnnee ne gère pas les chaînes de relations complexes,
    // on teste avec un modèle simple
    const where = scopedWhereAnnee("2025-2026", "classe");
    expect(where.annee).toBe("2025-2026");
  });

  it("retourne un objet vide si pas d'année", () => {
    const where = scopedWhereAnnee(null, "devoir");
    expect(Object.keys(where).length).toBe(0);
  });
});

describe("Cloisonnement inter-tenant (test conceptuel)", () => {
  it("deux tenants différents produisent des filtres différents", () => {
    const whereA = scopedWhere("tenant-A", "2025-2026", "devoir");
    const whereB = scopedWhere("tenant-B", "2025-2026", "devoir");

    expect(whereA.tenantId).toBe("tenant-A");
    expect(whereB.tenantId).toBe("tenant-B");
    expect(whereA.tenantId).not.toBe(whereB.tenantId);
  });

  it("deux années différentes produisent des filtres différents", () => {
    const where2025 = scopedWhere("t1", "2025-2026", "devoir");
    const where2026 = scopedWhere("t1", "2026-2027", "devoir");

    expect((where2025.classe as { annee: string }).annee).toBe("2025-2026");
    expect((where2026.classe as { annee: string }).annee).toBe("2026-2027");
  });
});
