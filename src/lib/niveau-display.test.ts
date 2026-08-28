import { describe, it, expect } from "vitest";
import {
  libelleNiveau,
  groupeNiveau,
  ordreNiveau,
  niveauExisteDansModele,
  comparerNiveaux,
  normaliserNiveau,
  listeNiveauxModele,
  listeNiveauxGroupe,
} from "./niveau-display";
import type { ModeleNiveaux } from "@prisma/client";

/**
 * Tests du module niveau-display : double modèle de nommage (ANNEES / FRANCAIS),
 * regroupement par catégorie pédagogique et tri dans l'ordre du cursus.
 *
 * Le module est pur (aucun import Prisma runtime) : aucune dépendance à mocker.
 */

const ANNEES: ModeleNiveaux = "ANNEES";
const FRANCAIS: ModeleNiveaux = "FRANCAIS";

// ============================================================
// libelleNiveau
// ============================================================
describe("libelleNiveau", () => {
  describe("modèle ANNEES", () => {
    it("convertit les codes primaire en « Nème année »", () => {
      expect(libelleNiveau("1A", ANNEES)).toBe("1ère année");
      expect(libelleNiveau("cp", ANNEES)).toBe("1ère année");
      expect(libelleNiveau("2A", ANNEES)).toBe("2ème année");
      expect(libelleNiveau("ce1", ANNEES)).toBe("2ème année");
    });

    it("convertit 9A en 9ème année (fin de collège)", () => {
      expect(libelleNiveau("9A", ANNEES)).toBe("9ème année");
      expect(libelleNiveau("3eme", ANNEES)).toBe("9ème année");
    });

    it("affiche « Terminale » pour terminale", () => {
      expect(libelleNiveau("terminale", ANNEES)).toBe("Terminale");
    });

    it("affiche « Seconde » et « 1ère » pour le lycée", () => {
      expect(libelleNiveau("seconde", ANNEES)).toBe("Seconde");
      expect(libelleNiveau("premiere", ANNEES)).toBe("1ère");
    });

    it("retourne la valeur brute pour un niveau inconnu", () => {
      expect(libelleNiveau("niveau-x", ANNEES)).toBe("niveau-x");
    });
  });

  describe("modèle FRANCAIS", () => {
    it("convertit les codes primaire en CI / CP / CE1 / CE2 / CM1 / CM2", () => {
      expect(libelleNiveau("ci", FRANCAIS)).toBe("CI");
      expect(libelleNiveau("cp", FRANCAIS)).toBe("CP");
      expect(libelleNiveau("ce1", FRANCAIS)).toBe("CE1");
      expect(libelleNiveau("ce2", FRANCAIS)).toBe("CE2");
      expect(libelleNiveau("cm1", FRANCAIS)).toBe("CM1");
      expect(libelleNiveau("cm2", FRANCAIS)).toBe("CM2");
    });

    it("convertit les codes collège en 6ème / 5ème / 4ème / 3ème", () => {
      expect(libelleNiveau("6eme", FRANCAIS)).toBe("6ème");
      expect(libelleNiveau("5eme", FRANCAIS)).toBe("5ème");
      expect(libelleNiveau("4eme", FRANCAIS)).toBe("4ème");
      expect(libelleNiveau("3eme", FRANCAIS)).toBe("3ème");
    });

    it("affiche « Terminale » pour terminale", () => {
      expect(libelleNiveau("terminale", FRANCAIS)).toBe("Terminale");
    });

    it("affiche « 2nde » pour seconde", () => {
      expect(libelleNiveau("seconde", FRANCAIS)).toBe("2nde");
    });
  });

  describe("variantes acceptées", () => {
    it("reconnaît les accents et abréviations", () => {
      expect(libelleNiveau("6ème", FRANCAIS)).toBe("6ème");
      expect(libelleNiveau("6e", FRANCAIS)).toBe("6ème");
      expect(libelleNiveau("2nde", FRANCAIS)).toBe("2nde");
      expect(libelleNiveau("1ère", ANNEES)).toBe("1ère");
    });

    it("reconnaît les libellés complets « Nème année »", () => {
      expect(libelleNiveau("1ère année", ANNEES)).toBe("1ère année");
      expect(libelleNiveau("9ème année", ANNEES)).toBe("9ème année");
    });

    it("est insensible à la casse", () => {
      expect(libelleNiveau("CI", FRANCAIS)).toBe("CI");
      expect(libelleNiveau("Ci", FRANCAIS)).toBe("CI");
      expect(libelleNiveau("TERMINALE", ANNEES)).toBe("Terminale");
    });
  });

  it("défaut sur le modèle ANNEES quand le modèle est omis", () => {
    expect(libelleNiveau("cp")).toBe("1ère année");
    expect(libelleNiveau("6eme")).toBe("6ème année");
  });
});

