import { describe, expect, it, vi } from "vitest";
import {
  appliquerImport,
  decouperEnTranches,
  extraireJson,
  fusionnerChapitres,
  nettoyerTexte,
  normaliserStructure,
  type ChapitreImporte,
  type PrismaImport,
} from "@/lib/learnos/import-programme";

describe("nettoyage du texte", () => {
  it("retire les en-têtes répétés à chaque page", () => {
    // Ils mangent le budget de caractères et le modèle les prend pour des
    // titres de chapitre.
    const brut = [
      "MINISTÈRE DE L'ÉDUCATION",
      "Chapitre 1 : Les fractions",
      "MINISTÈRE DE L'ÉDUCATION",
      "Chapitre 2 : Les équations",
      "MINISTÈRE DE L'ÉDUCATION",
      "Chapitre 3 : La proportionnalité",
      "MINISTÈRE DE L'ÉDUCATION",
    ].join("\n");

    const propre = nettoyerTexte(brut);
    expect(propre).not.toContain("MINISTÈRE");
    expect(propre).toContain("Les fractions");
  });

  it("retire les numéros de page isolés", () => {
    expect(nettoyerTexte("Les fractions\n12\nLes équations")).toBe(
      "Les fractions\nLes équations"
    );
  });

  it("garde une ligne répétée moins de quatre fois", () => {
    // Un intitulé qui revient deux fois peut être un vrai contenu.
    const brut = "Compétences visées\nA\nCompétences visées\nB";
    expect(nettoyerTexte(brut)).toContain("Compétences visées");
  });
});

describe("extraction du JSON", () => {
  it("récupère le tableau malgré le bavardage du modèle", () => {
    expect(extraireJson('Voici :\n```json\n[{"nom":"A"}]\n```')).toEqual([{ nom: "A" }]);
  });

  it("renvoie un tableau vide sur du JSON invalide", () => {
    expect(extraireJson("[{cassé")).toEqual([]);
    expect(extraireJson(null)).toEqual([]);
  });
});

describe("normalisation de la structure", () => {
  /** Document de référence : tout « lu » est vérifié contre lui. */
  const SOURCE =
    "Chapitre 1 — Les fractions\n" +
    "L'élève doit savoir additionner deux fractions de dénominateurs différents.";

  const chapitre = (surcharge: Record<string, unknown> = {}) => ({
    nom: "Les fractions",
    niveau: "5ème",
    origine: "lu",
    extrait: "Chapitre 1 — Les fractions",
    competences: [
      {
        code: "MA-1",
        libelle: "Additionner deux fractions",
        origine: "lu",
        extrait: "additionner deux fractions de dénominateurs différents",
      },
    ],
    ...surcharge,
  });

  const normaliser = (brutes: unknown[], niveau = "6ème") =>
    normaliserStructure(brutes, niveau, "MATH", SOURCE);

  it("reconnaît comme cité ce qui figure dans le document", () => {
    const [c] = normaliser([chapitre()]);
    expect(c.origine).toBe("lu");
    expect(c.extrait).toBe("Chapitre 1 — Les fractions");
    expect(c.competences[0].origine).toBe("lu");
  });

  /**
   * La garantie centrale : l'origine n'est pas ce que le modèle prétend, mais
   * ce que l'application constate. Le modèle peut donc mentir dans les deux
   * sens sans effet — mesuré sur un programme réel, il le fait.
   */
  it("ignore l'étiquette du modèle et cherche le libellé dans le document", () => {
    const [c] = normaliser([
      chapitre({
        origine: "deduit", // le modèle se trompe : c'est bien dans le texte
        competences: [
          {
            code: "MA-1",
            libelle: "additionner deux fractions de dénominateurs différents",
            origine: "deduit",
          },
        ],
      }),
    ]);
    expect(c.competences[0].origine).toBe("lu");
    expect(c.competences[0].extrait).toContain("additionner deux fractions");
  });

  it("marque « deduit » une reformulation, même annoncée comme lue", () => {
    const [c] = normaliser([
      chapitre({
        competences: [
          { code: "MA-1", libelle: "Comprendre les nombres complexes", origine: "lu" },
        ],
      }),
    ]);
    expect(c.competences[0].origine).toBe("deduit");
    expect(c.competences[0].extrait).toBe("");
  });

  it("tolère accents, casse et ponctuation", () => {
    // Les programmes djiboutiens circulent souvent sans accents ; exiger
    // l'exactitude typographique rétrograderait des citations authentiques.
    const [c] = normaliser([
      chapitre({
        competences: [
          {
            code: "MA-1",
            libelle: "ADDITIONNER DEUX FRACTIONS DE DENOMINATEURS DIFFERENTS !",
            origine: "deduit",
          },
        ],
      }),
    ]);
    expect(c.competences[0].origine).toBe("lu");
  });

  it("ne conclut pas à une citation sur un libellé trop court", () => {
    // « Les » figure partout : une correspondance si courte ne prouve rien.
    const [c] = normaliser([
      chapitre({ competences: [{ code: "MA-1", libelle: "Les", origine: "lu" }] }),
    ]);
    expect(c.competences[0].origine).toBe("deduit");
  });

  it("n'attache aucun extrait à un élément déduit", () => {
    // Un extrait sans lecture prétendrait citer un document qu'on n'a pas lu.
    const [c] = normaliser([
      chapitre({ nom: "Chapitre inventé", extrait: "un passage inventé" }),
    ]);
    expect(c.origine).toBe("deduit");
    expect(c.extrait).toBe("");
  });

  it("désambiguïse les codes en double", () => {
    const [c] = normaliser([
      chapitre({
        competences: [
          { code: "MA-1", libelle: "A", origine: "lu" },
          { code: "MA-1", libelle: "B", origine: "lu" },
        ],
      }),
    ]);
    expect(c.competences[0].code).not.toBe(c.competences[1].code);
  });

  it("fabrique un code quand le modèle n'en donne pas d'exploitable", () => {
    const [c] = normaliser([
      chapitre({ competences: [{ code: "!!", libelle: "A", origine: "lu" }] }),
    ]);
    expect(c.competences[0].code).toMatch(/^MATH-/);
  });

  it("écarte les entrées sans nom ni libellé", () => {
    expect(normaliser([{ nom: "  " }, "texte", null])).toHaveLength(0);
  });

  it("applique le niveau par défaut quand il manque", () => {
    const [c] = normaliser([chapitre({ niveau: "" })]);
    expect(c.niveau).toBe("6ème");
  });
});

