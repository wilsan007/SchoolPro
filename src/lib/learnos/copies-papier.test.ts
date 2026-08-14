/**
 * Copies papier — ce que les règles garantissent sur une transcription.
 *
 * Les cas testés ici sont des transcriptions réalistes : un modèle de vision ne
 * rend pas un tableau bien rangé, il rend le texte d'une page dans l'ordre où il
 * le lit, avec les notes de la marge à la fin de la ligne, les virgules
 * décimales françaises, et des trous là où il n'a pas déchiffré.
 *
 * Ce qui compte n'est pas que la lecture soit parfaite — elle ne le sera pas —
 * mais que **ce qui est douteux soit signalé** plutôt que deviné.
 */

import { describe, expect, it } from "vitest";

import {
  BAREME_PAR_DEFAUT,
  PROXIMITE_MINIMALE,
  alignerNotes,
  apparierEleve,
  baremeDeTexte,
  extraireExercices,
  extraireNom,
  extraireNotes,
  nombreFr,
  proximite,
  rattacherCompetence,
} from "@/lib/learnos/copies-papier";
import { MARQUE_ILLISIBLE } from "@/lib/ocr/texte";

const FEUILLE = `
Collège de Balbala — Mathématiques 5ème
Nom : ....................  Classe : 5A   Date : 12/03

Exercice 1 (4 points)
Calculer la somme des fractions 1/3 + 1/4.

Exercice 2 : Résoudre l'équation 3x + 5 = 20. /6
Justifier chaque étape.

Exercice 3 sur 10 points
Le périmètre d'un rectangle mesure 24 cm et sa largeur 4 cm.
Déterminer sa longueur.
`;

