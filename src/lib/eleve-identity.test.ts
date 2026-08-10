import { describe, it, expect } from "vitest";
import {
  normalizeName,
  identityKey,
  classKey,
  isSimilarName,
  isSimilarIdentity,
  estDateApproximative,
  nameKey,
  detectDuplicates,
  isBlocking,
  type FicheEleve,
} from "@/lib/eleve-identity";

/**
 * Ces tests encodent le comportement qui aurait empêché les 78 fiches en
 * double : reconnaître qu'une ligne réimportée désigne une personne déjà
 * enregistrée, malgré un matricule différent.
 */

const eleve = (
  id: string,
  nom: string,
  prenom: string,
  date: string,
  classe?: string
): FicheEleve => ({
  id,
  nom,
  prenom,
  matricule: `M-${id}`,
  dateNaissance: new Date(date),
  classe: classe ? { nom: classe } : null,
});

describe("normalizeName", () => {
  it("neutralise casse, accents et espaces superflus", () => {
    expect(normalizeName("  DIÀLLO  ")).toBe("diallo");
    expect(normalizeName("Diallo")).toBe("diallo");
    expect(normalizeName("Élève")).toBe("eleve");
  });

  it("neutralise apostrophes et traits d'union", () => {
    expect(normalizeName("N'Diaye")).toBe("n diaye");
    expect(normalizeName("Jean-Pierre")).toBe("jean pierre");
  });
});

describe("identityKey", () => {
  it("rapproche deux écritures d'une même personne", () => {
    const a = identityKey({ nom: "MOKTAR DJAMA", prenom: "Arafat", dateNaissance: "2008-01-01" });
    const b = identityKey({ nom: "moktar  djama", prenom: "ARAFAT", dateNaissance: new Date("2008-01-01") });
    expect(a).toBe(b);
  });

  // Cas très fréquent : les colonnes nom et prénom sont interverties.
  it("résiste à l'inversion des colonnes nom et prénom", () => {
    const a = identityKey({ nom: "ADOCH ALI", prenom: "Mohamed", dateNaissance: "2008-01-01" });
    const b = identityKey({ nom: "Mohamed", prenom: "ADOCH ALI", dateNaissance: "2008-01-01" });
    expect(a).toBe(b);
  });

  it("distingue deux personnes nées à des dates différentes", () => {
    const a = identityKey({ nom: "Diallo", prenom: "Amadou", dateNaissance: "2008-01-01" });
    const b = identityKey({ nom: "Diallo", prenom: "Amadou", dateNaissance: "2009-05-12" });
    expect(a).not.toBe(b);
  });

  it("produit une clé incomplète sans date, pour ne rien apparier à tort", () => {
    expect(identityKey({ nom: "Diallo", prenom: "Amadou" }).endsWith("|")).toBe(true);
  });
});

describe("classKey", () => {
  it("rapproche sur la classe quand la date manque", () => {
    const a = classKey({ nom: "Diallo", prenom: "Amadou" }, "6ème A");
    const b = classKey({ nom: "DIALLO", prenom: "amadou" }, "6EME A");
    expect(a).toBe(b);
  });
});

describe("isSimilarName", () => {
  it("rapproche des variantes orthographiques courantes", () => {
    expect(isSimilarName(nameKey({ nom: "Mohamed", prenom: "Ali" }), nameKey({ nom: "Mohammed", prenom: "Ali" }))).toBe(true);
  });

  it("ne rapproche pas deux noms réellement différents", () => {
    expect(isSimilarName("diallo amadou", "traore fatou")).toBe(false);
    expect(isSimilarName("sow", "ba")).toBe(false);
  });
});