describe("application de l'import", () => {
  const faux = (
    existants: { nom: string; niveau: string; ordre: number }[] = [],
    codes: string[] = []
  ) => {
    const create = vi.fn().mockResolvedValue({});
    const client: PrismaImport = {
      chapitre: { findMany: vi.fn().mockResolvedValue(existants), create },
      competence: { findMany: vi.fn().mockResolvedValue(codes.map((code) => ({ code }))) },
    };
    return { client, create };
  };

  const entrant = (nom: string, competences = 1): ChapitreImporte => ({
    nom,
    niveau: "5ème",
    origine: "lu",
    extrait: "",
    competences: Array.from({ length: competences }, (_, i) => ({
      code: `MA-${i}`,
      libelle: `Compétence ${i}`,
      origine: "lu" as const,
      extrait: "",
    })),
  });

  it("crée les chapitres à la suite des existants", async () => {
    const { client, create } = faux([{ nom: "Ancien", niveau: "5ème", ordre: 4 }]);
    await appliquerImport(client, "t1", "m1", "s1", [entrant("Nouveau")]);

    const data = create.mock.calls[0][0].data;
    expect(data.ordre).toBe(5);
  });

  it("ignore un chapitre déjà présent, sans écraser le travail existant", async () => {
    // Un import ne doit jamais effacer un chapitre saisi à la main : c'est ce
    // qui rend le réimport d'un PDF corrigé sans danger.
    const { client, create } = faux([{ nom: "Les Fractions", niveau: "5ème", ordre: 0 }]);
    const r = await appliquerImport(client, "t1", "m1", null, [entrant("les fractions")]);

    expect(create).not.toHaveBeenCalled();
    expect(r.ignores[0].motif).toBe("chapitreExistant");
  });

  it("ignore un chapitre sans compétence", async () => {
    // Aucune preuve ne pourra s'y rattacher : il n'apporte rien à LEARNOS.
    const { client } = faux();
    const r = await appliquerImport(client, "t1", "m1", null, [entrant("Vide", 0)]);
    expect(r.ignores[0].motif).toBe("sansCompetence");
  });

  it("résout les collisions de code avant d'écrire", async () => {
    // `@@unique([tenantId, code])` : laisser la base trancher ferait échouer
    // l'import entier à la trentième ligne.
    const { client, create } = faux([], ["MA-0"]);
    await appliquerImport(client, "t1", "m1", null, [entrant("Nouveau")]);

    const codes = create.mock.calls[0][0].data.competences.create.map(
      (c: { code: string }) => c.code
    );
    expect(codes).toEqual(["MA-0-2"]);
  });

  it("compte ce qui a réellement été créé", async () => {
    const { client } = faux();
    const r = await appliquerImport(client, "t1", "m1", null, [
      entrant("A", 3),
      entrant("B", 2),
    ]);
    expect(r).toMatchObject({ chapitresCrees: 2, competencesCreees: 5 });
  });
});

