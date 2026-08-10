import { describe, it, expect } from "vitest";
import {
  analyzeImport,
  matriculeGenerator,
  parseDate,
  type FicheExistante,
  type ParsedRow,
} from "@/lib/import-eleves";

/**
 * Scénario de référence : le réimport d'un même fichier ne doit plus rien
 * dupliquer. C'est exactement ce qui a produit 78 fiches en trop.
 */

const ligne = (n: number, over: Partial<ParsedRow> = {}): ParsedRow => ({
  ligne: n,
  nom: "MOKTAR DJAMA",
  prenom: "Arafat",
  classe: "9ème1",
  niveau: "9",
  dateNaissance: "2008-01-01",
  ...over,
});

const fiche = (over: Partial<FicheExistante> = {}): FicheExistante => ({
  id: "e1",
  matricule: "2026-0194",
  nom: "MOKTAR DJAMA",
  prenom: "Arafat",
  dateNaissance: new Date("2008-01-01"),
  classeNom: "9ème1",
  archive: false,
  ...over,
});

const classes = new Set(["9eme1", "6eme a"]);
const analyse = (rows: ParsedRow[], existants: FicheExistante[] = []) =>
  analyzeImport(rows, [], existants, classes, "hash-test");

describe("analyzeImport — réimport", () => {
  it("propose une mise à jour au lieu d'une création quand l'élève existe déjà", () => {
    const plan = analyse([ligne(2)], [fiche()]);
    expect(plan.lignes[0].verdict).toBe("DOUBLON_IDENTITE");
    expect(plan.lignes[0].action).toBe("METTRE_A_JOUR");
    expect(plan.lignes[0].existant?.matricule).toBe("2026-0194");
    expect(plan.resume.aCreer).toBe(0);
  });

  // Le cœur du défaut : le matricule du fichier différait à chaque réimport,
  // donc le contrôle ne se déclenchait jamais. L'identité, elle, ne change pas.
  it("reconnaît l'élève même si le fichier porte un matricule différent", () => {
    const plan = analyse([ligne(2, { matricule: "2026-0999" })], [fiche()]);
    expect(plan.lignes[0].verdict).toBe("DOUBLON_IDENTITE");
    expect(plan.lignes[0].action).toBe("METTRE_A_JOUR");
  });

  it("crée bien un élève réellement nouveau", () => {
    const plan = analyse([ligne(2, { nom: "Diallo", prenom: "Fatou", dateNaissance: "2009-04-05" })], [fiche()]);
    expect(plan.lignes[0].verdict).toBe("NOUVEAU");
    expect(plan.lignes[0].action).toBe("CREER");
    expect(plan.resume.aCreer).toBe(1);
  });

  it("signale qu'une fiche archivée sera restaurée plutôt que dupliquée", () => {
    const plan = analyse([ligne(2)], [fiche({ archive: true })]);
    expect(plan.lignes[0].action).toBe("METTRE_A_JOUR");
    expect(plan.lignes[0].message).toContain("restaurée");
  });
});

describe("analyzeImport — doublons internes au fichier", () => {
  it("n'importe qu'une fois un élève répété dans le même fichier", () => {
    const plan = analyse([ligne(2), ligne(3), ligne(4)]);
    expect(plan.lignes[0].verdict).toBe("NOUVEAU");
    expect(plan.lignes[1].verdict).toBe("DOUBLON_FICHIER");
    expect(plan.lignes[2].verdict).toBe("DOUBLON_FICHIER");
    expect(plan.lignes[1].message).toContain("ligne 2");
    expect(plan.resume.aCreer).toBe(1);
    expect(plan.resume.aIgnorer).toBe(2);
  });
});

