import { describe, it, expect } from "vitest";

import {
  DUREE_MIN_ETAPE_MS,
  TENTATIVES_MAX,
  corrigerEtape,
  creditTentative,
  detokeniser,
  erreurDominante,
  evidenceTypeDeFeuille,
  fiabiliteSeance,
  parseStructure,
  vueEleve,
  type EtapeFaite,
  type EtapeQuestion,
} from "@/lib/learnos/entrainement";

// ------------------------------------------------------------
// Fabriques
// ------------------------------------------------------------

function saisie(over: Partial<EtapeQuestion> = {}): EtapeQuestion {
  return {
    enonce: "Réduis au même dénominateur",
    format: "SAISIE_COURTE",
    reponse: "12",
    points: 1,
    ...over,
  };
}

function choix(over: Partial<EtapeQuestion> = {}): EtapeQuestion {
  return {
    enonce: "Quelle est la suite ?",
    format: "CHOIX_UNIQUE",
    reponse: "b",
    options: [
      { id: "a", texte: "On additionne les dénominateurs", erreur: "CONCEPTUAL_ERROR" },
      { id: "b", texte: "On garde le dénominateur commun" },
      { id: "c", texte: "On multiplie tout", erreur: "PROCEDURAL_ERROR" },
    ],
    points: 1,
    ...over,
  };
}

function ordre(over: Partial<EtapeQuestion> = {}): EtapeQuestion {
  return {
    enonce: "Remets la résolution dans l'ordre",
    format: "REMISE_EN_ORDRE",
    options: [
      { id: "a", texte: "Réduire au même dénominateur" },
      { id: "b", texte: "Additionner les numérateurs" },
      { id: "c", texte: "Simplifier" },
    ],
    reponse: "a|b|c",
    points: 1,
    ...over,
  };
}

function appariement(over: Partial<EtapeQuestion> = {}): EtapeQuestion {
  return {
    enonce: "Relie chaque fraction à son écriture décimale",
    format: "APPARIEMENT",
    paires: [
      { id: "p1", gauche: "1/2", droite: "0,5" },
      { id: "p2", gauche: "1/4", droite: "0,25" },
      { id: "p3", gauche: "3/4", droite: "0,75" },
    ],
    reponse: "p1:p1|p2:p2|p3:p3",
    points: 1,
    ...over,
  };
}

function faite(over: Partial<EtapeFaite> = {}): EtapeFaite {
  return {
    index: 0,
    reponse: "12",
    correcte: true,
    tentatives: 1,
    credit: 1,
    erreur: null,
    dureeMs: 20_000,
    ...over,
  };
}

// ------------------------------------------------------------
// parseStructure
// ------------------------------------------------------------

describe("parseStructure", () => {
  it("accepte une suite d'étapes bien formée", () => {
    const s = parseStructure({ etapes: [saisie(), choix()] });
    expect(s?.etapes).toHaveLength(2);
    expect(s?.etapes[1].options).toHaveLength(3);
  });

  it("refuse une structure vide ou absente", () => {
    expect(parseStructure(null)).toBeNull();
    expect(parseStructure({})).toBeNull();
    expect(parseStructure({ etapes: [] })).toBeNull();
  });

  it("refuse un QCM dont la bonne réponse ne figure pas dans les propositions", () => {
    // Erreur de saisie, pas exercice difficile : l'étape serait insoluble.
    expect(parseStructure({ etapes: [choix({ reponse: "z" })] })).toBeNull();
  });

  it("refuse un QCM à une seule proposition", () => {
    expect(
      parseStructure({ etapes: [choix({ options: [{ id: "a", texte: "seule" }], reponse: "a" })] })
    ).toBeNull();
  });

  it("refuse un format d'étape inconnu", () => {
    expect(parseStructure({ etapes: [{ ...saisie(), format: "REDACTION" }] })).toBeNull();
  });

  it("retombe sur 1 point quand le barème d'étape est absent ou aberrant", () => {
    const s = parseStructure({ etapes: [{ ...saisie(), points: -3 }] });
    expect(s?.etapes[0].points).toBe(1);
  });
});

// ------------------------------------------------------------
// corrigerEtape
// ------------------------------------------------------------