// ============================================================
// groupeNiveau
// ============================================================
describe("groupeNiveau", () => {
  it("classe les niveaux primaire dans « Primaire »", () => {
    expect(groupeNiveau("1A")).toBe("Primaire");
    expect(groupeNiveau("ci")).toBe("Primaire");
    expect(groupeNiveau("cp")).toBe("Primaire");
    expect(groupeNiveau("cm2")).toBe("Primaire");
  });

  it("classe les niveaux collège dans « College »", () => {
    expect(groupeNiveau("6eme")).toBe("College");
    expect(groupeNiveau("5eme")).toBe("College");
    expect(groupeNiveau("4eme")).toBe("College");
    expect(groupeNiveau("3eme")).toBe("College");
    expect(groupeNiveau("9A")).toBe("College");
  });

  it("classe les niveaux lycée dans « Lycee »", () => {
    expect(groupeNiveau("seconde")).toBe("Lycee");
    expect(groupeNiveau("premiere")).toBe("Lycee");
    expect(groupeNiveau("terminale")).toBe("Lycee");
  });

  it("retourne null pour un niveau inconnu", () => {
    expect(groupeNiveau("niveau-x")).toBeNull();
  });

  it("est insensible au modèle de nommage (même groupe pour 1A et cp)", () => {
    expect(groupeNiveau("1A")).toBe(groupeNiveau("cp"));
    expect(groupeNiveau("9A")).toBe(groupeNiveau("3eme"));
  });
});

// ============================================================
// ordreNiveau
// ============================================================
describe("ordreNiveau", () => {
  it("donne un ordre croissant du primaire au lycée", () => {
    expect(ordreNiveau("ci")).toBeLessThan(ordreNiveau("cp"));
    expect(ordreNiveau("cp")).toBeLessThan(ordreNiveau("ce1"));
    expect(ordreNiveau("ce1")).toBeLessThan(ordreNiveau("ce2"));
    expect(ordreNiveau("ce2")).toBeLessThan(ordreNiveau("cm1"));
    expect(ordreNiveau("cm1")).toBeLessThan(ordreNiveau("cm2"));
    expect(ordreNiveau("cm2")).toBeLessThan(ordreNiveau("6eme"));
    expect(ordreNiveau("6eme")).toBeLessThan(ordreNiveau("5eme"));
    expect(ordreNiveau("5eme")).toBeLessThan(ordreNiveau("4eme"));
    expect(ordreNiveau("4eme")).toBeLessThan(ordreNiveau("3eme"));
    expect(ordreNiveau("3eme")).toBeLessThan(ordreNiveau("seconde"));
    expect(ordreNiveau("seconde")).toBeLessThan(ordreNiveau("premiere"));
    expect(ordreNiveau("premiere")).toBeLessThan(ordreNiveau("terminale"));
  });

  it("donne le même ordre pour les équivalents inter-modèles", () => {
    // 1A ≡ CP, 9A ≡ 3eme
    expect(ordreNiveau("1A")).toBe(ordreNiveau("cp"));
    expect(ordreNiveau("9A")).toBe(ordreNiveau("3eme"));
  });

  it("renvoie 999 pour un niveau inconnu (trié en fin)", () => {
    expect(ordreNiveau("niveau-x")).toBe(999);
  });
});

// ============================================================
// niveauExisteDansModele
// ============================================================
describe("niveauExisteDansModele", () => {
  it("reconnaît « ci » dans FRANCAIS mais pas dans ANNEES", () => {
    expect(niveauExisteDansModele("ci", FRANCAIS)).toBe(true);
    expect(niveauExisteDansModele("ci", ANNEES)).toBe(false);
  });

  it("reconnaît tous les niveaux communs dans les deux modèles", () => {
    for (const n of ["cp", "ce1", "ce2", "cm1", "cm2", "6eme", "terminale"]) {
      expect(niveauExisteDansModele(n, ANNEES)).toBe(true);
      expect(niveauExisteDansModele(n, FRANCAIS)).toBe(true);
    }
  });

  it("retourne false pour un niveau inconnu", () => {
    expect(niveauExisteDansModele("niveau-x", ANNEES)).toBe(false);
    expect(niveauExisteDansModele("niveau-x", FRANCAIS)).toBe(false);
  });
});

