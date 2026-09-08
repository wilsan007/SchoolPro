import { describe, it, expect } from "vitest";

/**
 * Tests unitaires pour la logique de classification du décalage.
 *
 * La distinction critique : un chapitre prévu sur 22 semaines ne peut pas
 * être "en décalage" en semaine 1. Le décalage n'a de sens que quand le
 * chapitre approche ou dépasse sa semaine de fin prévue sans aucune trace.
 */

// Logique extraite de alerte-decalage.ts pour test sans Prisma.
function classifierDecalage(
  declareTraite: boolean,
  devoirsDonnes: number,
  preuvesEleves: number,
  notesSaisies: number,
  exercicesAssignes: number,
  semaineDebut: number,
  semaineFin: number,
  semaineAAnalyser: number,
): "ALIGNE" | "DECLARE_SEUL" | "REALISE_NON_DECLARE" | "DECALAGE" {
  const aDeclaration = declareTraite || devoirsDonnes > 0;
  const aPreuves = preuvesEleves > 0 || notesSaisies > 0 || exercicesAssignes > 0;

  const dureeChapitre = semaineFin - semaineDebut + 1;
  const semainesRestantes = semaineFin - semaineAAnalyser;
  const enFinDeChapitre = semainesRestantes <= Math.max(2, Math.floor(dureeChapitre * 0.2));
  const semaineFinDepassee = semaineFin < semaineAAnalyser;

  if (aDeclaration && aPreuves) return "ALIGNE";
  if (aDeclaration && !aPreuves) return "DECLARE_SEUL";
  if (!aDeclaration && aPreuves) return "REALISE_NON_DECLARE";
  if (semaineFinDepassee || enFinDeChapitre) return "DECALAGE";
  return "ALIGNE";
}

describe("alerte-decalage — classification", () => {
  it("ALIGNE quand le chapitre est déclaré + preuves", () => {
    expect(classifierDecalage(true, 1, 5, 3, 2, 1, 22, 5)).toBe("ALIGNE");
  });

  it("DECLARE_SEUL quand déclaré sans preuves", () => {
    expect(classifierDecalage(true, 0, 0, 0, 0, 1, 22, 5)).toBe("DECLARE_SEUL");
  });

  it("REALISE_NON_DECLARE quand preuves sans déclaration", () => {
    expect(classifierDecalage(false, 0, 3, 1, 0, 1, 22, 5)).toBe("REALISE_NON_DECLARE");
  });

  it("DECALAGE quand la semaine de fin est dépassée sans signal", () => {
    expect(classifierDecalage(false, 0, 0, 0, 0, 1, 10, 15)).toBe("DECALAGE");
  });

  it("DECALAGE quand le chapitre approche sa fin sans signal", () => {
    // Chapitre sem 1-10, analysé en sem 9 : 1 semaine restante ≤ seuil (2)
    expect(classifierDecalage(false, 0, 0, 0, 0, 1, 10, 9)).toBe("DECALAGE");
  });

  it("ALIGNE en semaine 1 pour un chapitre de 22 semaines sans signal", () => {
    // Bug original : un chapitre prévu sur 22 semaines était flaggé DECALAGE
    // dès la semaine 1. Maintenant : ALIGNE car le chapitre vient de commencer.
    expect(classifierDecalage(false, 0, 0, 0, 0, 1, 22, 1)).toBe("ALIGNE");
  });

  it("ALIGNE en milieu de chapitre sans signal", () => {
    // Chapitre sem 1-22, analysé en sem 10 : 12 semaines restantes > seuil
    expect(classifierDecalage(false, 0, 0, 0, 0, 1, 22, 10)).toBe("ALIGNE");
  });

  it("DECALAGE pour un chapitre court en fin de période", () => {
    // Chapitre sem 1-5, analysé en sem 4 : 1 semaine restante ≤ seuil (2)
    expect(classifierDecalage(false, 0, 0, 0, 0, 1, 5, 4)).toBe("DECALAGE");
  });

  it("ALIGNE pour un chapitre court en début de période", () => {
    // Chapitre sem 1-5, analysé en sem 2 : 3 semaines restantes > seuil (2)
    expect(classifierDecalage(false, 0, 0, 0, 0, 1, 5, 2)).toBe("ALIGNE");
  });
});