describe("corrigerEtape", () => {
  it("accepte les écritures numériques équivalentes", () => {
    const etape = saisie({ reponse: "0.5" });
    for (const brut of ["0.5", "0,5", " 0.50 ", ".5"]) {
      expect(corrigerEtape(etape, brut).correcte).toBe(true);
    }
  });

  it("applique la tolérance quand elle est déclarée", () => {
    const etape = saisie({ reponse: "3.14", tolerance: 0.01 });
    expect(corrigerEtape(etape, "3.15").correcte).toBe(true);
    expect(corrigerEtape(etape, "3.2").correcte).toBe(false);
  });

  it("qualifie un écart numérique d'erreur de calcul", () => {
    expect(corrigerEtape(saisie(), "13")).toEqual({
      correcte: false,
      erreur: "CALCULATION_ERROR",
    });
  });

  it("ignore accents et casse sur une réponse textuelle", () => {
    const etape = saisie({ reponse: "Numérateur" });
    expect(corrigerEtape(etape, "numerateur").correcte).toBe(true);
  });

  it("n'invente aucune erreur sur une réponse textuelle fausse", () => {
    // On constate l'écart ; on ne devine pas sa cause.
    expect(corrigerEtape(saisie({ reponse: "numérateur" }), "diviseur")).toEqual({
      correcte: false,
      erreur: null,
    });
  });

  it("remonte l'erreur portée par le distracteur choisi", () => {
    expect(corrigerEtape(choix(), "a")).toEqual({
      correcte: false,
      erreur: "CONCEPTUAL_ERROR",
    });
    expect(corrigerEtape(choix(), "b")).toEqual({ correcte: true, erreur: null });
  });

  it("traite une réponse vide comme fausse, sans diagnostic", () => {
    expect(corrigerEtape(saisie(), "   ")).toEqual({ correcte: false, erreur: null });
  });
});

describe("corrigerEtape — remise en ordre", () => {
  it("exige la séquence exacte", () => {
    expect(corrigerEtape(ordre(), "a|b|c").correcte).toBe(true);
    expect(corrigerEtape(ordre(), "a|c|b").correcte).toBe(false);
  });

  it("n'accorde aucun crédit partiel", () => {
    // Trois éléments sur quatre bien placés, c'est une démarche qui, exécutée,
    // ne mène à rien : il n'y a pas de demi-raisonnement.
    const r = corrigerEtape(ordre(), "b|a|c");
    expect(r.correcte).toBe(false);
    expect(r.erreur).toBe("PROCEDURAL_ERROR");
  });
});

describe("corrigerEtape — appariement", () => {
  it("ignore l'ordre dans lequel les paires ont été formées", () => {
    // Deux élèves ayant apparié la même chose dans un ordre différent doivent
    // être notés pareil.
    expect(corrigerEtape(appariement(), "p1:p1|p2:p2|p3:p3").correcte).toBe(true);
    expect(corrigerEtape(appariement(), "p3:p3|p1:p1|p2:p2").correcte).toBe(true);
  });

  it("refuse un appariement partiel", () => {
    expect(corrigerEtape(appariement(), "p1:p1|p2:p3|p3:p2").correcte).toBe(false);
    expect(corrigerEtape(appariement(), "p1:p1|p2:p2").correcte).toBe(false);
  });
});

describe("parseStructure — formats composés", () => {
  it("accepte une remise en ordre dont la réponse permute les propositions", () => {
    expect(parseStructure({ etapes: [ordre()] })?.etapes[0].options).toHaveLength(3);
  });

  it("refuse un ordre attendu qui oublie une proposition", () => {
    expect(parseStructure({ etapes: [ordre({ reponse: "a|b" })] })).toBeNull();
  });

  it("refuse un ordre attendu qui nomme un élément étranger", () => {
    expect(parseStructure({ etapes: [ordre({ reponse: "a|b|z" })] })).toBeNull();
  });

  it("refuse des identifiants d'options en double", () => {
    const double = ordre({
      options: [
        { id: "a", texte: "un" },
        { id: "a", texte: "deux" },
      ],
      reponse: "a|a",
    });
    expect(parseStructure({ etapes: [double] })).toBeNull();
  });

  it("déduit la réponse d'un appariement de ses paires", () => {
    // L'auteur n'a rien à saisir : la réponse ne peut donc pas contredire les
    // paires.
    const sansReponse = { ...appariement() } as Record<string, unknown>;
    delete sansReponse.reponse;
    const lue = parseStructure({ etapes: [sansReponse] });
    expect(lue?.etapes[0].reponse).toBe("p1:p1|p2:p2|p3:p3");
  });

  it("refuse un appariement dont deux éléments de droite sont identiques", () => {
    // Deux appariements seraient également défendables : plus de bonne réponse.
    const ambigu = appariement({
      paires: [
        { id: "p1", gauche: "1/2", droite: "0,5" },
        { id: "p2", gauche: "2/4", droite: "0,50" },
        { id: "p3", gauche: "3/4", droite: "0,75" },
      ],
    });
    const encorePlusAmbigu = appariement({
      paires: [
        { id: "p1", gauche: "1/2", droite: "0,5" },
        { id: "p2", gauche: "2/4", droite: "0,5" },
      ],
    });
    expect(parseStructure({ etapes: [encorePlusAmbigu] })).toBeNull();
    // Les variantes d'écriture ne sont PAS traitées comme identiques : « 0,50 »
    // et « 0,5 » sont deux textes distincts pour l'appariement.
    expect(parseStructure({ etapes: [ambigu] })).not.toBeNull();
  });

  it("refuse un appariement à une seule paire", () => {
    expect(
      parseStructure({
        etapes: [appariement({ paires: [{ id: "p1", gauche: "a", droite: "b" }] })],
      })
    ).toBeNull();
  });
});