describe("analyzeImport — date de naissance", () => {
  // Sans date, aucune identification fiable n'est possible : c'est la valeur
  // par défaut « 2008-01-01 » qui avait rendu 269 élèves indiscernables.
  it("refuse une ligne sans date de naissance au lieu d'en inventer une", () => {
    const plan = analyse([ligne(2, { dateNaissance: undefined })]);
    expect(plan.lignes[0].verdict).toBe("ERREUR");
    expect(plan.lignes[0].action).toBe("IGNORER");
    expect(plan.lignes[0].message).toContain("obligatoire");
  });

  // Régression : `new Date("05/04/2009")` lit la date à l'américaine et
  // renvoie le 4 mai. Une date sur deux aurait été enregistrée fausse, en
  // silence — et juste pour les jours supérieurs à 12.
  it("lit JJ/MM/AAAA à la française, pas à l'américaine", () => {
    const d = parseDate("05/04/2009");
    expect(d?.toISOString().slice(0, 10)).toBe("2009-04-05");
    expect(parseDate("31/12/2008")?.toISOString().slice(0, 10)).toBe("2008-12-31");
  });

  it("accepte le format ISO et rejette le reste", () => {
    expect(parseDate("2009-04-05")?.getFullYear()).toBe(2009);
    expect(parseDate("pas une date")).toBeNull();
    expect(parseDate("32/01/2009")).toBeNull();
    expect(parseDate("05/13/2009")).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });
});

describe("analyzeImport — homonymes", () => {
  it("ignore par défaut un homonyme de la même classe, sans le rejeter définitivement", () => {
    const plan = analyse(
      [ligne(2, { dateNaissance: "2010-10-10" })],
      [fiche({ dateNaissance: new Date("2008-01-01") })]
    );
    expect(plan.lignes[0].verdict).toBe("DOUBLON_CLASSE");
    expect(plan.lignes[0].action).toBe("IGNORER");
  });

  // Coquille probable : même date de naissance, une lettre d'écart sur le nom.
  it("crée mais signale une orthographe proche, à date identique", () => {
    const plan = analyse(
      [ligne(2, { nom: "Mohammed", prenom: "Ali", classe: "6ème A", dateNaissance: "2011-01-01" })],
      [fiche({ nom: "Mohamed", prenom: "Ali", dateNaissance: new Date("2011-01-01"), classeNom: "6ème B" })]
    );
    expect(plan.lignes[0].verdict).toBe("DOUBLON_APPROCHE");
    expect(plan.lignes[0].action).toBe("CREER");
  });

  // Deux frères, même patronyme, dates différentes : aucun rapprochement.
  it("ne signale rien entre deux élèves de même nom de famille nés à des dates différentes", () => {
    const plan = analyse(
      [ligne(2, { nom: "AHMED MOHAMED", prenom: "KHALID", classe: "6ème A", dateNaissance: "2012-09-09" })],
      [fiche({ nom: "AHMED MOHAMED", prenom: "SAID", dateNaissance: new Date("2008-01-01"), classeNom: "8ème2" })]
    );
    expect(plan.lignes[0].verdict).toBe("NOUVEAU");
    expect(plan.lignes[0].action).toBe("CREER");
  });
});

describe("analyzeImport — résumé", () => {
  it("annonce les classes qui seront créées", () => {
    const plan = analyse([ligne(2, { classe: "Terminale S", dateNaissance: "2007-02-02" })]);
    expect(plan.classesInconnues).toEqual(["Terminale S"]);
    expect(plan.lignes[0].message).toContain("sera créée");
  });
});

describe("matriculeGenerator", () => {
  // `count()` régressait après une suppression et réattribuait un numéro déjà
  // émis ; il repartait aussi plus haut à chaque réimport.
  it("reprend après le dernier matricule émis", () => {
    const suivant = matriculeGenerator(2026, "2026-0276");
    expect(suivant()).toBe("2026-0277");
    expect(suivant()).toBe("2026-0278");
  });

  it("démarre à 0001 quand l'année n'a encore aucun matricule", () => {
    expect(matriculeGenerator(2026, null)()).toBe("2026-0001");
    expect(matriculeGenerator(2026, "2025-0500")()).toBe("2026-0001");
  });

  it("ne recycle jamais un numéro, même après des suppressions", () => {
    // 78 fiches archivées : le dernier émis reste la référence.
    const suivant = matriculeGenerator(2026, "2026-0276");
    expect(suivant()).toBe("2026-0277");
  });
});
