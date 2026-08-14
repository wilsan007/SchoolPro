import { describe, expect, it } from "vitest";
import {
  choisirEnfant,
  claimsPourEnfant,
  composerReponse,
  detecterIntention,
  normaliser,
  type ParentIdentifie,
} from "@/lib/learnos/bot-parent";
import { resolveSiteScope } from "@/lib/site-scope";
import type { DossierEleve } from "@/lib/learnos/dossier-eleve";

describe("normalisation", () => {
  it("efface accents, casse et ponctuation", () => {
    // Personne n'écrit « élève » avec l'accent sur un clavier de téléphone.
    expect(normaliser("Élève, ça va ?")).toBe("eleve ca va");
  });
});

describe("détection d'intention", () => {
  it("reconnaît les formulations françaises courantes", () => {
    expect(detecterIntention("il a des absences ?")).toBe("assiduite");
    expect(detecterIntention("je veux payer la scolarite")).toBe("solde");
    expect(detecterIntention("ou en est le plan")).toBe("plan");
  });

  /**
   * Le bot annonce lui-même ces formulations dans son menu. Si l'une d'elles
   * ne retombe pas sur l'intention promise, il contredit ses propres
   * instructions — c'est la façon la plus sûre de perdre un parent.
   */
  it.each([
    ["Comment ça se passe ?", "progression"],
    ["Qu'est-ce qui bloque ?", "difficultes"],
    ["Comment l'aider ?", "aider"],
    ["Des absences ?", "assiduite"],
    ["Où en est le plan ?", "plan"],
    ["Où en est la scolarité ?", "solde"],
  ])("route la formulation du menu « %s » vers %s", (phrase, attendue) => {
    expect(detecterIntention(phrase)).toBe(attendue);
  });

  it("reconnaît le somali et l'arabe", () => {
    expect(detecterIntention("waa maqan")).toBe("assiduite");
    expect(detecterIntention("عندها غياب")).toBe("assiduite");
  });

  it("préfère le mot-clé le plus long en cas de recouvrement", () => {
    // « comment » seul relève de l'aide ; « comment l'aider » est explicite.
    expect(detecterIntention("comment l aider a la maison")).toBe("aider");
  });

  it("renvoie null plutôt que de deviner", () => {
    // Répondre à côté est pire que de demander à reformuler.
    expect(detecterIntention("bbbb zzz")).toBeNull();
    expect(detecterIntention("")).toBeNull();
  });
});

describe("choix de l'enfant", () => {
  const parent = (enfants: { id: string; prenom: string }[]): ParentIdentifie => ({
    id: "p1", tenantId: "t1", prenom: "Fatouma", nom: "Ali", langue: null,
    enfants: enfants.map((e) => ({ ...e, nom: "Ali", siteId: "s1" })),
  });

  it("ne demande rien quand il n'y a qu'un enfant", () => {
    const r = choisirEnfant(parent([{ id: "e1", prenom: "Amina" }]), "ça va ?");
    expect(r.eleve?.id).toBe("e1");
    expect(r.ambigu).toBe(false);
  });

  it("désambiguïse une fratrie par le prénom cité", () => {
    const r = choisirEnfant(
      parent([{ id: "e1", prenom: "Amina" }, { id: "e2", prenom: "Youssouf" }]),
      "et youssouf, il progresse ?"
    );
    expect(r.eleve?.id).toBe("e2");
  });

  it("refuse de choisir pour le parent quand rien n'est cité", () => {
    // Répondre pour l'aîné par défaut appliquerait un conseil au mauvais
    // enfant — l'erreur la plus coûteuse du dispositif.
    const r = choisirEnfant(
      parent([{ id: "e1", prenom: "Amina" }, { id: "e2", prenom: "Youssouf" }]),
      "ça va ?"
    );
    expect(r.eleve).toBeNull();
    expect(r.ambigu).toBe(true);
  });
});

describe("périmètre de lecture du bot", () => {
  it("borne au site de l'enfant", () => {
    expect(resolveSiteScope(claimsPourEnfant({ siteId: "s1" }))).toEqual({
      kind: "SITES",
      siteIds: ["s1"],
    });
  });

  it("ne se ferme pas sur un établissement mono-site", () => {
    // Sans `tenantHasSites: false`, la liste vide serait lue comme « aucun
    // accès » et le bot ne répondrait jamais dans un tenant sans sites.
    expect(resolveSiteScope(claimsPourEnfant({ siteId: null }))).toEqual({ kind: "ALL" });
  });
});

describe("composition de la réponse", () => {
  // Traducteur factice : on vérifie quelle clé est choisie et avec quels
  // paramètres, pas la formulation — celle-ci vit dans les fichiers de langue.
  const t = (cle: string, params?: Record<string, string | number>) =>
    params ? `${cle}(${JSON.stringify(params)})` : cle;

  const dossier = (partiel: Partial<DossierEleve>): DossierEleve => ({
    eleve: { id: "e1", nom: "Hassan", prenom: "Amina", classe: "5B" },
    acquis: [], enCours: [], aReprendre: [],
    tendance: "indetermine", plans: [], prochaineAction: null,
    assiduite: { absencesInjustifiees: 0, fenetreJours: 30 },
    finance: null,
    ...partiel,
  });

  it("annonce la difficulté bloquante en premier levier", () => {
    const texte = composerReponse(
      "difficultes",
      dossier({
        aReprendre: [
          { competenceId: "c1", code: "C1", libelle: "Aires", matiere: "Maths", mastery: 0.2, bloquante: false },
          { competenceId: "c2", code: "C2", libelle: "Fractions", matiere: "Maths", mastery: 0.3, bloquante: true },
        ],
      }),
      t
    );
    expect(texte).toContain("difficultes_bloquante");
    expect(texte).toContain("Fractions");
  });

  it("ne fabrique pas d'action quand il n'y en a pas", () => {
    // Inventer une tâche pour remplir le message ferait perdre toute
    // crédibilité aux fois où il y en a réellement une.
    expect(composerReponse("aider", dossier({}), t)).toContain("aider_rien");
  });

  it("dit « à jour » plutôt que de taire le solde", () => {
    expect(composerReponse("solde", dossier({}), t)).toBe("solde_ajour");
    expect(
      composerReponse("solde", dossier({ finance: { facturesEnRetard: 2, montantDu: 15000 } }), t)
    ).toContain("solde_du");
  });

  it("retombe sur le menu pour une intention inconnue", () => {
    expect(composerReponse("inconnue", dossier({}), t)).toBe("menu");
  });

  it("n'affirme pas de tendance quand elle est indéterminée", () => {
    const texte = composerReponse("progression", dossier({ tendance: "indetermine" }), t);
    expect(texte).toContain("progression_tendance_indetermine");
  });
});
