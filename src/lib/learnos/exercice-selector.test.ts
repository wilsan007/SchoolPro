import { describe, it, expect } from "vitest";
import {
  palierPour,
  paliersDeRepli,
  evaluerCible,
  composerSelection,
  statutInitial,
  PRIORITE_REGLE,
  type ContexteCompetence,
  type CibleExercice,
} from "@/lib/learnos/exercice-selector";
import { SEUILS_PAR_DEFAUT } from "@/lib/learnos/recommendation-engine";

/** Contexte neutre : rien ne déclenche, chaque test n'active que ce qu'il teste. */
function contexte(over: Partial<ContexteCompetence> = {}): ContexteCompetence {
  return {
    competenceId: "c-proportionnalite",
    libelle: "Proportionnalité",
    masteryScore: 0.7,
    confidenceScore: 0.8,
    prerequisManquants: [],
    etapePlan: null,
    chapitreEnCours: false,
    semainesAvantChapitreDependant: null,
    chapitreDependant: null,
    ...over,
  };
}

function prerequis(id: string, libelle: string, score: number) {
  return { competenceId: id, code: id.toUpperCase(), libelle, masteryScore: score, acquis: false };
}

describe("palier accessible", () => {
  // Les bornes sont celles des bandes de recommandation : le palier servi et
  // la bande affichée ne doivent jamais se contredire.
  it("suit les bandes de maîtrise", () => {
    expect(palierPour(0.1)).toBe("RESTITUTION");
    expect(palierPour(0.45)).toBe("APPLICATION");
    expect(palierPour(0.7)).toBe("CONSOLIDATION");
    expect(palierPour(0.85)).toBe("TRANSFERT");
    expect(palierPour(0.97)).toBe("OUVERTURE");
  });

  it("ne propose jamais de transfert à un élève fragile", () => {
    const fragile = (SEUILS_PAR_DEFAUT.seuilCritique + SEUILS_PAR_DEFAUT.seuilFragile) / 2;
    expect(palierPour(fragile)).toBe("APPLICATION");
  });

  // Servir plus facile fait perdre du temps ; servir plus dur met en échec sur
  // un exercice qu'on a choisi pour l'élève.
  it("ne se replie que vers le bas", () => {
    expect(paliersDeRepli("CONSOLIDATION")).toEqual([
      "CONSOLIDATION",
      "APPLICATION",
      "RESTITUTION",
    ]);
    expect(paliersDeRepli("RESTITUTION")).toEqual(["RESTITUTION"]);
  });
});

describe("on ne remédie pas à ce qu'on n'a pas mesuré", () => {
  it("sonde au lieu de remédier quand la confiance est insuffisante", () => {
    const cible = evaluerCible(
      contexte({ masteryScore: 0.1, confidenceScore: 0.2, chapitreEnCours: true })
    );

    expect(cible?.regleDeclenchee).toBe("exercice_sondage");
    // Un score de 0,1 appellerait de la restitution — mais il n'est pas fiable.
    // Descendre au plus facile fabriquerait une réussite qui n'apprend rien.
    expect(cible?.palier).toBe("APPLICATION");
  });

  it("sonde aussi une compétence jamais mesurée", () => {
    const cible = evaluerCible(
      contexte({ masteryScore: null, confidenceScore: null, chapitreEnCours: true })
    );
    expect(cible?.regleDeclenchee).toBe("exercice_sondage");
  });

  it("ne sonde pas ce qui n'est ni enseigné ni exigé bientôt", () => {
    expect(evaluerCible(contexte({ masteryScore: null, confidenceScore: null }))).toBeNull();
  });

  it("sonde avant un chapitre qui en dépend, même hors programme du moment", () => {
    const cible = evaluerCible(
      contexte({
        masteryScore: null,
        confidenceScore: null,
        semainesAvantChapitreDependant: 2,
        chapitreDependant: "Proportionnalité",
      })
    );
    expect(cible?.regleDeclenchee).toBe("exercice_sondage");
  });
});

