import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

import { SEUILS_PAR_DEFAUT } from "@/lib/learnos/recommendation-engine";
import {
  recommandationsALaDate,
  compteurEnAval,
  type ProfilALaDate,
  type RecommandationAffichee,
} from "@/lib/learnos/recommandations-a-la-date";

const seuils = () => ({ ...SEUILS_PAR_DEFAUT });

function profil(id: string, masteryScore: number, extra: Partial<ProfilALaDate> = {}): ProfilALaDate {
  return {
    competenceId: id,
    masteryScore,
    confidenceScore: 0.85,
    trend: "stable",
    masteryStatus: "EMERGING",
    prerequisiteStatus: null,
    competence: { libelle: `Compétence ${id}`, chapitre: null },
    ...extra,
  };
}

function stockee(competenceId: string, extra: Partial<RecommandationAffichee> = {}): RecommandationAffichee {
  return {
    id: `reco-${competenceId}`,
    competenceId,
    niveau: "CRITIQUE",
    statut: "OBLIGATOIRE",
    motif: "motif stocké",
    actionProposee: "action stockée",
    regleDeclenchee: "reco.critique",
    motifParams: null,
    competencesBloquees: 1,
    ...extra,
  };
}

describe("recommandationsALaDate", () => {
  it("propose une action pour une compétence non acquise à la date, même sans recommandation stockée", () => {
    const recos = recommandationsALaDate([profil("a", 0.2), profil("b", 0.45)], [], seuils, () => 0);

    expect(recos.map((r) => [r.competenceId, r.niveau, r.statut])).toEqual([
      ["a", "CRITIQUE", "RECOMMANDEE"],
      ["b", "FRAGILE", "RECOMMANDEE"],
    ]);
  });

  it("rend obligatoire une compétence critique qui bloque la suite", () => {
    const [reco] = recommandationsALaDate([profil("a", 0.2)], [], seuils, () => 3);

    expect(reco.statut).toBe("OBLIGATOIRE");
    expect(reco.competencesBloquees).toBe(3);
  });

  it("ignore une compétence pas encore mesurée à la date, même si une recommandation est stockée", () => {
    const recos = recommandationsALaDate(
      [profil("a", 0, { masteryStatus: "UNKNOWN" })],
      [stockee("a")],
      seuils,
      () => 0
    );

    expect(recos).toEqual([]);
  });

  it("se tait sur une compétence acquise et sous le seuil de confiance", () => {
    const recos = recommandationsALaDate(
      [profil("a", 0.7), profil("b", 0.2, { confidenceScore: 0.2 })],
      [stockee("a")],
      seuils,
      () => 0
    );

    expect(recos).toEqual([]);
  });

  it("garde une décision humaine même quand la confiance ne permet plus de recommander", () => {
    const acceptee = stockee("a", { statut: "ACCEPTEE" });
    const recos = recommandationsALaDate(
      [profil("a", 0.2, { confidenceScore: 0.2 }), profil("b", 0.2, { confidenceScore: 0.2 })],
      [acceptee, stockee("b")],
      seuils,
      () => 0
    );

    expect(recos).toEqual([acceptee]);
  });

  it("conserve la recommandation stockée quand la bande n'a pas changé", () => {
    const existante = stockee("a", { statut: "ACCEPTEE" });

    expect(recommandationsALaDate([profil("a", 0.2)], [existante], seuils, () => 0)).toEqual([existante]);
  });

  it("reformule quand la bande a changé, sans effacer une décision humaine", () => {
    const [reco] = recommandationsALaDate(
      [profil("a", 0.2)],
      [stockee("a", { niveau: "FRAGILE", statut: "ECARTEE" })],
      seuils,
      () => 0
    );

    expect(reco).toMatchObject({ id: "reco-a", niveau: "CRITIQUE", statut: "ECARTEE", regleDeclenchee: "critique_sans_prerequis" });
  });

  it("tolère un état de prérequis qui n'est pas une liste", () => {
    const [reco] = recommandationsALaDate(
      [profil("a", 0.2, { prerequisiteStatus: { checked: true, missing: 2 } })],
      [],
      seuils,
      () => 0
    );

    expect(reco.regleDeclenchee).toBe("critique_sans_prerequis");
  });
});

describe("compteurEnAval", () => {
  it("compte les dépendances transitives sans boucler sur un cycle", () => {
    const aval = compteurEnAval([
      { id: "a", prerequis: [{ id: "c" }] },
      { id: "b", prerequis: [{ id: "a" }] },
      { id: "c", prerequis: [{ id: "b" }] },
      { id: "d", prerequis: [{ id: "a" }] },
      { id: "e", prerequis: [] },
    ]);

    expect(aval("a")).toBe(3);
    expect(aval("e")).toBe(0);
  });
});