describe("extraireExercices", () => {
  it("découpe les exercices et retient leur barème", () => {
    const exercices = extraireExercices(FEUILLE);

    expect(exercices.map((e) => e.numero)).toEqual([1, 2, 3]);
    expect(exercices.map((e) => e.bareme)).toEqual([4, 6, 10]);
    expect(exercices.every((e) => e.baremeLu)).toBe(true);
  });

  it("ignore l'en-tête de la feuille", () => {
    // Le nom, la classe et la date ne sont pas un exercice — et un « 5A » pris
    // pour un énoncé produirait une question vide dans la banque.
    const exercices = extraireExercices(FEUILLE);
    expect(exercices[0].enonce).toContain("fractions");
    expect(exercices.some((e) => e.enonce.includes("Classe"))).toBe(false);
  });

  it("rattache les lignes suivantes à l'exercice courant", () => {
    const exercices = extraireExercices(FEUILLE);
    expect(exercices[1].enonce).toContain("Justifier chaque étape");
    expect(exercices[2].enonce).toContain("Déterminer sa longueur");
  });

  it("suppose un barème quand la feuille n'en porte pas, et le dit", () => {
    const [exercice] = extraireExercices("Exercice 1\nDonner la définition d'un carré.");
    expect(exercice.bareme).toBe(BAREME_PAR_DEFAUT);
    // C'est ce drapeau qui permet à l'écran de demander le barème plutôt que de
    // laisser croire qu'il a été lu.
    expect(exercice.baremeLu).toBe(false);
  });

  it("renumérote plutôt que de produire deux exercices de même numéro", () => {
    // Cas courant : « 2) » est une sous-question, prise pour un exercice.
    const exercices = extraireExercices(
      "Exercice 1\nPremière partie.\n2) suite de la première partie\nExercice 2\nAutre chose."
    );
    const numeros = exercices.map((e) => e.numero);
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  it("ne rend rien quand le texte ne contient aucun exercice", () => {
    expect(extraireExercices("Bonne chance à tous.")).toEqual([]);
  });
});

describe("baremeDeTexte", () => {
  it("lit les formes usuelles", () => {
    expect(baremeDeTexte("Exercice 1 /4")).toBe(4);
    expect(baremeDeTexte("Exercice 1 (2,5 points)")).toBe(2.5);
    expect(baremeDeTexte("Exercice 1 sur 8 pts")).toBe(8);
    expect(baremeDeTexte("Barème : 3")).toBe(3);
  });

  it("écarte ce qui n'est pas un barème", () => {
    expect(baremeDeTexte("Exercice 1")).toBeNull();
    // Un barème de 0 n'est pas un barème : la preuve produite serait indéfinie.
    expect(baremeDeTexte("Barème : 0")).toBeNull();
  });
});

describe("nombreFr", () => {
  it("accepte la virgule comme le point", () => {
    expect(nombreFr("12,5")).toBe(12.5);
    expect(nombreFr("12.5")).toBe(12.5);
  });
});

describe("proximite / rattacherCompetence", () => {
  const competences = [
    { id: "c-fractions", code: "F1", libelle: "Additionner deux fractions de dénominateurs différents" },
    { id: "c-equation", code: "E1", libelle: "Résoudre une équation du premier degré" },
    { id: "c-perimetre", code: "P1", libelle: "Calculer le périmètre d'un rectangle" },
  ];

  it("propose la compétence dont les mots reviennent dans l'énoncé", () => {
    const propose = rattacherCompetence("Résoudre l'équation 3x + 5 = 20", competences);
    expect(propose.competenceId).toBe("c-equation");
    expect(propose.score).toBeGreaterThanOrEqual(PROXIMITE_MINIMALE);
  });

  it("ne propose rien quand rien ne correspond", () => {
    // Ne rien proposer est le bon comportement : une compétence proposée au
    // hasard serait appliquée sans relecture et fausserait le jumeau.
    const propose = rattacherCompetence("Réciter le poème appris en classe", competences);
    expect(propose.competenceId).toBeNull();
    expect(propose.alternatives).toEqual([]);
  });

  it("remonte les alternatives quand plusieurs compétences se ressemblent", () => {
    const proches = [
      { id: "a", code: "A", libelle: "Calculer le périmètre d'un rectangle" },
      { id: "b", code: "B", libelle: "Calculer le périmètre d'un carré" },
    ];
    const propose = rattacherCompetence(
      "Déterminer le périmètre de cette figure rectangle",
      proches
    );
    expect(propose.competenceId).not.toBeNull();
    expect(propose.alternatives.length).toBeGreaterThan(0);
  });

  it("ignore les verbes passe-partout", () => {
    // « Calculer » à lui seul ne rapproche rien : la moitié des compétences de
    // mathématiques commencent par ce verbe.
    expect(proximite("Calculer.", "Calculer le périmètre d'un rectangle")).toBe(0);
  });
});

describe("extraireNom", () => {
  it("lit le nom en tête de copie", () => {
    expect(extraireNom("Nom et prénom : Ali Hassan\nClasse : 5A")).toBe("Ali Hassan");
    expect(extraireNom("Élève : Fatouma Omar")).toBe("Fatouma Omar");
  });

  it("ne rend rien quand le nom est illisible", () => {
    // Mieux vaut aucun nom qu'un nom à moitié deviné : l'appariement échouera,
    // et l'enseignant désignera la copie lui-même.
    expect(extraireNom(`Nom : ${MARQUE_ILLISIBLE}`)).toBe("");
    expect(extraireNom("Mathématiques — contrôle n°2")).toBe("");
  });
});

describe("apparierEleve", () => {
  const eleves = [
    { id: "e1", nom: "Hassan", prenom: "Ali" },
    { id: "e2", nom: "Hassan", prenom: "Amina" },
    { id: "e3", nom: "Omar", prenom: "Fatouma" },
  ];

  it("apparie sur nom et prénom", () => {
    const trouve = apparierEleve("Fatouma Omar", eleves);
    expect(trouve.eleveId).toBe("e3");
    expect(trouve.confiance).toBe(1);
  });

  it("ignore casse, accents et ordre des mots", () => {
    expect(apparierEleve("omar fatouma", eleves).eleveId).toBe("e3");
  });

  it("refuse de trancher entre deux homonymes", () => {
    // Deux « Hassan » : attribuer la copie au premier écrirait la note d'un
    // élève dans le dossier d'un autre.
    const trouve = apparierEleve("Hassan", eleves);
    expect(trouve.eleveId).toBeNull();
    expect(trouve.candidats.map((c) => c.eleveId).sort()).toEqual(["e1", "e2"]);
  });

  it("ne rend personne quand le nom lu ne dit rien", () => {
    expect(apparierEleve("", eleves).eleveId).toBeNull();
    expect(apparierEleve("Zzz", eleves).eleveId).toBeNull();
  });
});

describe("extraireNotes", () => {
  it("récupère les notes portées en face de chaque exercice", () => {
    const lecture = extraireNotes(
      "Exercice 1 : 3/4\nExercice 2 : 4,5/6\nExercice 3 : 7/10\nTotal : 14,5/20"
    );
    expect(lecture.notes.map((n) => [n.numero, n.points])).toEqual([
      [1, 3],
      [2, 4.5],
      [3, 7],
    ]);
    expect(lecture.total).toEqual({ points: 14.5, sur: 20 });
  });

  it("rattache une note de marge à l'exercice en cours", () => {
    const lecture = extraireNotes("Exercice 2\nRéponse de l'élève ...\n4/6");
    expect(lecture.notes).toHaveLength(1);
    expect(lecture.notes[0].numero).toBe(2);
  });

  it("ne compte pas le total comme la note d'un exercice", () => {
    const lecture = extraireNotes("Note : 12/20");
    expect(lecture.notes).toEqual([]);
    expect(lecture.total).toEqual({ points: 12, sur: 20 });
  });

  it("conserve la ligne d'origine de chaque note", () => {
    // Sans cet extrait, l'enseignant devrait rouvrir le scan pour vérifier.
    const lecture = extraireNotes("Exercice 1 : 3/4 (bien)");
    expect(lecture.notes[0].extrait).toContain("3/4");
  });
});

describe("alignerNotes", () => {
  const exercices = [
    { exerciceId: "x1", numero: 1, bareme: 4 },
    { exerciceId: "x2", numero: 2, bareme: 6 },
  ];

  it("retient les notes cohérentes", () => {
    const { retenues, anomalies } = alignerNotes(
      exercices,
      extraireNotes("Exercice 1 : 3/4\nExercice 2 : 5/6")
    );
    expect(retenues.map((r) => [r.numero, r.points])).toEqual([
      [1, 3],
      [2, 5],
    ]);
    expect(anomalies).toEqual([]);
  });

  it("écarte une note hors barème au lieu de la ramener au barème", () => {
    // « 7/4 » est presque toujours « 1/4 » mal lu. Plafonner à 4 fabriquerait
    // une décision que l'enseignant n'a pas prise.
    const { retenues, anomalies } = alignerNotes(
      exercices,
      extraireNotes("Exercice 1 : 7/4\nExercice 2 : 5/6")
    );
    expect(retenues.map((r) => r.numero)).toEqual([2]);
    expect(anomalies).toEqual(
      expect.arrayContaining([expect.objectContaining({ motif: "points_hors_bareme", numero: 1 })])
    );
  });

  it("signale un exercice sans note", () => {
    const { anomalies } = alignerNotes(exercices, extraireNotes("Exercice 1 : 3/4"));
    expect(anomalies).toEqual(
      expect.arrayContaining([expect.objectContaining({ motif: "note_manquante", numero: 2 })])
    );
  });

  it("signale un barème qui diverge de celui de la feuille, sans perdre la note", () => {
    const { retenues, anomalies } = alignerNotes(
      exercices,
      extraireNotes("Exercice 1 : 3/5\nExercice 2 : 5/6")
    );
    expect(retenues).toHaveLength(2);
    expect(anomalies).toEqual(
      expect.arrayContaining([expect.objectContaining({ motif: "bareme_different", numero: 1 })])
    );
  });

  it("apparie dans l'ordre les notes sans numéro", () => {
    const { retenues } = alignerNotes(exercices, {
      notes: [
        { numero: null, points: 2, sur: 4, extrait: "2/4" },
        { numero: null, points: 6, sur: 6, extrait: "6/6" },
      ],
      total: null,
    });
    expect(retenues.map((r) => [r.numero, r.points])).toEqual([
      [1, 2],
      [2, 6],
    ]);
  });

  it("confronte la somme au total écrit par l'enseignant", () => {
    // Le meilleur contrôle disponible : l'addition a été faite par un humain,
    // et elle contredit la lecture.
    const { anomalies } = alignerNotes(
      exercices,
      extraireNotes("Exercice 1 : 3/4\nExercice 2 : 5/6\nTotal : 9/10")
    );
    expect(anomalies).toEqual(
      expect.arrayContaining([expect.objectContaining({ motif: "total_incoherent" })])
    );
  });

  it("signale une zone illisible du scan", () => {
    const { anomalies } = alignerNotes(
      exercices,
      extraireNotes("Exercice 1 : 3/4\nExercice 2 : 5/6"),
      `Exercice 2 ... ${MARQUE_ILLISIBLE}`
    );
    expect(anomalies).toEqual(
      expect.arrayContaining([expect.objectContaining({ motif: "illisible" })])
    );
  });

  it("signale une note qui ne correspond à aucun exercice de la feuille", () => {
    const { anomalies } = alignerNotes(
      exercices,
      extraireNotes("Exercice 1 : 3/4\nExercice 2 : 5/6\nExercice 3 : 2/2")
    );
    expect(anomalies).toEqual(
      expect.arrayContaining([expect.objectContaining({ motif: "nombre_de_notes" })])
    );
  });
});