describe("découpage en tranches", () => {
  it("ne découpe pas un texte qui tient en une seule tranche", () => {
    expect(decouperEnTranches("court", 10_000)).toEqual(["court"]);
  });

  it("découpe sur des limites de ligne, pas au milieu d'une phrase", () => {
    const lignes = Array.from({ length: 100 }, (_, i) => `Ligne ${i}`);
    const texte = lignes.join("\n");
    const tranches = decouperEnTranches(texte, 200, 50);

    expect(tranches.length).toBeGreaterThan(1);
    // Les tranches (sauf la dernière) se terminent à la fin d'une ligne.
    for (let i = 0; i < tranches.length - 1; i++) {
      expect(tranches[i].endsWith("\n")).toBe(true);
    }
  });

  it("chevauche les tranches pour ne pas perdre un titre à la frontière", () => {
    const texte = Array.from({ length: 50 }, (_, i) => `Ligne ${i}`).join("\n");
    const tranches = decouperEnTranches(texte, 100, 30);

    // La deuxième tranche commence avant la fin de la première : il y a du
    // chevauchement.
    if (tranches.length >= 2) {
      const fin1 = tranches[0].slice(-20);
      expect(tranches[1]).toContain(fin1.slice(0, 10));
    }
  });

  it("ne boucle pas infiniment sur un texte avec de très longues lignes", () => {
    const texte = "A".repeat(500) + "\n" + "B".repeat(500);
    const tranches = decouperEnTranches(texte, 100, 20);
    expect(tranches.length).toBeGreaterThan(0);
    // Toutes les tranches réunies couvrent le texte.
    expect(tranches.join("").length).toBeGreaterThanOrEqual(texte.length - 50);
  });
});

describe("fusion des chapitres", () => {
  const chap = (
    nom: string,
    competences: { code: string; libelle: string; origine?: "lu" | "deduit"; extrait?: string }[] = [],
    surcharge: Partial<ChapitreImporte> = {}
  ): ChapitreImporte => ({
    nom,
    niveau: "3ème",
    origine: surcharge.origine ?? "deduit",
    extrait: surcharge.extrait ?? "",
    competences: competences.map((c) => ({
      code: c.code,
      libelle: c.libelle,
      origine: c.origine ?? "deduit",
      extrait: c.extrait ?? "",
    })),
    ...surcharge,
  });

  it("dédoublonne les chapitres de même nom issus de tranches chevauchantes", () => {
    const fusionne = fusionnerChapitres([
      chap("Arithmétique", [{ code: "C1", libelle: "Décomposer en facteurs premiers" }]),
      chap("Arithmétique", [{ code: "C2", libelle: "Identifier un nombre premier" }]),
    ]);

    expect(fusionne).toHaveLength(1);
    expect(fusionne[0].competences).toHaveLength(2);
  });

  it("dédoublonne les compétences de même libellé (casse/accents ignorés)", () => {
    const fusionne = fusionnerChapitres([
      chap("Arithmétique", [{ code: "C1", libelle: "Décomposer en facteurs premiers" }]),
      chap("Arithmétique", [
        { code: "C2", libelle: "decomposer en facteurs premiers" }, // même, sans accents
      ]),
    ]);

    expect(fusionne[0].competences).toHaveLength(1);
  });

  it("garde l'origine « lu » si au moins une tranche l'a trouvée", () => {
    const fusionne = fusionnerChapitres([
      chap("Arithmétique", [{ code: "C1", libelle: "Décomposer en facteurs premiers" }], {
        origine: "deduit",
      }),
      chap("Arithmétique", [{ code: "C1", libelle: "Décomposer en facteurs premiers" }], {
        origine: "lu",
        extrait: "Décomposer en facteurs premiers",
      }),
    ]);

    expect(fusionne[0].origine).toBe("lu");
    expect(fusionne[0].extrait).toContain("Décomposer");
  });

  it("préserve les chapitres distincts", () => {
    const fusionne = fusionnerChapitres([
      chap("Arithmétique", [{ code: "C1", libelle: "Décomposer en facteurs premiers" }]),
      chap("Thalès", [{ code: "C2", libelle: "Calculer une longueur avec Thalès" }]),
    ]);

    expect(fusionne).toHaveLength(2);
  });

  it("ne fusionne pas des chapitres de niveaux différents", () => {
    const fusionne = fusionnerChapitres([
      { ...chap("Arithmétique", [{ code: "C1", libelle: "Décomposer en facteurs premiers" }]), niveau: "3ème" },
      { ...chap("Arithmétique", [{ code: "C2", libelle: "Additionner des fractions" }]), niveau: "5ème" },
    ]);

    expect(fusionne).toHaveLength(2);
  });
});
