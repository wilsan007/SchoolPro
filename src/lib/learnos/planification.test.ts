import { describe, it, expect } from "vitest";
import {
  semaineScolaire,
  datesDeLaSemaine,
  nombreDeSemaines,
  repartirEgalement,
  detecterAnomalies,
  decalerAPartirDe,
  ecartsDePlanification,
  calendrierHebdomadaire,
  semainesEnseignees,
  repartirCompetences,
  plageEffectiveCompetence,
  type EvenementCalendaire,
} from "@/lib/learnos/planification";

const RENTREE = new Date("2025-09-01T00:00:00Z");

describe("semaines de l'année scolaire", () => {
  // « Semaine 12 » parle à un enseignant ; « semaine ISO 47 » ne dit rien, et
  // une année scolaire chevauche deux années civiles.
  it("compte à partir de la rentrée, pas du 1er janvier", () => {
    expect(semaineScolaire(RENTREE, RENTREE)).toBe(1);
    expect(semaineScolaire(new Date("2025-09-08T00:00:00Z"), RENTREE)).toBe(2);
    expect(semaineScolaire(new Date("2026-01-05T00:00:00Z"), RENTREE)).toBe(19);
  });

  it("ne descend jamais sous la semaine 1", () => {
    expect(semaineScolaire(new Date("2025-08-01T00:00:00Z"), RENTREE)).toBe(1);
  });

  it("retrouve les dates d'une semaine donnée", () => {
    const { debut, fin } = datesDeLaSemaine(3, RENTREE);
    expect(debut.toISOString().slice(0, 10)).toBe("2025-09-15");
    expect(fin.toISOString().slice(0, 10)).toBe("2025-09-21");
  });

  it("mesure la durée de l'année", () => {
    expect(nombreDeSemaines(RENTREE, new Date("2026-06-30T00:00:00Z"))).toBe(44);
  });
});

describe("répartition automatique", () => {
  // Sans elle, personne ne saisirait 15 chapitres × 8 matières × 5 niveaux :
  // l'écran resterait vide et toute la chaîne d'anticipation avec.
  it("couvre toutes les semaines sans trou ni chevauchement", () => {
    const r = repartirEgalement(["a", "b", "c", "d"], 36);

    expect(r[0].semaineDebut).toBe(1);
    expect(r[r.length - 1].semaineFin).toBe(36);
    for (let i = 0; i < r.length - 1; i++) {
      expect(r[i + 1].semaineDebut).toBe(r[i].semaineFin + 1);
    }
  });

  // Un retard pris en début d'année ne se rattrape pas : les fondamentaux
  // reçoivent la semaine supplémentaire.
  it("donne le reliquat aux premiers chapitres", () => {
    const r = repartirEgalement(["a", "b", "c"], 10); // 3 + 1 de reste
    const durees = r.map((x) => x.semaineFin - x.semaineDebut + 1);
    expect(durees).toEqual([4, 3, 3]);
  });

  it("ne descend jamais sous une semaine par chapitre", () => {
    const r = repartirEgalement(["a", "b", "c", "d", "e"], 3);
    expect(r.every((x) => x.semaineFin >= x.semaineDebut)).toBe(true);
  });

  it("ne produit rien sans chapitre", () => {
    expect(repartirEgalement([], 36)).toEqual([]);
  });
});

describe("détection d'anomalies", () => {
  const ligne = (nom: string, debut: number, fin: number) => ({
    chapitreId: nom, nom, semaineDebut: debut, semaineFin: fin,
  });

  it("ne signale rien sur un calendrier continu", () => {
    expect(detecterAnomalies([ligne("A", 1, 10), ligne("B", 11, 20)], 20)).toEqual([]);
  });

  // Ce sont les deux défauts qu'un tableau de dates cache et qu'une frise
  // rend évidents.
  it("repère un trou entre deux chapitres", () => {
    const a = detecterAnomalies([ligne("A", 1, 5), ligne("B", 9, 20)], 20);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ type: "trou", semaineDebut: 6, semaineFin: 8 });
  });

  it("repère un trou en début d'année", () => {
    const a = detecterAnomalies([ligne("A", 4, 20)], 20);
    expect(a[0]).toMatchObject({ type: "trou", semaineDebut: 1, semaineFin: 3 });
  });

  it("repère une fin d'année non couverte", () => {
    const a = detecterAnomalies([ligne("A", 1, 15)], 20);
    expect(a[0]).toMatchObject({ type: "trou", semaineDebut: 16, semaineFin: 20 });
  });

  it("repère deux chapitres menés en parallèle, et les nomme", () => {
    const a = detecterAnomalies([ligne("A", 1, 12), ligne("B", 8, 20)], 20);
    const chevauchement = a.find((x) => x.type === "chevauchement");
    expect(chevauchement).toMatchObject({ semaineDebut: 8, semaineFin: 12 });
    expect(chevauchement?.chapitres).toEqual(["A", "B"]);
  });

  it("ne signale rien quand rien n'est planifié", () => {
    expect(detecterAnomalies([], 36)).toEqual([]);
  });
});

