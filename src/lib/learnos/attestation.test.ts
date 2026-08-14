import { describe, it, expect } from "vitest";

import {
  JOURS_APRES_REFUS,
  PREUVES_MIN_ATTESTATION,
  meriteAttestation,
} from "@/lib/learnos/attestation";
import { CONFIANCE_MINIMALE, SEUILS_MAITRISE } from "@/lib/learnos/learning-twin";

/** Profil qui satisfait toutes les conditions — on en dégrade une à la fois. */
function pret(over: Partial<Parameters<typeof meriteAttestation>[0]> = {}) {
  return {
    masteryScore: SEUILS_MAITRISE.acquis + 0.05,
    confidenceScore: CONFIANCE_MINIMALE + 0.2,
    preuvesAutonomes: PREUVES_MIN_ATTESTATION,
    preuvesSupervisees: 0,
    ...over,
  };
}

describe("meriteAttestation", () => {
  it("propose quand les quatre conditions sont réunies", () => {
    expect(meriteAttestation(pret())).toBe(true);
  });

  it("ne dérange personne sur un niveau qui n'y est pas", () => {
    expect(meriteAttestation(pret({ masteryScore: SEUILS_MAITRISE.acquis - 0.01 }))).toBe(
      false
    );
  });

  it("ne conclut rien sous le seuil de confiance", () => {
    // Sous ce seuil, le système ne sait pas — pas même qu'il faudrait vérifier.
    expect(meriteAttestation(pret({ confidenceScore: CONFIANCE_MINIMALE - 0.01 }))).toBe(
      false
    );
  });

  it("exige assez de séances derrière la demande", () => {
    expect(
      meriteAttestation(pret({ preuvesAutonomes: PREUVES_MIN_ATTESTATION - 1 }))
    ).toBe(false);
  });

  it("n'a plus d'objet dès qu'une preuve supervisée existe", () => {
    // Le verrou du jumeau ne s'applique pas dans ce cas : `MASTERED` est déjà
    // atteignable, et l'attestation ne débloquerait rien.
    expect(meriteAttestation(pret({ preuvesSupervisees: 1 }))).toBe(false);
  });

  it("laisse au refus le temps de vouloir dire quelque chose", () => {
    // Ni « plus jamais » (un refus de mars ne dit rien du niveau de mai), ni
    // « dès demain » (le refus deviendrait un clic sans effet).
    expect(JOURS_APRES_REFUS).toBeGreaterThanOrEqual(7);
    expect(JOURS_APRES_REFUS).toBeLessThanOrEqual(90);
  });

  it("reste muette sur un élève simplement en progrès", () => {
    // Le silence est le comportement par défaut : un enseignant qui reçoit une
    // demande par élève et par semaine cesse de les lire.
    expect(
      meriteAttestation({
        masteryScore: 0.6,
        confidenceScore: 0.8,
        preuvesAutonomes: 10,
        preuvesSupervisees: 0,
      })
    ).toBe(false);
  });
});