// ------------------------------------------------------------
// Barème dégressif
// ------------------------------------------------------------

describe("creditTentative", () => {
  it("décroît puis s'annule, ce qui rend le forçage inopérant", () => {
    expect(creditTentative(1)).toBe(1);
    expect(creditTentative(2)).toBe(0.5);
    expect(creditTentative(TENTATIVES_MAX)).toBe(0);
  });
});

// ------------------------------------------------------------
// Fiabilité de séance
// ------------------------------------------------------------

describe("fiabiliteSeance", () => {
  it("ne conclut rien sur trop peu d'étapes mesurées", () => {
    const etapes = [faite({ index: 0, dureeMs: 500 }), faite({ index: 1, dureeMs: 400 })];
    expect(fiabiliteSeance(etapes)).toEqual({ facteur: 1, motif: null });
  });

  it("dégrade la confiance sur un sans-faute anormalement rapide", () => {
    const etapes = [0, 1, 2, 3].map((i) => faite({ index: i, dureeMs: 800 }));
    const r = fiabiliteSeance(etapes);
    expect(r.facteur).toBeLessThan(1);
    expect(r.motif).toBe("seance_rythme_improbable");
  });

  it("ne signale rien quand une seule étape a demandé deux essais", () => {
    // Un élève qui se trompe puis corrige n'a rien copié : le doute tombe.
    const etapes = [
      faite({ index: 0, dureeMs: 800 }),
      faite({ index: 1, dureeMs: 800, tentatives: 2 }),
      faite({ index: 2, dureeMs: 800 }),
      faite({ index: 3, dureeMs: 800 }),
    ];
    expect(fiabiliteSeance(etapes)).toEqual({ facteur: 1, motif: null });
  });

  it("laisse passer un sans-faute d'un élève simplement appliqué", () => {
    const etapes = [0, 1, 2, 3].map((i) =>
      faite({ index: i, dureeMs: DUREE_MIN_ETAPE_MS * 4 })
    );
    expect(fiabiliteSeance(etapes)).toEqual({ facteur: 1, motif: null });
  });
});

describe("erreurDominante", () => {
  it("désigne l'erreur la plus fréquente", () => {
    const etapes = [
      faite({ index: 0, correcte: false, erreur: "CONCEPTUAL_ERROR" }),
      faite({ index: 1, correcte: false, erreur: "CALCULATION_ERROR" }),
      faite({ index: 2, correcte: false, erreur: "CONCEPTUAL_ERROR" }),
    ];
    expect(erreurDominante(etapes)).toBe("CONCEPTUAL_ERROR");
  });

  it("reste nul quand aucune erreur n'a été identifiée", () => {
    expect(erreurDominante([faite()])).toBeNull();
  });

  it("tranche les égalités de façon stable", () => {
    const etapes = [
      faite({ index: 0, correcte: false, erreur: "PROCEDURAL_ERROR" }),
      faite({ index: 1, correcte: false, erreur: "CALCULATION_ERROR" }),
    ];
    expect(erreurDominante(etapes)).toBe(erreurDominante([...etapes].reverse()));
  });
});

// ------------------------------------------------------------
// Projection élève — la propriété la plus importante du module
// ------------------------------------------------------------

const exercice = {
  id: "ex1",
  ordre: 1,
  palier: "APPLICATION",
  regleDeclenchee: "exercice_consolidation_fragile",
  motifParams: { competence: "Fractions" },
  competence: { libelle: "Fractions" },
  question: { enonce: "Calcule 1/3 + 1/4", format: "ETAPES_GUIDEES" as const },
};