describe("décalage en cours d'année", () => {
  const p = (id: string, d: number, f: number) => ({ chapitreId: id, semaineDebut: d, semaineFin: f });

  // Un enseignant en retard ne ressaisira pas dix lignes : sans cette
  // opération, la planification serait abandonnée dès la première semaine de
  // retard — et l'anticipation avec elle.
  it("décale le chapitre visé ET tous les suivants", () => {
    const r = decalerAPartirDe([p("A", 1, 5), p("B", 6, 10), p("C", 11, 15)], "B", 2, 36);

    expect(r).toHaveLength(2); // A n'est pas touché
    expect(r[0]).toMatchObject({ chapitreId: "B", semaineDebut: 8, semaineFin: 12 });
    expect(r[1]).toMatchObject({ chapitreId: "C", semaineDebut: 13, semaineFin: 17 });
  });

  it("permet aussi d'avancer la suite", () => {
    const r = decalerAPartirDe([p("A", 5, 10), p("B", 11, 15)], "A", -2, 36);
    expect(r[0].semaineDebut).toBe(3);
  });

  // Le dépassement reste visible comme un chapitre collé à la fin : c'est
  // exactement le signal qu'il faut alléger le programme.
  it("borne le décalage à l'année scolaire", () => {
    const r = decalerAPartirDe([p("A", 30, 34)], "A", 10, 36);
    expect(r[0].semaineDebut).toBe(36);
    expect(r[0].semaineFin).toBe(36);
  });

  it("ne fait rien pour un chapitre inconnu ou un décalage nul", () => {
    expect(decalerAPartirDe([p("A", 1, 5)], "Z", 2, 36)).toEqual([]);
    expect(decalerAPartirDe([p("A", 1, 5)], "A", 0, 36)).toEqual([]);
  });
});

describe("écart entre plan initial et plan courant", () => {
  // Sans plan initial figé, un enseignant en retard décalerait ses dates et le
  // système conclurait que tout va bien.
  it("ne signale rien quand le plan n'a pas bougé", () => {
    expect(
      ecartsDePlanification([
        { chapitreId: "A", nom: "A", semaineDebut: 5, semaineDebutInitiale: 5, statut: "PREVU" },
      ])
    ).toEqual([]);
  });

  it("mesure le retard pris sur le plan d'origine", () => {
    const e = ecartsDePlanification([
      { chapitreId: "A", nom: "Fractions", semaineDebut: 8, semaineDebutInitiale: 5, statut: "EN_COURS" },
      { chapitreId: "B", nom: "Équations", semaineDebut: 14, semaineDebutInitiale: 10, statut: "PREVU" },
    ]);
    expect(e[0]).toMatchObject({ nom: "Équations", semainesDeRetard: 4 });
    expect(e[1]).toMatchObject({ nom: "Fractions", semainesDeRetard: 3 });
  });

  it("ignore un chapitre sans plan initial connu", () => {
    expect(
      ecartsDePlanification([
        { chapitreId: "A", nom: "A", semaineDebut: 9, semaineDebutInitiale: null, statut: "PREVU" },
      ])
    ).toEqual([]);
  });
});