describe("isSimilarIdentity", () => {
  const d = "2010-05-05";

  it("rapproche une coquille sur le nom, à date de naissance identique", () => {
    expect(
      isSimilarIdentity(
        { nom: "Mohamed", prenom: "Ali", dateNaissance: d },
        { nom: "Mohammed", prenom: "Ali", dateNaissance: d }
      )
    ).toBe(true);
  });

  // Régression tirée des données réelles : deux frères partagent le patronyme
  // « AHMED MOHAMED » et seuls leurs prénoms et dates les distinguent. Les
  // chaînes complètes ne diffèrent que de 3 caractères sur 20 — comparer les
  // identités concaténées les fusionnait à tort.
  it("ne confond pas deux élèves partageant le nom de famille", () => {
    expect(
      isSimilarIdentity(
        { nom: "AHMED MOHAMED", prenom: "SAID", dateNaissance: "2008-01-01" },
        { nom: "AHMED MOHAMED", prenom: "KHALID", dateNaissance: "2012-09-09" }
      )
    ).toBe(false);
  });

  it("refuse tout rapprochement quand les dates diffèrent", () => {
    expect(
      isSimilarIdentity(
        { nom: "Mohamed", prenom: "Ali", dateNaissance: "2010-05-05" },
        { nom: "Mohammed", prenom: "Ali", dateNaissance: "2011-05-05" }
      )
    ).toBe(false);
  });

  it("refuse tout rapprochement en l'absence de date", () => {
    expect(isSimilarIdentity({ nom: "Mohamed", prenom: "Ali" }, { nom: "Mohammed", prenom: "Ali" })).toBe(false);
  });

  it("tolère l'inversion des colonnes nom et prénom", () => {
    expect(
      isSimilarIdentity(
        { nom: "Mohamed", prenom: "Ali", dateNaissance: d },
        { nom: "Ali", prenom: "Mohammed", dateNaissance: d }
      )
    ).toBe(true);
  });
});

describe("detectDuplicates", () => {
  it("regroupe les réimports d'un même élève malgré des matricules distincts", () => {
    const fiches = [
      eleve("1", "MOKTAR DJAMA", "Arafat", "2008-01-01", "9ème1"),
      eleve("2", "MOKTAR DJAMA", "Arafat", "2008-01-01", "9ème1"),
      eleve("3", "MOKTAR DJAMA", "Arafat", "2008-01-01", "9ème1"),
      eleve("4", "Diallo", "Fatou", "2009-03-02", "9ème1"),
    ];
    const groupes = detectDuplicates(fiches);
    expect(groupes).toHaveLength(1);
    expect(groupes[0].level).toBe("IDENTITE");
    expect(groupes[0].fiches.map((f) => f.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("ne signale rien quand toutes les fiches sont distinctes", () => {
    const fiches = [
      eleve("1", "Diallo", "Amadou", "2008-01-01", "6A"),
      eleve("2", "Traore", "Fatou", "2009-02-02", "6A"),
    ];
    expect(detectDuplicates(fiches)).toEqual([]);
  });

  // Deux jumeaux partagent nom et date de naissance : seul le prénom diffère.
  // La clé d'identité les distingue, ils ne doivent pas être fusionnés.
  it("ne confond pas deux jumeaux d'une même classe", () => {
    const fiches = [
      eleve("1", "Diallo", "Amadou", "2010-06-01", "6A"),
      eleve("2", "Diallo", "Aminata", "2010-06-01", "6A"),
    ];
    expect(detectDuplicates(fiches)).toEqual([]);
  });

  it("ne classe un élève que dans un seul groupe, au niveau le plus sûr", () => {
    const fiches = [
      eleve("1", "Mohamed", "Ali", "2008-01-01", "6A"),
      eleve("2", "Mohamed", "Ali", "2008-01-01", "6A"),
      eleve("3", "Mohammed", "Ali", "2011-09-09", "6A"),
    ];
    const groupes = detectDuplicates(fiches);
    const ids = groupes.flatMap((g) => g.fiches.map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(groupes[0].level).toBe("IDENTITE");
  });
});

describe("isBlocking", () => {
  it("ne bloque que sur le matricule, les autres niveaux avertissent", () => {
    expect(isBlocking("MATRICULE")).toBe(true);
    expect(isBlocking("IDENTITE")).toBe(false);
    expect(isBlocking("CLASSE")).toBe(false);
    expect(isBlocking("APPROCHE")).toBe(false);
  });
});

describe("estDateApproximative", () => {
  // Le 1er janvier est la date de repli universelle quand la vraie est
  // inconnue : 76 élèves de la base réelle portent ainsi le 01/01/2008.
  it("signale un 1er janvier, quelle que soit l'année", () => {
    expect(estDateApproximative("2008-01-01")).toBe(true);
    expect(estDateApproximative("2013-01-01")).toBe(true);
    expect(estDateApproximative(new Date("2010-01-01"))).toBe(true);
  });

  it("ne signale pas une date ordinaire", () => {
    expect(estDateApproximative("2009-04-05")).toBe(false);
    expect(estDateApproximative("2012-09-09")).toBe(false);
    // Le 1er d'un autre mois n'a rien de suspect.
    expect(estDateApproximative("2009-02-01")).toBe(false);
  });

  it("ne signale rien en l'absence de date", () => {
    expect(estDateApproximative(null)).toBe(false);
    expect(estDateApproximative(undefined)).toBe(false);
    expect(estDateApproximative("pas une date")).toBe(false);
  });
});
