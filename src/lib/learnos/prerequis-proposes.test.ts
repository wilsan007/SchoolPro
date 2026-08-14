import { describe, expect, it } from "vitest";
import { extraireJson, validerAretes } from "@/lib/learnos/prerequis-proposes";

/**
 * Reconstruit le graphe attendu par `validerAretes` à partir d'une liste
 * ordonnée : le rang suit l'ordre du programme.
 */
function graphe(
  codes: string[],
  liaisons: [string, string][] = []
) {
  const noeuds = new Map<string, {
    id: string; code: string; libelle: string; rang: number;
    chapitre: string; prerequis: Set<string>;
  }>();
  const parCode = new Map<string, ReturnType<typeof noeuds.get> extends infer T ? NonNullable<T> : never>();

  codes.forEach((code, rang) => {
    const n = {
      id: `id-${code}`, code, libelle: `Libellé ${code}`,
      rang, chapitre: "Ch", prerequis: new Set<string>(),
    };
    noeuds.set(n.id, n);
    parCode.set(code, n);
  });

  for (const [cible, source] of liaisons) {
    parCode.get(cible)!.prerequis.add(`id-${source}`);
  }
  return { noeuds, parCode };
}

const arete = (competence: string, prerequis: string) => ({
  competence,
  prerequis,
  justification: "parce que",
});

describe("extraction du JSON", () => {
  it("récupère le tableau malgré le bavardage du modèle", () => {
    // Les petits modèles encadrent volontiers leur JSON : échouer là-dessus
    // jetterait une réponse correcte pour un défaut de présentation.
    const brut = 'Voici les liaisons :\n```json\n[{"competence":"A","prerequis":"B"}]\n```\nVoilà.';
    expect(extraireJson(brut)).toEqual([{ competence: "A", prerequis: "B" }]);
  });

  it("renvoie un tableau vide sur du JSON invalide", () => {
    expect(extraireJson("[{cassé")).toEqual([]);
    expect(extraireJson("aucun tableau ici")).toEqual([]);
    expect(extraireJson(null)).toEqual([]);
  });
});

describe("validation des arêtes proposées", () => {
  it("retient une liaison plausible vers une compétence antérieure", () => {
    const { noeuds, parCode } = graphe(["A", "B"]);
    const r = validerAretes(noeuds, parCode, [arete("B", "A")]);
    expect(r.proposees).toHaveLength(1);
    expect(r.proposees[0].prerequisCode).toBe("A");
    expect(r.ecartees).toHaveLength(0);
  });

  it("écarte un code inventé", () => {
    // Défaut le plus fréquent des petits modèles.
    const { noeuds, parCode } = graphe(["A", "B"]);
    const r = validerAretes(noeuds, parCode, [arete("B", "ZZZ")]);
    expect(r.proposees).toHaveLength(0);
    expect(r.ecartees[0].motif).toBe("codeInconnu");
  });

  it("écarte une auto-référence", () => {
    const { noeuds, parCode } = graphe(["A", "B"]);
    expect(validerAretes(noeuds, parCode, [arete("B", "B")]).ecartees[0].motif).toBe(
      "autoReference"
    );
  });

  it("écarte une liaison déjà déclarée", () => {
    const { noeuds, parCode } = graphe(["A", "B"], [["B", "A"]]);
    expect(validerAretes(noeuds, parCode, [arete("B", "A")]).ecartees[0].motif).toBe(
      "dejaExistant"
    );
  });

  it("écarte un prérequis enseigné après la compétence", () => {
    // La retenir déclarerait toute la classe bloquée dès la rentrée.
    const { noeuds, parCode } = graphe(["A", "B"]);
    expect(validerAretes(noeuds, parCode, [arete("A", "B")]).ecartees[0].motif).toBe(
      "ordreInverse"
    );
  });

  /**
   * Le contrôle d'ordre suffirait si le graphe existant le respectait
   * toujours — ce n'est pas le cas. Un enseignant peut réordonner ses
   * chapitres APRÈS avoir déclaré des prérequis ; il reste alors en base des
   * arêtes qui « remontent le temps ». Une proposition parfaitement licite
   * peut refermer une boucle à travers l'une d'elles.
   */
  it("écarte une liaison qui fermerait un cycle par une arête déjà en base", () => {
    // A←B est en base et viole l'ordre (B est enseigné après A) : séquelle
    // d'un réordonnancement de chapitres.
    const { noeuds, parCode } = graphe(["A", "B"], [["A", "B"]]);

    // B←A respecte l'ordre (A avant B) et passerait tous les autres filtres,
    // mais referme A → B → A.
    const r = validerAretes(noeuds, parCode, [arete("B", "A")]);

    expect(r.proposees).toHaveLength(0);
    expect(r.ecartees[0].motif).toBe("cycle");
  });

  it("tient compte des arêtes retenues plus tôt dans le même lot", () => {
    const { noeuds, parCode } = graphe(["A", "B", "C"], [["A", "C"]]);
    const r = validerAretes(noeuds, parCode, [
      arete("B", "A"), // licite : A avant B
      arete("C", "B"), // refermerait A → B → C → A
    ]);
    expect(r.proposees.map((p) => `${p.competenceCode}←${p.prerequisCode}`)).toEqual([
      "B←A",
    ]);
    expect(r.ecartees[0].motif).toBe("cycle");
  });

  it("tronque une justification démesurée", () => {
    const { noeuds, parCode } = graphe(["A", "B"]);
    const r = validerAretes(noeuds, parCode, [
      { competence: "B", prerequis: "A", justification: "x".repeat(1000) },
    ]);
    expect(r.proposees[0].justification.length).toBe(300);
  });

  it("tolère une casse et des espaces inattendus dans les codes", () => {
    const { noeuds, parCode } = graphe(["MATH-A", "MATH-B"]);
    const r = validerAretes(noeuds, parCode, [
      { competence: " math-b ", prerequis: "math-a", justification: "" },
    ]);
    expect(r.proposees).toHaveLength(1);
  });
});