describe("calendrier scolaire", () => {
  // Vacances de la Toussaint : semaines 8-9 (20 oct → 2 nov 2025)
  const VACANCES_TOUSSAINT: EvenementCalendaire = {
    type: "VACANCE_SCOLAIRE",
    dateDebut: new Date("2025-10-20T00:00:00Z"),
    dateFin: new Date("2025-11-02T00:00:00Z"),
  };
  // Examen blanc : 15 déc 2025 = semaine 16 (8 déc = S15, 15 déc = S16)
  const EXAMEN_BLANC: EvenementCalendaire = {
    type: "EXAMEN",
    dateDebut: new Date("2025-12-15T00:00:00Z"),
    dateFin: new Date("2025-12-21T00:00:00Z"),
  };
  // Jour férié : 11 nov 2025 (semaine 11)
  const JOUR_FERIE: EvenementCalendaire = {
    type: "JOUR_FERIE",
    dateDebut: new Date("2025-11-11T00:00:00Z"),
    dateFin: new Date("2025-11-11T00:00:00Z"),
  };

  const evenements = [VACANCES_TOUSSAINT, EXAMEN_BLANC, JOUR_FERIE];

  it("marque les semaines de vacances comme non enseignées", () => {
    const cal = calendrierHebdomadaire(RENTREE, 44, evenements);
    // Toussaint : semaines 8 et 9
    expect(cal[7].enseignee).toBe(false);
    expect(cal[7].evenement).toBe("VACANCE_SCOLAIRE");
    expect(cal[8].enseignee).toBe(false);
    expect(cal[8].evenement).toBe("VACANCE_SCOLAIRE");
  });

  it("marque les semaines d'examen comme non enseignées", () => {
    const cal = calendrierHebdomadaire(RENTREE, 44, evenements);
    // Examen : 15 déc = semaine 16 (index 15)
    expect(cal[15].enseignee).toBe(false);
    expect(cal[15].evenement).toBe("EXAMEN");
  });

  it("marque les jours fériés", () => {
    const cal = calendrierHebdomadaire(RENTREE, 44, evenements);
    // 11 nov = semaine 11 (semaine du 10 au 16 nov)
    expect(cal[10].enseignee).toBe(false);
    expect(cal[10].evenement).toBe("JOUR_FERIE");
  });

  it("laisse les semaines de cours normales comme enseignées", () => {
    const cal = calendrierHebdomadaire(RENTREE, 44, evenements);
    expect(cal[0].enseignee).toBe(true); // semaine 1
    expect(cal[0].evenement).toBe(null);
    expect(cal[5].enseignee).toBe(true); // semaine 6
  });

  it("donne la priorité aux vacances sur les jours fériés", () => {
    // Si une vacance et un jour férié chevauchent la même semaine, c'est la
    // vacance qui l'emporte : elle couvre toute la semaine.
    const cal = calendrierHebdomadaire(RENTREE, 44, [
      { type: "JOUR_FERIE", dateDebut: new Date("2025-10-22T00:00:00Z"), dateFin: new Date("2025-10-22T00:00:00Z") },
      VACANCES_TOUSSAINT,
    ]);
    expect(cal[7].evenement).toBe("VACANCE_SCOLAIRE");
  });

  it("produit la liste des semaines enseignées", () => {
    const enseignees = semainesEnseignees(RENTREE, 44, evenements);
    // 44 semaines - 2 (Toussaint S8-S9) - 1 (examen S16) - 1 (jour férié S11) = 40
    expect(enseignees).toHaveLength(40);
    expect(enseignees).not.toContain(8);
    expect(enseignees).not.toContain(9);
    expect(enseignees).not.toContain(16);
    expect(enseignees).not.toContain(11);
    expect(enseignees).toContain(1);
    expect(enseignees).toContain(44);
  });
});

describe("répartition avec vacances", () => {
  const VACANCES: EvenementCalendaire[] = [
    { type: "VACANCE_SCOLAIRE", dateDebut: new Date("2025-10-20T00:00:00Z"), dateFin: new Date("2025-11-02T00:00:00Z") },
  ];
  const enseignees = semainesEnseignees(RENTREE, 44, VACANCES);
  // 44 - 2 (Toussaint) = 42 semaines enseignées

  it("ne place aucun chapitre sur une semaine de vacances", () => {
    const r = repartirEgalement(["a", "b", "c", "d"], 44, 1, enseignees);

    // Les bornes de chaque chapitre sont des semaines enseignées :
    // un chapitre ne commence ni ne finit pendant les vacances.
    for (const chap of r) {
      expect(enseignees).toContain(chap.semaineDebut);
      expect(enseignees).toContain(chap.semaineFin);
    }
  });

  it("couvre toutes les semaines enseignées sans trou", () => {
    const r = repartirEgalement(["a", "b", "c", "d"], 44, 1, enseignees);

    // Le premier chapitre commence à la première semaine enseignée.
    expect(r[0].semaineDebut).toBe(1);
    // Le dernier chapitre finit à la dernière semaine enseignée.
    expect(r[r.length - 1].semaineFin).toBe(enseignees[enseignees.length - 1]);
  });

  it("donne le reliquat aux premiers chapitres", () => {
    // 42 semaines enseignées, 4 chapitres : 10 chacun + 2 de reste.
    // Les durées se mesurent en semaines enseignées, pas en numéros bruts :
    // le chapitre "a" couvre les semaines 1-13 mais 8 et 9 sont des vacances,
    // soit 11 semaines d'enseignement effectif.
    const r = repartirEgalement(["a", "b", "c", "d"], 44, 1, enseignees);
    const dureesEffectives = r.map((x) =>
      enseignees.filter((s) => s >= x.semaineDebut && s <= x.semaineFin).length
    );
    expect(dureesEffectives).toEqual([11, 11, 10, 10]);
  });

  it("reste compatible avec le mode legacy sans vacances", () => {
    // Sans le 4e argument, la répartition se fait sur le continuum.
    const r = repartirEgalement(["a", "b"], 10);
    expect(r[0].semaineDebut).toBe(1);
    expect(r[1].semaineFin).toBe(10);
  });
});