// ============================================================
// comparerNiveaux
// ============================================================
describe("comparerNiveaux", () => {
  it("trie dans l'ordre pédagogique CI < CP < CE1 < … < CM2 < 6ème < … < Terminale", () => {
    const niveaux = [
      "terminale", "cp", "6eme", "ce1", "cm2", "3eme", "ci", "seconde",
    ];
    const tries = [...niveaux].sort(comparerNiveaux);
    expect(tries).toEqual([
      "ci", "cp", "ce1", "cm2", "6eme", "3eme", "seconde", "terminale",
    ]);
  });

  it("trie correctement entre les deux modèles (1A et cp au même rang)", () => {
    const niveaux = ["9A", "1A", "terminale", "cp", "6eme"];
    const tries = [...niveaux].sort(comparerNiveaux);
    // 1A et cp ont le même ordre → ordre relatif stable peu importe.
    expect(tries[0]).toMatch(/1A|cp/);
    expect(tries[1]).toMatch(/1A|cp/);
    expect(tries[2]).toBe("6eme");
    expect(tries[3]).toBe("9A");
    expect(tries[4]).toBe("terminale");
  });

  it("renvoie 0 pour deux niveaux équivalents", () => {
    expect(comparerNiveaux("1A", "cp")).toBe(0);
    expect(comparerNiveaux("9A", "3eme")).toBe(0);
  });

  it("renvoie une valeur négative quand a précède b", () => {
    expect(comparerNiveaux("cp", "ce1")).toBeLessThan(0);
  });

  it("renvoie une valeur positive quand a suit b", () => {
    expect(comparerNiveaux("terminale", "cp")).toBeGreaterThan(0);
  });
});

// ============================================================
// normaliserNiveau (utilitaire sous-jacent)
// ============================================================
describe("normaliserNiveau", () => {
  it("normalise les variantes vers le canon", () => {
    expect(normaliserNiveau("6ème")).toBe("6eme");
    expect(normaliserNiveau("6e")).toBe("6eme");
    expect(normaliserNiveau("2nde")).toBe("seconde");
    expect(normaliserNiveau("1ère")).toBe("premiere");
  });

  it("retourne null pour une valeur non reconnue", () => {
    expect(normaliserNiveau("niveau-x")).toBeNull();
    expect(normaliserNiveau("")).toBeNull();
  });
});

// ============================================================
// listeNiveauxModele / listeNiveauxGroupe
// ============================================================
describe("listeNiveauxModele", () => {
  it("liste les niveaux ANNEES dans l'ordre du cursus", () => {
    expect(listeNiveauxModele(ANNEES)).toEqual([
      "1ère année", "2ème année", "3ème année", "4ème année", "5ème année",
      "6ème année", "7ème année", "8ème année", "9ème année",
      "Seconde", "1ère", "Terminale",
    ]);
  });

  it("liste les niveaux FRANCAIS dans l'ordre du cursus (CI inclus)", () => {
    expect(listeNiveauxModele(FRANCAIS)).toEqual([
      "CI", "CP", "CE1", "CE2", "CM1", "CM2",
      "6ème", "5ème", "4ème", "3ème",
      "2nde", "1ère", "Terminale",
    ]);
  });
});

describe("listeNiveauxGroupe", () => {
  it("liste le primaire FRANCAIS avec CI", () => {
    expect(listeNiveauxGroupe("Primaire", FRANCAIS)).toEqual([
      "CI", "CP", "CE1", "CE2", "CM1", "CM2",
    ]);
  });

  it("liste le primaire ANNEES sans CI", () => {
    expect(listeNiveauxGroupe("Primaire", ANNEES)).toEqual([
      "1ère année", "2ème année", "3ème année", "4ème année", "5ème année",
    ]);
  });

  it("liste le collège dans l'ordre 6→3", () => {
    expect(listeNiveauxGroupe("College", FRANCAIS)).toEqual([
      "6ème", "5ème", "4ème", "3ème",
    ]);
  });

  it("liste le lycée dans l'ordre Seconde→Terminale", () => {
    expect(listeNiveauxGroupe("Lycee", ANNEES)).toEqual([
      "Seconde", "1ère", "Terminale",
    ]);
  });
});
