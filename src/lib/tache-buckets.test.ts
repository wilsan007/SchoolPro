import { describe, it, expect } from "vitest";

import { bucketPour, grouperParBucket, BUCKET_ORDER } from "./tache-buckets";

// Date de référence fixe : lundi 10 mars 2025 (pour des calculs déterministes).
// 10 mars 2025 est un lundi → la semaine court du 10 au 16 mars.
const MAINTENANT = new Date(2025, 2, 10, 10, 0, 0, 0); // mars = mois 2 (0-indexé)

function jour(offset: number): Date {
  const d = new Date(MAINTENANT);
  d.setDate(d.getDate() + offset);
  d.setHours(23, 59, 59, 0);
  return d;
}

describe("bucketPour — classification temporelle", () => {
  it("échéance passée → EN_RETARD (tâche non terminée)", () => {
    expect(bucketPour(jour(-1), "A_FAIRE", MAINTENANT)).toBe("EN_RETARD");
    expect(bucketPour(jour(-5), "EN_COURS", MAINTENANT)).toBe("EN_RETARD");
  });

  it("échéance aujourd'hui → AUJOURDHUI", () => {
    const aujourdhui = new Date(MAINTENANT);
    aujourdhui.setHours(18, 0, 0, 0);
    expect(bucketPour(aujourdhui, "A_FAIRE", MAINTENANT)).toBe("AUJOURDHUI");
  });

  it("échéance dans 3 jours → SEMAINE (mardi→dimanche de la semaine courante)", () => {
    // 10 mars = lundi, +3 = jeudi 13 → dans la même semaine.
    expect(bucketPour(jour(3), "A_FAIRE", MAINTENANT)).toBe("SEMAINE");
  });

  it("échéance à la fin de la semaine courante (dimanche) → SEMAINE", () => {
    // +6 = dimanche 16 mars → fin de la semaine courante.
    expect(bucketPour(jour(6), "A_FAIRE", MAINTENANT)).toBe("SEMAINE");
  });

  it("échéance dans 10 jours → SEMAINE_PROCHAINE", () => {
    // +10 = jeudi 20 mars → dans la semaine prochaine (17→23 mars).
    expect(bucketPour(jour(10), "A_FAIRE", MAINTENANT)).toBe("SEMAINE_PROCHAINE");
  });

  it("échéance dans 30 jours → PLUS_TARD", () => {
    expect(bucketPour(jour(30), "A_FAIRE", MAINTENANT)).toBe("PLUS_TARD");
  });

  it("échéance null → SANS_ECHEANCE", () => {
    expect(bucketPour(null, "A_FAIRE", MAINTENANT)).toBe("SANS_ECHEANCE");
  });

  it("accepte une échéance en chaîne ISO", () => {
    const passe = new Date(MAINTENANT);
    passe.setDate(passe.getDate() - 2);
    expect(bucketPour(passe.toISOString(), "A_FAIRE", MAINTENANT)).toBe("EN_RETARD");
  });

  it("les tâches FAIT ne sont jamais EN_RETARD même si l'échéance est passée", () => {
    expect(bucketPour(jour(-5), "FAIT", MAINTENANT)).not.toBe("EN_RETARD");
  });

  it("les tâches ANNULE ne sont jamais EN_RETARD", () => {
    expect(bucketPour(jour(-5), "ANNULE", MAINTENANT)).not.toBe("EN_RETARD");
  });

  it("tâche FAIT sans échéance → SANS_ECHEANCE", () => {
    expect(bucketPour(null, "FAIT", MAINTENANT)).toBe("SANS_ECHEANCE");
  });
});

describe("grouperParBucket — regroupement", () => {
  it("regroupe les tâches dans les bons buckets", () => {
    const taches = [
      { id: "t1", echeance: jour(-1), statut: "A_FAIRE" }, // EN_RETARD
      { id: "t2", echeance: jour(0), statut: "A_FAIRE" }, // AUJOURDHUI
      { id: "t3", echeance: jour(3), statut: "A_FAIRE" }, // SEMAINE
      { id: "t4", echeance: jour(10), statut: "A_FAIRE" }, // SEMAINE_PROCHAINE
      { id: "t5", echeance: jour(30), statut: "A_FAIRE" }, // PLUS_TARD
      { id: "t6", echeance: null, statut: "A_FAIRE" }, // SANS_ECHEANCE
    ];

    const groupes = grouperParBucket(taches, MAINTENANT);

    expect(groupes.EN_RETARD.map((t) => t.id)).toEqual(["t1"]);
    expect(groupes.AUJOURDHUI.map((t) => t.id)).toEqual(["t2"]);
    expect(groupes.SEMAINE.map((t) => t.id)).toEqual(["t3"]);
    expect(groupes.SEMAINE_PROCHAINE.map((t) => t.id)).toEqual(["t4"]);
    expect(groupes.PLUS_TARD.map((t) => t.id)).toEqual(["t5"]);
    expect(groupes.SANS_ECHEANCE.map((t) => t.id)).toEqual(["t6"]);
  });

  it("retourne tous les buckets (même vides) dans BUCKET_ORDER", () => {
    const groupes = grouperParBucket([], MAINTENANT);
    for (const b of BUCKET_ORDER) {
      expect(groupes[b]).toEqual([]);
    }
  });

  it("buckets vides restent des tableaux vides", () => {
    const taches = [
      { id: "t1", echeance: jour(-1), statut: "A_FAIRE" }, // EN_RETARD
    ];
    const groupes = grouperParBucket(taches, MAINTENANT);
    expect(groupes.AUJOURDHUI).toEqual([]);
    expect(groupes.SEMAINE).toEqual([]);
    expect(groupes.PLUS_TARD).toEqual([]);
  });

  it("respecte l'ordre de BUCKET_ORDER", () => {
    expect(BUCKET_ORDER).toEqual([
      "EN_RETARD",
      "AUJOURDHUI",
      "SEMAINE",
      "SEMAINE_PROCHAINE",
      "PLUS_TARD",
      "SANS_ECHEANCE",
    ]);
  });
});