describe("répartition des compétences dans un chapitre", () => {
  it("répartit N compétences sur N semaines, une par semaine", () => {
    const r = repartirCompetences(["c1", "c2", "c3"], 3, 5);
    expect(r).toEqual([
      { competenceId: "c1", semaineDebut: 3, semaineFin: 3 },
      { competenceId: "c2", semaineDebut: 4, semaineFin: 4 },
      { competenceId: "c3", semaineDebut: 5, semaineFin: 5 },
    ]);
  });

  it("donne le reliquat aux premières compétences", () => {
    // 4 semaines pour 3 compétences : 2 + 1 + 1
    const r = repartirCompetences(["c1", "c2", "c3"], 3, 6);
    expect(r).toEqual([
      { competenceId: "c1", semaineDebut: 3, semaineFin: 4 },
      { competenceId: "c2", semaineDebut: 5, semaineFin: 5 },
      { competenceId: "c3", semaineDebut: 6, semaineFin: 6 },
    ]);
  });

  it("regroupe les compétences quand il y en a plus que de semaines", () => {
    // 2 semaines pour 4 compétences : 2 + 2
    const r = repartirCompetences(["c1", "c2", "c3", "c4"], 3, 4);
    expect(r).toEqual([
      { competenceId: "c1", semaineDebut: 3, semaineFin: 3 },
      { competenceId: "c2", semaineDebut: 3, semaineFin: 3 },
      { competenceId: "c3", semaineDebut: 4, semaineFin: 4 },
      { competenceId: "c4", semaineDebut: 4, semaineFin: 4 },
    ]);
  });

  it("place tout sur une seule semaine si le chapitre dure une semaine", () => {
    const r = repartirCompetences(["c1", "c2", "c3"], 5, 5);
    expect(r).toEqual([
      { competenceId: "c1", semaineDebut: 5, semaineFin: 5 },
      { competenceId: "c2", semaineDebut: 5, semaineFin: 5 },
      { competenceId: "c3", semaineDebut: 5, semaineFin: 5 },
    ]);
  });

  it("retourne un tableau vide sans compétences", () => {
    expect(repartirCompetences([], 3, 6)).toEqual([]);
  });

  it("respecte les semaines enseignées (saute les vacances)", () => {
    // Chapitre sur semaines 3-6, mais semaine 4 = vacances.
    const enseignees = [1, 2, 3, 5, 6, 7, 8];
    const r = repartirCompetences(["c1", "c2", "c3"], 3, 6, enseignees);
    // Semaines disponibles : 3, 5, 6 → une compétence par semaine
    expect(r).toEqual([
      { competenceId: "c1", semaineDebut: 3, semaineFin: 3 },
      { competenceId: "c2", semaineDebut: 5, semaineFin: 5 },
      { competenceId: "c3", semaineDebut: 6, semaineFin: 6 },
    ]);
  });

  it("tombe sur le continuum si aucune semaine enseignée dans la plage", () => {
    const enseignees = [1, 2, 10, 11]; // Aucune dans 3-6
    const r = repartirCompetences(["c1", "c2"], 3, 6, enseignees);
    // Doit utiliser le continuum 3-6
    expect(r[0].semaineDebut).toBe(3);
    expect(r[1].semaineFin).toBe(6);
  });
});

describe("plage effective d'une compétence", () => {
  it("utilise la planification explicite si elle existe", () => {
    const plage = plageEffectiveCompetence("c1", { debut: 3, fin: 6 }, [
      { competenceId: "c1", semaineDebut: 4, semaineFin: 5 },
    ]);
    expect(plage).toEqual({ debut: 4, fin: 5 });
  });

  it("hérite de la plage du chapitre sans planification explicite", () => {
    const plage = plageEffectiveCompetence("c2", { debut: 3, fin: 6 }, [
      { competenceId: "c1", semaineDebut: 4, semaineFin: 5 },
    ]);
    expect(plage).toEqual({ debut: 3, fin: 6 });
  });

  it("hérite quand aucune planification n'existe", () => {
    const plage = plageEffectiveCompetence("c1", { debut: 1, fin: 3 }, []);
    expect(plage).toEqual({ debut: 1, fin: 3 });
  });
});
