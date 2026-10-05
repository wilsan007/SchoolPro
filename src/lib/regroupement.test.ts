import { describe, it, expect } from "vitest";
import {
  CLE_SANS_VALEUR,
  SEUIL_REGROUPEMENT,
  axeInitiale,
  axesTemporels,
  axesUtilisables,
  choisirAxe,
  cleTemporelle,
  regrouper,
  regrouperAvecSousNiveau,
  scoreAxe,
  type AxeRegroupement,
} from "./regroupement";

interface Ligne {
  nom: string;
  classe: string | null;
  site: string;
  date: string;
}

const axeClasse: AxeRegroupement<Ligne> = { id: "classe", cle: (l) => l.classe };
const axeSite: AxeRegroupement<Ligne> = { id: "site", cle: (l) => l.site };

function lignes(n: number, f: (i: number) => Partial<Ligne>): Ligne[] {
  return Array.from({ length: n }, (_, i) => ({
    nom: `Eleve ${i}`,
    classe: "6A",
    site: "Ambouli",
    date: "2026-01-05",
    ...f(i),
  }));
}

describe("regrouper", () => {
  it("découpe par clé, trie en tenant compte des nombres, et place les non renseignés en dernier", () => {
    const items = lignes(6, (i) => ({ classe: [null, "10A", "2B", "2B", " ", "10A"][i] }));
    const groupes = regrouper(items, axeClasse, "Sans classe");
    expect(groupes.map((g) => [g.cle, g.libelle, g.items.length])).toEqual([
      ["2B", "2B", 2],
      ["10A", "10A", 2],
      [CLE_SANS_VALEUR, "Sans classe", 2],
    ]);
  });

  it("ne perd ni ne duplique aucun élément", () => {
    const items = lignes(57, (i) => ({ classe: `C${i % 7}` }));
    const total = regrouper(items, axeClasse).reduce((s, g) => s + g.items.length, 0);
    expect(total).toBe(57);
  });
});

describe("choisirAxe", () => {
  it("écarte un axe qui met tout dans la même catégorie", () => {
    const items = lignes(40, (i) => ({ classe: `C${i % 5}` }));
    expect(scoreAxe(items, axeSite)).toBeNull();
    expect(choisirAxe(items, [axeSite, axeClasse])?.id).toBe("classe");
  });

  it("écarte un axe qui isole presque chaque élément", () => {
    const items = lignes(40, (i) => ({ classe: `C${i}`, site: i % 2 ? "A" : "B" }));
    expect(scoreAxe(items, axeClasse)).toBeNull();
    expect(choisirAxe(items, [axeClasse, axeSite])?.id).toBe("site");
  });

  it("préfère le découpage équilibré à celui dominé par un groupe géant", () => {
    const items = lignes(60, (i) => ({ site: i < 55 ? "A" : "B", classe: `C${i % 6}` }));
    expect(choisirAxe(items, [axeSite, axeClasse])?.id).toBe("classe");
  });

  it("à qualité égale, garde le premier axe déclaré", () => {
    const items = lignes(40, (i) => ({ site: `S${i % 4}`, classe: `C${i % 4}` }));
    expect(choisirAxe(items, [axeSite, axeClasse])?.id).toBe("site");
    expect(choisirAxe(items, [axeClasse, axeSite])?.id).toBe("classe");
  });

  it("renvoie null quand aucun axe ne découpe", () => {
    const items = lignes(30, () => ({}));
    expect(choisirAxe(items, [axeSite, axeClasse])).toBeNull();
    expect(axesUtilisables(items, [axeSite, axeClasse])).toEqual([]);
  });
});

describe("regrouperAvecSousNiveau", () => {
  it("re-découpe seulement les groupes qui dépassent le seuil", () => {
    const items = [
      ...lignes(SEUIL_REGROUPEMENT + 10, (i) => ({ site: "Ambouli", classe: `C${i % 3}` })),
      ...lignes(5, () => ({ site: "Balbala", classe: "6A" })),
    ];
    const [ambouli, balbala] = regrouperAvecSousNiveau(items, axeSite, [axeSite, axeClasse]);
    expect(ambouli.sousAxeId).toBe("classe");
    expect(ambouli.sousGroupes?.map((g) => g.items.length)).toEqual([10, 10, 10]);
    expect(balbala.sousGroupes).toBeUndefined();
  });
});

describe("axes temporels", () => {
  const libelles = {
    semestre: (n: 1 | 2, a: number) => `S${n} ${a}`,
    semaine: (d: string) => `Semaine du ${d}`,
  };

  it("calcule des clés triables ; la semaine commence le lundi", () => {
    // Dimanche 4 janvier 2026 → semaine du lundi 29 décembre 2025.
    const dimanche = new Date(Date.UTC(2026, 0, 4, 23, 30));
    expect(cleTemporelle(dimanche, "jour")).toBe("2026-01-04");
    expect(cleTemporelle(dimanche, "semaine")).toBe("2025-12-29");
    expect(cleTemporelle(dimanche, "mois")).toBe("2026-01");
    expect(cleTemporelle(dimanche, "semestre")).toBe("2026-S1");
    expect(cleTemporelle(new Date(Date.UTC(2026, 6, 1)), "semestre")).toBe("2026-S2");
    expect(cleTemporelle("pas une date", "jour")).toBeNull();
    expect(cleTemporelle(null, "mois")).toBeNull();
  });

  it("choisit le mois sur une année de données et le jour sur une semaine", () => {
    const axes = axesTemporels<Ligne>((l) => new Date(l.date), "fr-FR", libelles);
    const surUnAn = lignes(120, (i) => ({ date: new Date(Date.UTC(2026, i % 12, 1 + (i % 28))).toISOString() }));
    expect(choisirAxe(surUnAn, axes)?.id).toBe("mois");
    const surUneSemaine = lignes(42, (i) => ({ date: new Date(Date.UTC(2026, 0, 5 + (i % 6))).toISOString() }));
    expect(choisirAxe(surUneSemaine, axes)?.id).toBe("jour");
  });

  it("trie du plus récent au plus ancien et libelle dans la langue demandée", () => {
    const axes = axesTemporels<Ligne>((l) => new Date(l.date), "fr-FR", libelles);
    const mois = axes.find((a) => a.id === "mois")!;
    const items = lignes(4, (i) => ({ date: new Date(Date.UTC(2026, i, 10)).toISOString() }));
    expect(regrouper(items, mois).map((g) => g.libelle)).toEqual([
      "avril 2026",
      "mars 2026",
      "février 2026",
      "janvier 2026",
    ]);
    const semestre = axes.find((a) => a.id === "semestre")!;
    expect(regrouper(items, semestre)[0].libelle).toBe("S1 2026");
  });
});

describe("axeInitiale", () => {
  it("ignore les accents et range les non-lettres sous #", () => {
    const axe = axeInitiale<{ n: string | null }>((x) => x.n);
    expect([{ n: "Élodie" }, { n: " ahmed" }, { n: "42" }, { n: null }].map((x) => axe.cle(x))).toEqual([
      "E",
      "A",
      "#",
      null,
    ]);
  });
});