describe("descente sur prérequis", () => {
  // Le cœur de l'adaptation : on travaille la marche accessible, pas la marche
  // visée. Sans cette règle, l'élève reçoit indéfiniment le même exercice trop
  // dur pour lui.
  it("travaille le prérequis manquant, pas la compétence visée", () => {
    const cible = evaluerCible(
      contexte({
        masteryScore: 0.2,
        chapitreEnCours: true,
        prerequisManquants: [prerequis("c-fractions", "Fractions", 0.4)],
      })
    );

    expect(cible?.competenceId).toBe("c-fractions");
    expect(cible?.competenceViseeId).toBe("c-proportionnalite");
    expect(cible?.regleDeclenchee).toBe("exercice_reprise_prerequis");
  });

  it("prend la marche la plus basse manquante", () => {
    const cible = evaluerCible(
      contexte({
        masteryScore: 0.2,
        chapitreEnCours: true,
        prerequisManquants: [
          prerequis("c-fractions", "Fractions", 0.15),
          prerequis("c-division", "Division", 0.45),
        ],
      })
    );
    expect(cible?.competenceId).toBe("c-fractions");
  });

  it("cale le palier sur le prérequis travaillé, pas sur la compétence visée", () => {
    const cible = evaluerCible(
      contexte({
        masteryScore: 0.05, // visée : effondrée
        chapitreEnCours: true,
        prerequisManquants: [prerequis("c-fractions", "Fractions", 0.5)], // base : presque là
      })
    );
    expect(cible?.palier).toBe("APPLICATION");
  });

  it("conserve la priorité de la règle déclenchante", () => {
    const cible = evaluerCible(
      contexte({
        masteryScore: 0.2,
        semainesAvantChapitreDependant: 2,
        chapitreDependant: "Proportionnalité",
        prerequisManquants: [prerequis("c-fractions", "Fractions", 0.3)],
      })
    );
    // Réparer une base urgente ne doit pas passer après une consolidation
    // ordinaire : la descente hérite du rang de l'anticipation.
    expect(cible?.priorite).toBe(PRIORITE_REGLE.exercice_prerequis_avant_chapitre);
  });

  it("ne descend pas au-dessus de la bande critique", () => {
    const cible = evaluerCible(
      contexte({
        masteryScore: 0.45, // fragile, pas critique
        chapitreEnCours: true,
        prerequisManquants: [prerequis("c-fractions", "Fractions", 0.3)],
      })
    );
    expect(cible?.competenceId).toBe("c-proportionnalite");
    expect(cible?.regleDeclenchee).toBe("exercice_consolidation_fragile");
  });

  it("reprend la compétence elle-même quand aucun prérequis n'est identifié", () => {
    const cible = evaluerCible(contexte({ masteryScore: 0.2, chapitreEnCours: true }));
    expect(cible?.regleDeclenchee).toBe("exercice_reprise_critique");
    expect(cible?.competenceId).toBe("c-proportionnalite");
  });
});

describe("anticipation", () => {
  // C'est ce qui rend le dispositif anticipatif plutôt que constatatif :
  // prévenir en semaine 11, au lieu d'attendre l'échec en semaine 14.
  it("passe avant tout le reste quand un chapitre imminent en dépend", () => {
    const cible = evaluerCible(
      contexte({
        masteryScore: 0.4,
        semainesAvantChapitreDependant: 2,
        chapitreDependant: "Proportionnalité",
        etapePlan: { id: "e1", echeance: null },
        chapitreEnCours: true,
      })
    );
    expect(cible?.regleDeclenchee).toBe("exercice_prerequis_avant_chapitre");
    expect(cible?.priorite).toBe(1);
  });

  it("porte le chapitre et le délai dans les paramètres, pas dans une phrase", () => {
    const cible = evaluerCible(
      contexte({
        masteryScore: 0.4,
        semainesAvantChapitreDependant: 3,
        chapitreDependant: "Proportionnalité",
      })
    );
    expect(cible?.motifParams).toEqual({
      competence: "Proportionnalité",
      chapitre: "Proportionnalité",
      semaines: 3,
    });
  });

  it("ne déclenche pas si le prérequis est déjà en place", () => {
    const cible = evaluerCible(
      contexte({
        masteryScore: 0.85,
        semainesAvantChapitreDependant: 2,
        chapitreDependant: "Proportionnalité",
      })
    );
    expect(cible).toBeNull();
  });
});

