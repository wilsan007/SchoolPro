import { describe, it, expect } from "vitest";
import {
  cycleDuNiveau,
  choisirTarif,
  montantPourTypeFrais,
  montantMensuel,
  normaliserTypeFrais,
  type TarifLike,
} from "@/lib/domain/tarifs";

// ============================================================
// Rapprochement classe ↔ grille tarifaire — tests du domaine pur
// ============================================================

const tarif = (over: Partial<TarifLike> = {}): TarifLike => ({
  niveau: "Collège",
  siteId: null,
  annee: "2025-2026",
  mensualite: 15000,
  fraisInscription: 10000,
  fraisRenouvellement: 5000,
  fraisCantine: 6000,
  fraisTransport: 4000,
  devise: "DJF",
  nbMois: 10,
  actif: true,
  ...over,
});

describe("choisirTarif", () => {
  const collegeGlobal = tarif();
  const collegeSite1 = tarif({ siteId: "s1", mensualite: 13000 });
  const collegeSite2 = tarif({ siteId: "s2", mensualite: 12000 });
  const lyceeGlobal = tarif({ niveau: "Lycée", mensualite: 20000 });

  it("fait correspondre une classe de 6ème à la ligne « Collège » (bug d'origine)", () => {
    const choix = choisirTarif([collegeGlobal, lyceeGlobal], "s1", "6ème");
    expect(choix?.tarif.mensualite).toBe(15000);
    expect(choix?.tarif.niveau).toBe("Collège");
    expect(choix?.libelleExact).toBe(false);
  });

  it("fait correspondre « Terminale A » à la ligne « Lycée »", () => {
    const choix = choisirTarif([collegeGlobal, lyceeGlobal], "s1", "Terminale A");
    expect(choix?.tarif.mensualite).toBe(20000);
  });

  it("applique le tarif du site de l'élève avant le tarif global", () => {
    const choix = choisirTarif([collegeGlobal, collegeSite1], "s1", "6ème");
    expect(choix?.tarif.mensualite).toBe(13000);
    expect(choix?.source).toBe("SITE");
  });

  it("hérite du tarif global quand le site n'a pas de tarif propre", () => {
    const choix = choisirTarif([collegeGlobal, collegeSite1], "s3", "6ème");
    expect(choix?.tarif.mensualite).toBe(15000);
    expect(choix?.source).toBe("GLOBAL");
  });

  it("n'utilise jamais le tarif d'un autre site", () => {
    expect(choisirTarif([collegeSite2], "s1", "6ème")).toBeNull();
  });

  it("préfère la ligne au libellé exact (« 6ème ») à la ligne du cycle (« Collège »)", () => {
    const sixiemeGlobal = tarif({ niveau: "6ème", mensualite: 14000 });
    const choix = choisirTarif([collegeGlobal, sixiemeGlobal], "s1", "6ème");
    expect(choix?.tarif.mensualite).toBe(14000);
    expect(choix?.libelleExact).toBe(true);
  });

  it("ignore un tarif inactif", () => {
    const inactif = tarif({ siteId: "s1", mensualite: 1000, actif: false });
    const choix = choisirTarif([collegeGlobal, inactif], "s1", "6ème");
    expect(choix?.tarif.mensualite).toBe(15000);
    expect(choix?.source).toBe("GLOBAL");
  });

  it("renvoie null quand le cycle est inconnu ou sans tarif (on ne facture pas)", () => {
    expect(choisirTarif([collegeGlobal], "s1", "Inconnu")).toBeNull();
    expect(choisirTarif([collegeGlobal], "s1", "1")).toBeNull();
    expect(choisirTarif([lyceeGlobal], "s1", "6ème")).toBeNull();
    expect(choisirTarif([], "s1", "6ème")).toBeNull();
  });
});

// ============================================================
// Montants
// ============================================================

describe("montantPourTypeFrais", () => {
  const t = tarif({ mensualite: 15000, fraisInscription: 10000, fraisRenouvellement: 5000 });

  it("sélectionne la mensualité, l'inscription ou le renouvellement", () => {
    expect(montantPourTypeFrais(t, "MENSUALITE")).toBe(15000);
    expect(montantPourTypeFrais(t, "INSCRIPTION")).toBe(10000);
    expect(montantPourTypeFrais(t, "RENOUVELLEMENT")).toBe(5000);
  });

  it("renvoie null quand l'option n'est pas proposée par la grille", () => {
    const sansOptions = tarif({ fraisCantine: null, fraisTransport: null });
    expect(montantPourTypeFrais(sansOptions, "CANTINE")).toBeNull();
    expect(montantPourTypeFrais(sansOptions, "TRANSPORT")).toBeNull();
  });
});

