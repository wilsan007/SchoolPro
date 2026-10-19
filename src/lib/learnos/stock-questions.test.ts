import { describe, it, expect, afterEach } from "vitest";
import {
  PALIERS_DE_STOCK,
  STOCK_CIBLE_PAR_PALIER,
  prioriteParActivite,
  secoursActif,
  trousDeStock,
  type TrouStock,
} from "@/lib/learnos/stock-questions";

describe("trousDeStock", () => {
  const COMPETENCES = ["c-a", "c-b"];

  it("compte un couple sans aucune question comme un trou à 0", () => {
    const trous = trousDeStock(COMPETENCES, []);
    expect(trous).toHaveLength(COMPETENCES.length * PALIERS_DE_STOCK.length);
    expect(trous.every((t) => t.actuel === 0)).toBe(true);
  });

  it("n'est un trou que SOUS le seuil, jamais au-dessus", () => {
    const seuil = STOCK_CIBLE_PAR_PALIER;
    const comptes = [
      { competenceId: "c-a", palier: "RESTITUTION" as const, nombre: seuil - 1 },
      { competenceId: "c-a", palier: "APPLICATION" as const, nombre: seuil },
      { competenceId: "c-a", palier: "CONSOLIDATION" as const, nombre: seuil + 1 },
    ];
    const trous = trousDeStock(["c-a"], comptes);
    // Restitution reste un trou ; les deux autres sont pleins.
    expect(trous).toHaveLength(1);
    expect(trous[0]).toMatchObject({ competenceId: "c-a", palier: "RESTITUTION", actuel: seuil - 1 });
  });

  it("ignore les paliers hors entrepôt (TRANSFERT, OUVERTURE)", () => {
    const trous = trousDeStock(["c-a"], []);
    expect(trous.map((t) => t.palier).sort()).toEqual(["APPLICATION", "CONSOLIDATION", "RESTITUTION"]);
  });

  it("ne produit aucun trou pour un curriculum vide", () => {
    expect(trousDeStock([], [])).toEqual([]);
  });
});

describe("prioriteParActivite", () => {
  const trous: TrouStock[] = [
    { competenceId: "c-phi", palier: "RESTITUTION", actuel: 0 },
    { competenceId: "c-math", palier: "RESTITUTION", actuel: 0 },
  ];

  it("met en tête la compétence la plus travaillée", () => {
    const activite = new Map([["c-math", 12], ["c-phi", 3]]);
    const tries = prioriteParActivite(trous, activite);
    expect(tries[0].competenceId).toBe("c-math");
  });

  it("à activité égale, comble d'abord ce qui est le plus vide", () => {
    const activite = new Map([["c-math", 5], ["c-phi", 5]]);
    const tries = prioriteParActivite(
      [
        { competenceId: "c-math", palier: "RESTITUTION", actuel: 2 },
        { competenceId: "c-phi", palier: "RESTITUTION", actuel: 0 },
      ],
      activite
    );
    expect(tries[0].competenceId).toBe("c-phi");
  });

  it("ne modifie pas le tableau d'entrée", () => {
    const entree = [...trous];
    prioriteParActivite(trous, new Map());
    expect(trous).toEqual(entree);
  });

  it("traite une compétence sans preuve comme la moins prioritaire", () => {
    const activite = new Map([["c-math", 1]]);
    const tries = prioriteParActivite(trous, activite);
    expect(tries.map((t) => t.competenceId)).toEqual(["c-math", "c-phi"]);
  });
});

describe("secoursActif", () => {
  afterEach(() => {
    delete process.env.AI_GENERATION_AUTONOME;
  });

  it("est actif par défaut", () => {
    delete process.env.AI_GENERATION_AUTONOME;
    expect(secoursActif()).toBe(true);
  });

  it("s'éteint avec AI_GENERATION_AUTONOME=false", () => {
    process.env.AI_GENERATION_AUTONOME = "false";
    expect(secoursActif()).toBe(false);
  });

  it("reste actif pour toute autre valeur", () => {
    process.env.AI_GENERATION_AUTONOME = "true";
    expect(secoursActif()).toBe(true);
  });
});
