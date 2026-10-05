import { describe, it, expect } from "vitest";
import {
  chargeAccessible,
  chargeLecture,
  depassement,
  niveauComprehension,
} from "@/lib/learnos/charge-lecture";
import { SEUILS_PAR_DEFAUT } from "@/lib/learnos/recommendation-engine";
import type { StructureQuestion } from "@/lib/learnos/entrainement/structure-question";

function qcm(enonce: string, options: string[]): StructureQuestion {
  return {
    etapes: [
      {
        enonce,
        format: "CHOIX_UNIQUE",
        options: options.map((texte, i) => ({ id: String(i), texte })),
        reponse: "0",
        points: 1,
      },
    ],
  };
}

describe("charge de lecture d'un énoncé", () => {
  it("tient une consigne brève pour légère", () => {
    expect(chargeLecture("Calcule 3/4 + 1/8.", qcm("Quel est le résultat ?", ["7/8", "4/12", "1/2"]))).toBe("FAIBLE");
  });

  it("tient un problème rédigé pour lourd", () => {
    const probleme =
      "Une urne contient des boules produites par deux machines. La machine A produit 60 % des boules et 5 % de sa production est défectueuse. " +
      "La machine B produit 40 % des boules et 8 % de sa production est défectueuse. On prend une boule au hasard dans l'urne et on constate qu'elle est défectueuse. " +
      "Avant de répondre, on rappelle que la somme des probabilités des branches issues d'un même nœud de l'arbre pondéré vaut toujours un. " +
      "Quelle est la probabilité qu'elle provienne de la machine A, sachant ce que l'on vient d'observer et en utilisant la formule des probabilités totales ?";
    expect(chargeLecture("Probabilités totales", qcm(probleme, ["0,48", "0,52", "0,03"]))).toBe("FORTE");
  });

  // Un QCM se lit en entier : des distracteurs rédigés pèsent autant qu'un
  // énoncé long.
  it("compte les propositions, pas seulement la consigne", () => {
    const longue =
      "Il faut comparer la probabilité de l'intersection au produit des deux probabilités, puis conclure que les événements ne sont pas indépendants dans ce cas précis";
    expect(chargeLecture("Indépendance", qcm("Que faut-il faire ?", [longue, longue, longue, longue]))).toBe("FORTE");
  });

  it("ne prend pas une décimale pour une fin de phrase", () => {
    expect(chargeLecture("Arrondis 3.14159 au centième.", null)).toBe("FAIBLE");
  });
});

describe("niveau de compréhension", () => {
  it("ne conclut rien sur une seule mesure", () => {
    expect(niveauComprehension([0.2], SEUILS_PAR_DEFAUT)).toBeNull();
  });

  it("suit les bandes de maîtrise", () => {
    expect(niveauComprehension([0.3, 0.4], SEUILS_PAR_DEFAUT)).toBe("FRAGILE");
    expect(niveauComprehension([0.6, 0.7], SEUILS_PAR_DEFAUT)).toBe("CORRECTE");
    expect(niveauComprehension([0.85, 0.9], SEUILS_PAR_DEFAUT)).toBe("SOLIDE");
  });
});

describe("ce qu'un élève lit sans peine", () => {
  // L'absence de mesure n'est pas une difficulté.
  it("ne restreint pas un élève dont on ne sait rien", () => {
    expect(chargeAccessible(null)).toBe("FORTE");
  });

  it("mesure l'écart entre l'énoncé et le lecteur", () => {
    expect(depassement("FORTE", chargeAccessible("FRAGILE"))).toBe(2);
    expect(depassement("MOYENNE", chargeAccessible("CORRECTE"))).toBe(0);
    expect(depassement("FAIBLE", chargeAccessible("SOLIDE"))).toBe(0);
  });
});
