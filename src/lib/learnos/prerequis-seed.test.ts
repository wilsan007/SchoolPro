import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Test d'intégration du graphe de prérequis généré dans le seed SQL.
 *
 * Vérifie que:
 * 1. La direction est correcte: comp-X-1-2 dépend de comp-X-1-1
 * 2. Pas de cycles (paire réciproque A→B ET B→A)
 * 3. Les chaînes intra-chapitre, inter-chapitres et inter-niveaux existent
 */
describe("Graphe de prérequis (seed SQL)", () => {
  const sqlPath = join(process.cwd(), "prisma", "sql", "10-learnos-curriculum.sql");
  let sql: string;

  try {
    sql = readFileSync(sqlPath, "utf-8");
  } catch {
    it.skip("fichier SQL non trouvé — skip", () => {});
    return;
  }

  // Extrait les paires (A, B) du INSERT INTO "_CompetencePrerequis"
  const paires: Array<[string, string]> = [];
  const match = sql.match(/INSERT INTO "_CompetencePrerequis" \("A", "B"\) VALUES\n([\s\S]*?);/);
  if (match) {
    const lignes = match[1].trim().split("\n");
    for (const ligne of lignes) {
      const m = ligne.match(/\('([^']+)',\s*'([^']+)'\)/);
      if (m) paires.push([m[1], m[2]]);
    }
  }

  it("comp-MATH-6eme-1-2 a comp-MATH-6eme-1-1 comme prérequis", () => {
    const found = paires.some(([a, b]) => a === "comp-MATH-6eme-1-2" && b === "comp-MATH-6eme-1-1");
    expect(found).toBe(true);
  });

  it("comp-MATH-6eme-1-3 a comp-MATH-6eme-1-2 comme prérequis", () => {
    const found = paires.some(([a, b]) => a === "comp-MATH-6eme-1-3" && b === "comp-MATH-6eme-1-2");
    expect(found).toBe(true);
  });

  it("inter-chapitres: comp-MATH-6eme-2-1 dépend de comp-MATH-6eme-1-3", () => {
    const found = paires.some(([a, b]) => a === "comp-MATH-6eme-2-1" && b === "comp-MATH-6eme-1-3");
    expect(found).toBe(true);
  });

  it("inter-niveaux: comp-MATH-5eme-1-1 dépend de comp-MATH-6eme-2-3", () => {
    const found = paires.some(([a, b]) => a === "comp-MATH-5eme-1-1" && b === "comp-MATH-6eme-2-3");
    expect(found).toBe(true);
  });

  it("inter-matières: comp-PC-6eme-1-1 dépend de comp-MATH-6eme-2-3", () => {
    const found = paires.some(([a, b]) => a === "comp-PC-6eme-1-1" && b === "comp-MATH-6eme-2-3");
    expect(found).toBe(true);
  });

  it("inter-matières: comp-HG-6eme-1-1 dépend de comp-FR-6eme-2-3", () => {
    const found = paires.some(([a, b]) => a === "comp-HG-6eme-1-1" && b === "comp-FR-6eme-2-3");
    expect(found).toBe(true);
  });

  it("pas de paires réciproques (cycles de longueur 2)", () => {
    const paireSet = new Set(paires.map(([a, b]) => `${a}|${b}`));
    const reciproques: string[] = [];
    for (const [a, b] of paires) {
      if (paireSet.has(`${b}|${a}`)) {
        reciproques.push(`${a} ↔ ${b}`);
      }
    }
    expect(reciproques).toEqual([]);
  });

  it("au moins 100 liens de prérequis générés", () => {
    expect(paires.length).toBeGreaterThanOrEqual(100);
  });
});