describe("étape de parcours signée", () => {
  it("prime sur la situation du chapitre courant", () => {
    const cible = evaluerCible(
      contexte({
        masteryScore: 0.4,
        chapitreEnCours: true,
        etapePlan: { id: "e1", echeance: new Date("2026-03-01") },
      })
    );
    expect(cible?.regleDeclenchee).toBe("exercice_etape_plan");
  });
});

describe("couvrir le spectre, et se taire au milieu", () => {
  it("propose de l'approfondissement en haut de bande", () => {
    const cible = evaluerCible(contexte({ masteryScore: 0.95, chapitreEnCours: true }));
    expect(cible?.regleDeclenchee).toBe("exercice_approfondissement");
    expect(cible?.palier).toBe("OUVERTURE");
  });

  // Un dispositif qui donne des exercices à tout le monde sur tout n'est plus
  // lu. Le silence de la bande consolidée est ce qui donne du poids au reste.
  it("ne produit rien sur une compétence consolidée", () => {
    expect(evaluerCible(contexte({ masteryScore: 0.7, chapitreEnCours: true }))).toBeNull();
  });

  it("ne produit rien hors du programme du moment", () => {
    expect(evaluerCible(contexte({ masteryScore: 0.2 }))).toBeNull();
  });
});

describe("composition de la feuille", () => {
  function cible(over: Partial<CibleExercice> = {}): CibleExercice {
    return {
      competenceId: "c1",
      competenceViseeId: null,
      palier: "APPLICATION",
      regleDeclenchee: "exercice_consolidation_fragile",
      motifParams: {},
      priorite: 4,
      ...over,
    };
  }

  it("sert d'abord le plus contraint", () => {
    const retenues = composerSelection(
      [
        cible({ competenceId: "c1", priorite: 6 }),
        cible({ competenceId: "c2", priorite: 1 }),
        cible({ competenceId: "c3", priorite: 3 }),
      ],
      2
    );
    expect(retenues.map((c) => c.competenceId)).toEqual(["c2", "c3"]);
  });

  // Trois exercices sur la même notion épuisent l'élève sans élargir la mesure.
  it("ne sert qu'un exercice par compétence, en gardant la meilleure raison", () => {
    const retenues = composerSelection(
      [cible({ competenceId: "c1", priorite: 5 }), cible({ competenceId: "c1", priorite: 2 })],
      5
    );
    expect(retenues).toHaveLength(1);
    expect(retenues[0].priorite).toBe(2);
  });

  // Sans tri total, deux exécutions divergeraient sur des cibles à égalité et
  // la feuille ne serait plus reproductible lors d'une contestation.
  it("produit la même feuille à entrée identique, quel que soit l'ordre reçu", () => {
    const cibles = [
      cible({ competenceId: "cb", priorite: 3 }),
      cible({ competenceId: "ca", priorite: 3 }),
      cible({ competenceId: "cc", priorite: 3 }),
    ];
    const a = composerSelection(cibles, 2).map((c) => c.competenceId);
    const b = composerSelection([...cibles].reverse(), 2).map((c) => c.competenceId);
    expect(a).toEqual(b);
    expect(a).toEqual(["ca", "cb"]);
  });

  it("renvoie une feuille vide plutôt que d'inventer un exercice", () => {
    expect(composerSelection([], 5)).toEqual([]);
    expect(composerSelection([cible()], 0)).toEqual([]);
  });
});

describe("garde-fou de validation", () => {
  // Une feuille qui atteste une étape de parcours engage l'établissement :
  // aucune ne doit atteindre l'élève sans signature. Ce test échoue si la
  // transition devient possible.
  it("laisse une feuille-jalon en attente de signature", () => {
    expect(statutInitial("jalon")).toBe("PROPOSEE");
  });

  // Exiger une validation à chaque cycle d'entraînement ferait abandonner le
  // dispositif avant la fin du trimestre.
  it("sert l'entraînement et le diagnostic sans validation", () => {
    expect(statutInitial("entrainement")).toBe("ASSIGNEE");
    expect(statutInitial("diagnostic")).toBe("ASSIGNEE");
  });
});