describe("vueEleve", () => {
  const structure = parseStructure({
    etapes: [saisie({ indice: "Cherche un multiple commun" }), choix(), saisie({ reponse: "7" })],
  })!;

  it("ne révèle ni les étapes suivantes ni les réponses attendues", () => {
    const vue = vueEleve(exercice, structure, []);
    expect(vue.etapes).toHaveLength(1);
    expect(vue.etapes[0].corrige).toBeNull();
    expect(vue.etapeCourante).toBe(0);
    expect(vue.termine).toBe(false);

    const serialise = JSON.stringify(vue);
    expect(serialise).not.toContain("Cherche un multiple commun");
    // La bonne proposition ne doit pas être identifiable dans la charge utile.
    expect(vue.etapes[0].options).toBeUndefined();
  });

  it("retire l'annotation d'erreur des distracteurs", () => {
    const vue = vueEleve(exercice, structure, [faite({ index: 0 })]);
    const options = vue.etapes[1].options!;
    expect(options).toHaveLength(3);
    expect(JSON.stringify(options)).not.toContain("CONCEPTUAL_ERROR");
  });

  it("ne donne l'indice qu'après un échec", () => {
    const avant = vueEleve(exercice, structure, []);
    expect(avant.etapes[0].indice).toBeNull();

    const apres = vueEleve(exercice, structure, [
      faite({ index: 0, correcte: false, tentatives: 1, credit: 0 }),
    ]);
    expect(apres.etapes[0].indice).toBe("Cherche un multiple commun");
    // L'étape reste ouverte : il reste des essais.
    expect(apres.etapeCourante).toBe(0);
  });

  it("révèle le corrigé une fois l'étape close", () => {
    const vue = vueEleve(exercice, structure, [faite({ index: 0 })]);
    expect(vue.etapes[0].corrige).toBe("12");
    expect(vue.etapes[0].correcte).toBe(true);
  });

  it("ouvre l'étape suivante quand les tentatives sont épuisées", () => {
    const vue = vueEleve(exercice, structure, [
      faite({ index: 0, correcte: false, tentatives: TENTATIVES_MAX, credit: 0 }),
    ]);
    // L'exercice continue : l'élève voit la correction et passe à la suite.
    expect(vue.etapeCourante).toBe(1);
    expect(vue.etapes[0].corrige).toBe("12");
  });

  it("marque l'exercice terminé quand la dernière étape se referme", () => {
    const vue = vueEleve(exercice, structure, [
      faite({ index: 0 }),
      faite({ index: 1, reponse: "b" }),
      faite({ index: 2, reponse: "7" }),
    ]);
    expect(vue.termine).toBe(true);
    expect(vue.etapeCourante).toBe(3);
  });

  it("mélange les propositions d'une remise en ordre", () => {
    // La banque les stocke dans l'ordre correct : les servir tels quels
    // donnerait la solution. Cinq éléments, donc une coïncidence à 1/120.
    const cinq = parseStructure({
      etapes: [
        ordre({
          options: ["a", "b", "c", "d", "e"].map((id) => ({ id, texte: id.toUpperCase() })),
          reponse: "a|b|c|d|e",
        }),
      ],
    })!;
    // L'ordre s'observe sur les TEXTES : les identifiants servis sont opaques.
    const servi = vueEleve(exercice, cinq, []).etapes[0].options!.map((o) => o.texte);
    expect(servi.join("|")).not.toBe("A|B|C|D|E");
    expect([...servi].sort()).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("sert toujours le même ordre pour le même exercice", () => {
    // La vue est relue après chaque réponse : un ordre tiré au hasard ferait
    // sauter les éléments sous la main de l'élève.
    const s = parseStructure({ etapes: [ordre()] })!;
    const a = vueEleve(exercice, s, []).etapes[0].options!.map((o) => o.id);
    const b = vueEleve(exercice, s, []).etapes[0].options!.map((o) => o.id);
    expect(a).toEqual(b);
  });

  it("ne laisse aucun identifiant de la banque atteindre l'élève", () => {
    // La faille que ce test verrouille : des identifiants ordonnés et parlants
    // (`a, b, c`, `p1, p2, p3`) se lisent depuis l'onglet réseau. Trier ceux
    // d'une remise en ordre donnait la réponse ; relier les identifiants
    // identiques des deux colonnes d'un appariement donnait la réponse.
    for (const etape of [ordre(), appariement(), choix()]) {
      const s = parseStructure({ etapes: [etape] })!;
      const charge = JSON.stringify(vueEleve(exercice, s, []));
      for (const id of [
        ...(etape.options?.map((o) => o.id) ?? []),
        ...(etape.paires?.map((p) => p.id) ?? []),
      ]) {
        expect(charge).not.toContain(`"id":"${id}"`);
      }
    }
  });

  it("jetonne les deux colonnes d'un appariement séparément", () => {
    const s = parseStructure({ etapes: [appariement()] })!;
    const etape = vueEleve(exercice, s, []).etapes[0];
    expect(etape.gauche).toHaveLength(3);
    expect(etape.droite).toHaveLength(3);
    // Un jeton commun aux deux colonnes rendrait l'appariement lisible en
    // reliant les valeurs identiques.
    const jetonsGauche = new Set(etape.gauche!.map((g) => g.id));
    expect(etape.droite!.some((d) => jetonsGauche.has(d.id))).toBe(false);
  });

  it("retraduit les jetons de l'élève en identifiants de la banque", () => {
    const s = parseStructure({ etapes: [appariement()] })!;
    const etape = vueEleve(exercice, s, []).etapes[0];
    // L'élève relie chaque texte de gauche au bon texte de droite.
    const reponse = etape
      .gauche!.map((g) => {
        const attendu = { "1/2": "0,5", "1/4": "0,25", "3/4": "0,75" }[g.texte];
        return `${g.id}:${etape.droite!.find((d) => d.texte === attendu)!.id}`;
      })
      .join("|");

    const traduite = detokeniser(s.etapes[0], `${exercice.id}#0`, reponse);
    expect(corrigerEtape(s.etapes[0], traduite).correcte).toBe(true);
  });

  it("rejette une réponse fabriquée avec des identifiants devinés", () => {
    // Un client modifié qui enverrait « p1:p1|p2:p2|p3:p3 » — la forme interne
    // de la bonne réponse — ne doit rien obtenir : ce ne sont pas des jetons.
    const s = parseStructure({ etapes: [appariement()] })!;
    const traduite = detokeniser(s.etapes[0], `${exercice.id}#0`, "p1:p1|p2:p2|p3:p3");
    expect(corrigerEtape(s.etapes[0], traduite).correcte).toBe(false);
  });

  it("retraduit aussi une remise en ordre", () => {
    const s = parseStructure({ etapes: [ordre()] })!;
    const etape = vueEleve(exercice, s, []).etapes[0];
    const parTexte = new Map(etape.options!.map((o) => [o.texte, o.id]));
    const reponse = [
      "Réduire au même dénominateur",
      "Additionner les numérateurs",
      "Simplifier",
    ]
      .map((texte) => parTexte.get(texte)!)
      .join("|");

    const traduite = detokeniser(s.etapes[0], `${exercice.id}#0`, reponse);
    expect(traduite).toBe("a|b|c");
    expect(corrigerEtape(s.etapes[0], traduite).correcte).toBe(true);
  });

  it("rend le corrigé lisible plutôt qu'en identifiants", () => {
    const s = parseStructure({ etapes: [ordre()] })!;
    const vue = vueEleve(exercice, s, [
      faite({ index: 0, correcte: false, tentatives: TENTATIVES_MAX, credit: 0 }),
    ]);
    const corrige = vue.etapes[0].corrige!;
    // « a|b|c » n'apprendrait à l'élève que le fait d'avoir échoué.
    expect(corrige).not.toBe("a|b|c");
    expect(corrige).toContain("Réduire au même dénominateur");
  });

  it("rend lisible le corrigé d'un appariement", () => {
    const s = parseStructure({ etapes: [appariement()] })!;
    const vue = vueEleve(exercice, s, [
      faite({ index: 0, correcte: false, tentatives: TENTATIVES_MAX, credit: 0 }),
    ]);
    expect(vue.etapes[0].corrige).toContain("1/2 → 0,5");
  });

  it("transmet le motif en clé de traduction, jamais en phrase figée", () => {
    const vue = vueEleve(exercice, structure, []);
    expect(vue.regleDeclenchee).toBe("exercice_consolidation_fragile");
    expect(vue.motifParams).toEqual({ competence: "Fractions" });
  });
});

// ------------------------------------------------------------
// Nature de la preuve
// ------------------------------------------------------------

describe("evidenceTypeDeFeuille", () => {
  it("distingue le travail fait seul de celui passé en classe", () => {
    expect(evidenceTypeDeFeuille("entrainement")).toBe("AUTO_ENTRAINEMENT");
    expect(evidenceTypeDeFeuille("jalon")).toBe("EXERCICE");
    expect(evidenceTypeDeFeuille("diagnostic")).toBe("EXERCICE");
  });
});