describe("montantMensuel", () => {
  it("ajoute la cantine et le transport quand ils sont demandés", () => {
    const t = tarif({ mensualite: 15000, fraisCantine: 6000, fraisTransport: 4000 });
    expect(montantMensuel(t)).toBe(15000);
    expect(montantMensuel(t, { cantine: true })).toBe(21000);
    expect(montantMensuel(t, { cantine: true, transport: true })).toBe(25000);
  });

  it("ignore une option absente de la grille plutôt que d'ajouter zéro ou deviner", () => {
    const t = tarif({ mensualite: 15000, fraisCantine: null, fraisTransport: 4000 });
    expect(montantMensuel(t, { cantine: true })).toBe(15000);
    expect(montantMensuel(t, { cantine: true, transport: true })).toBe(19000);
  });
});

describe("normaliserTypeFrais", () => {
  it("accepte les 5 types et retombe sur MENSUALITE (contrat d'API historique)", () => {
    expect(normaliserTypeFrais("TRANSPORT")).toBe("TRANSPORT");
    expect(normaliserTypeFrais("inscription")).toBe("INSCRIPTION");
    expect(normaliserTypeFrais(null)).toBe("MENSUALITE");
    expect(normaliserTypeFrais("nimporte-quoi")).toBe("MENSUALITE");
  });
});

// ============================================================
// cycleDuNiveau — le rapprochement qui manquait
// ============================================================
// Ces tests figent les écritures réellement présentes chez SchoolPro :
// les CLASSES portent une année (« 6ème », « Terminale A »), la GRILLE
// tarifaire un cycle (« Collège », « Lycée »). L'ancien code comparait les
// chaînes telles quelles : aucune correspondance, donc aucune facture.
describe("cycleDuNiveau", () => {
  it("classe les années du collège et du lycée (données du seed)", () => {
    expect(cycleDuNiveau("6ème")).toBe("college");
    expect(cycleDuNiveau("5ème")).toBe("college");
    expect(cycleDuNiveau("4ème")).toBe("college");
    expect(cycleDuNiveau("3ème")).toBe("college");
    expect(cycleDuNiveau("2nde")).toBe("lycee");
    expect(cycleDuNiveau("1ère")).toBe("lycee");
    expect(cycleDuNiveau("Terminale")).toBe("lycee");
    // Libellés réellement saisis avec la section : « Terminale A ».
    expect(cycleDuNiveau("Terminale A")).toBe("lycee");
    expect(cycleDuNiveau("6ème B2")).toBe("college");
  });

  it("reconnaît les libellés de cycle utilisés par la grille tarifaire", () => {
    expect(cycleDuNiveau("Collège")).toBe("college");
    expect(cycleDuNiveau("collège")).toBe("college");
    expect(cycleDuNiveau("Lycée")).toBe("lycee");
    expect(cycleDuNiveau("Primaire")).toBe("primaire");
    expect(cycleDuNiveau("Maternelle")).toBe("maternelle");
    expect(cycleDuNiveau("Grande section")).toBe("maternelle");
  });

  it("distingue « 3ème » (collège) de « 3ème année » (primaire)", () => {
    expect(cycleDuNiveau("3ème")).toBe("college");
    expect(cycleDuNiveau("3ème année")).toBe("primaire");
    expect(cycleDuNiveau("1ère année")).toBe("primaire");
    expect(cycleDuNiveau("5ème année")).toBe("primaire");
  });

  it("tolère les écritures sans accent, en minuscules et avec préfixe", () => {
    expect(cycleDuNiveau("terminale")).toBe("lycee");
    expect(cycleDuNiveau("Tle")).toBe("lycee");
    expect(cycleDuNiveau("6eme")).toBe("college");
    expect(cycleDuNiveau("Classe de 6ème")).toBe("college");
    expect(cycleDuNiveau("niveau 1ère")).toBe("lycee");
  });

  it("renvoie null plutôt que de deviner un cycle ambigu", () => {
    // « 1 » et « 2 » nus : 1ère année du primaire OU 1ère du lycée.
    expect(cycleDuNiveau("1")).toBeNull();
    expect(cycleDuNiveau("2")).toBeNull();
  });

  it("renvoie null pour un libellé vide ou inexploitable", () => {
    expect(cycleDuNiveau(null)).toBeNull();
    expect(cycleDuNiveau(undefined)).toBeNull();
    expect(cycleDuNiveau("")).toBeNull();
    expect(cycleDuNiveau("   ")).toBeNull();
    expect(cycleDuNiveau("Inconnu")).toBeNull();
    // Plus strict que getSchoolGroup(), qui lirait le « 12 » et répondrait Lycée.
    expect(cycleDuNiveau("Salle 12")).toBeNull();
  });
});
