import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    planProgression: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    recommandation: { findMany: vi.fn() },
    seuilsRecommandation: { findMany: vi.fn() },
    studentLearningProfile: { findFirst: vi.fn(), findMany: vi.fn() },
    etapePlan: { updateMany: vi.fn(), createMany: vi.fn() },
    eleve: { findFirst: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import {
  evaluerBesoinDePlans,
  validerPlan,
  refuserPlan,
  synchroniserEtapes,
  passerEnRevueLesPlansEchus,
  PLAFOND_PLANS_SIMULTANES,
} from "@/lib/learnos/plan-engine";
import { reinitialiserCaches } from "@/lib/learnos/recommendation-engine";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

const MAINTENANT = new Date("2026-06-01T00:00:00Z");

/** Recommandation, avec sa matière — c'est elle qui cloisonne désormais les plans. */
function reco(over: Record<string, unknown> = {}) {
  const { matiereId = "m1", matiereNom = "Mathématiques", libelle = "Fractions", ...reste } = over;
  return {
    competenceId: "c1",
    niveau: "CRITIQUE",
    competencesBloquees: 0,
    actionProposee: "Reprise ciblée.",
    competence: {
      libelle,
      chapitre: { niveau: "5ème", matiereId, matiere: { nom: matiereNom } },
    },
    ...reste,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  reinitialiserCaches();
  mockPrisma.planProgression.findFirst.mockResolvedValue(null);
  mockPrisma.planProgression.findMany.mockResolvedValue([]);
  mockPrisma.planProgression.create.mockResolvedValue({ id: "plan1" });
  mockPrisma.planProgression.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.recommandation.findMany.mockResolvedValue([]);
  mockPrisma.seuilsRecommandation.findMany.mockResolvedValue([]);
  mockPrisma.studentLearningProfile.findFirst.mockResolvedValue(null);
  mockPrisma.studentLearningProfile.findMany.mockResolvedValue([]);
  mockPrisma.etapePlan.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.etapePlan.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.eleve.findFirst.mockResolvedValue({ siteId: "site1" });
});

afterEach(() => vi.restoreAllMocks());

describe("déclenchement", () => {
  it("ne propose rien sans recommandation", async () => {
    const r = await evaluerBesoinDePlans("t1", "e1", MAINTENANT);
    expect(r.proposes).toEqual([]);
    expect(mockPrisma.planProgression.create).not.toHaveBeenCalled();
  });

  // Proposer un parcours à tout le monde viderait la démarche de son sens.
  it("ne propose rien pour une difficulté isolée sans effet en aval", async () => {
    mockPrisma.recommandation.findMany.mockResolvedValue([reco()]);
    expect((await evaluerBesoinDePlans("t1", "e1", MAINTENANT)).proposes).toEqual([]);
  });

  it("propose une remédiation quand les difficultés se cumulent", async () => {
    mockPrisma.recommandation.findMany.mockResolvedValue([
      reco({ competenceId: "c1" }),
      reco({ competenceId: "c2", libelle: "Équations" }),
    ]);

    const r = await evaluerBesoinDePlans("t1", "e1", MAINTENANT);

    expect(r.proposes[0].type).toBe("remediation");
    expect(r.proposes[0].nbEtapes).toBe(2);
    expect(mockPrisma.planProgression.create.mock.calls[0][0].data.regleDeclenchee).toBe(
      "plan_difficultes_multiples"
    );
  });

  // Une seule compétence suffit si elle verrouille la suite du programme.
  it("propose une remédiation sur un blocage structurel isolé", async () => {
    mockPrisma.recommandation.findMany.mockResolvedValue([reco({ competencesBloquees: 4 })]);

    const r = await evaluerBesoinDePlans("t1", "e1", MAINTENANT);

    expect(r.proposes[0].type).toBe("remediation");
    expect(r.proposes[0].motif).toContain("4 compétences");
  });

  // Exigence centrale : un élève qui plafonne mérite un parcours autant qu'un
  // élève en difficulté. Même mécanique, finalité opposée.
  it("propose un approfondissement à un élève qui plafonne", async () => {
    mockPrisma.recommandation.findMany.mockResolvedValue([
      reco({ niveau: "EXCELLENCE", competenceId: "c1" }),
      reco({ niveau: "AVANCE", competenceId: "c2" }),
      reco({ niveau: "EXCELLENCE", competenceId: "c3" }),
    ]);

    const r = await evaluerBesoinDePlans("t1", "e1", MAINTENANT);

    expect(r.proposes[0].type).toBe("approfondissement");
    // L'élève porte lui-même son approfondissement — il n'est pas prescrit.
    expect(
      mockPrisma.planProgression.create.mock.calls[0][0].data.etapes.create[0].responsable
    ).toBe("eleve");
  });

  // Règle non négociable : le moteur propose, l'humain engage.
  it("crée toujours le plan à l'état PROPOSÉ, jamais ACTIF", async () => {
    mockPrisma.recommandation.findMany.mockResolvedValue([
      reco({ competenceId: "c1" }),
      reco({ competenceId: "c2" }),
    ]);

    await evaluerBesoinDePlans("t1", "e1", MAINTENANT);

    const data = mockPrisma.planProgression.create.mock.calls[0][0].data;
    expect(data.statut).toBe("PROPOSE");
    expect(data.valideLe).toBeUndefined();
  });

  it("ignore les recommandations écartées par un enseignant", async () => {
    await evaluerBesoinDePlans("t1", "e1", MAINTENANT);
    expect(mockPrisma.recommandation.findMany.mock.calls[0][0].where.statut).toEqual({
      not: "ECARTEE",
    });
  });
});

/**
 * Correctif : un plan mélangeant maths et histoire n'aurait aucun propriétaire.
 * Chaque matière a son parcours, avec ses propres seuils.
 */
describe("cloisonnement par matière", () => {
  it("ouvre un parcours distinct par matière", async () => {
    mockPrisma.recommandation.findMany.mockResolvedValue([
      reco({ competenceId: "c1", matiereId: "m1", matiereNom: "Mathématiques" }),
      reco({ competenceId: "c2", matiereId: "m1", matiereNom: "Mathématiques" }),
      reco({ competenceId: "c3", matiereId: "m2", matiereNom: "Français" }),
      reco({ competenceId: "c4", matiereId: "m2", matiereNom: "Français" }),
    ]);
    mockPrisma.planProgression.create
      .mockResolvedValueOnce({ id: "planMaths" })
      .mockResolvedValueOnce({ id: "planFrancais" });

    const r = await evaluerBesoinDePlans("t1", "e1", MAINTENANT);

    expect(r.proposes).toHaveLength(2);
    expect(r.proposes.map((p) => p.matiereNom).sort()).toEqual(["Français", "Mathématiques"]);
    // Chaque plan porte sa matière : c'est ce qui lui donne un responsable.
    const matieres = mockPrisma.planProgression.create.mock.calls.map(
      (c) => c[0].data.matiereId
    );
    expect(matieres.sort()).toEqual(["m1", "m2"]);
  });

  it("ne compte les difficultés que dans leur propre matière", async () => {
    // Une critique en maths + une en français : aucune matière n'atteint le
    // seuil de deux, donc aucun parcours.
    mockPrisma.recommandation.findMany.mockResolvedValue([
      reco({ competenceId: "c1", matiereId: "m1" }),
      reco({ competenceId: "c2", matiereId: "m2", matiereNom: "Français" }),
    ]);

    expect((await evaluerBesoinDePlans("t1", "e1", MAINTENANT)).proposes).toEqual([]);
  });

  it("résout les seuils dans le contexte de chaque matière", async () => {
    mockPrisma.recommandation.findMany.mockResolvedValue([
      reco({ competenceId: "c1", matiereId: "m1" }),
      reco({ competenceId: "c2", matiereId: "m1" }),
    ]);

    await evaluerBesoinDePlans("t1", "e1", MAINTENANT);

    // La résolution passe bien la matière concernée, et non celle de la
    // première recommandation venue.
    expect(mockPrisma.seuilsRecommandation.findMany).toHaveBeenCalled();
  });
});

/**
 * Correctif : un plan figé ne servirait qu'une semaine. Une nouvelle difficulté
 * doit l'enrichir, sans jamais réécrire ce que l'enseignant a validé.
 */
describe("dynamisme du parcours", () => {
  const planActif = (over: Record<string, unknown> = {}) => ({
    id: "planMaths",
    matiereId: "m1",
    type: "remediation",
    etapes: [{ competenceId: "c1" }],
    ...over,
  });

  it("ajoute une étape au parcours en cours plutôt que d'en ouvrir un second", async () => {
    mockPrisma.planProgression.findMany.mockResolvedValue([planActif()]);
    mockPrisma.recommandation.findMany.mockResolvedValue([
      reco({ competenceId: "c1" }),
      reco({ competenceId: "c2", libelle: "Équations" }),
    ]);

    const r = await evaluerBesoinDePlans("t1", "e1", MAINTENANT);

    expect(mockPrisma.planProgression.create).not.toHaveBeenCalled();
    expect(r.ajustes[0]).toMatchObject({ planId: "planMaths", etapesAjoutees: 1 });
    // Seule la compétence nouvelle est ajoutée, pas celle déjà couverte.
    expect(mockPrisma.etapePlan.createMany.mock.calls[0][0].data[0].competenceId).toBe("c2");
  });

  it("n'ajoute rien quand aucune difficulté nouvelle n'est apparue", async () => {
    mockPrisma.planProgression.findMany.mockResolvedValue([planActif()]);
    mockPrisma.recommandation.findMany.mockResolvedValue([reco({ competenceId: "c1" })]);

    const r = await evaluerBesoinDePlans("t1", "e1", MAINTENANT);

    expect(r.ajustes).toEqual([]);
    expect(mockPrisma.etapePlan.createMany).not.toHaveBeenCalled();
  });

  // Remédier et approfondir sont deux démarches distinctes : les mêler dans un
  // seul parcours le rendrait incompréhensible.
  it("n'enrichit pas une remédiation d'une ouverture, ni l'inverse", async () => {
    mockPrisma.planProgression.findMany.mockResolvedValue([planActif()]);
    mockPrisma.recommandation.findMany.mockResolvedValue([
      reco({ competenceId: "c9", niveau: "EXCELLENCE" }),
    ]);

    const r = await evaluerBesoinDePlans("t1", "e1", MAINTENANT);
    expect(r.ajustes).toEqual([]);
  });

  it("continue d'ouvrir un parcours dans une AUTRE matière", async () => {
    mockPrisma.planProgression.findMany.mockResolvedValue([planActif()]);
    mockPrisma.recommandation.findMany.mockResolvedValue([
      reco({ competenceId: "c1", matiereId: "m1" }),
      reco({ competenceId: "c5", matiereId: "m2", matiereNom: "Français" }),
      reco({ competenceId: "c6", matiereId: "m2", matiereNom: "Français" }),
    ]);

    const r = await evaluerBesoinDePlans("t1", "e1", MAINTENANT);
    expect(r.proposes.map((p) => p.matiereNom)).toEqual(["Français"]);
  });
});

/**
 * Un élève avec quatre parcours n'a pas quatre problèmes disciplinaires : il en
 * a un seul, global, qui relève de la vie scolaire.
 */
describe("plafond de parcours simultanés", () => {
  it("cesse d'ouvrir et signale au-delà du plafond", async () => {
    mockPrisma.planProgression.findMany.mockResolvedValue(
      Array.from({ length: PLAFOND_PLANS_SIMULTANES }, (_, i) => ({
        id: `p${i}`,
        matiereId: `autre${i}`,
        type: "remediation",
        etapes: [],
      }))
    );
    mockPrisma.recommandation.findMany.mockResolvedValue([
      reco({ competenceId: "c1", matiereId: "mX", matiereNom: "SVT" }),
      reco({ competenceId: "c2", matiereId: "mX", matiereNom: "SVT" }),
    ]);

    const r = await evaluerBesoinDePlans("t1", "e1", MAINTENANT);

    expect(r.proposes).toEqual([]);
    expect(r.plafondAtteint).toBe(true);
    expect(mockPrisma.planProgression.create).not.toHaveBeenCalled();
  });
});

describe("validation humaine", () => {
  it("active le plan et enregistre qui l'a engagé", async () => {
    mockPrisma.planProgression.findFirst.mockResolvedValue({
      id: "plan1", eleveId: "e1", etapes: [{ competenceId: "c1" }],
    });
    mockPrisma.studentLearningProfile.findMany.mockResolvedValue([{ masteryScore: 0.3 }]);

    expect(await validerPlan("t1", "plan1", "user1", undefined, MAINTENANT)).toBe(true);

    const data = mockPrisma.planProgression.updateMany.mock.calls[0][0].data;
    expect(data.statut).toBe("ACTIF");
    expect(data.valideParId).toBe("user1");
    // Photographie de départ : sans elle, impossible de dire si le dispositif
    // a servi.
    expect(data.masteryAvant).toBeCloseTo(0.3);
  });

  it("refuse de valider un plan qui n'est pas à l'état proposé", async () => {
    mockPrisma.planProgression.findFirst.mockResolvedValue(null);
    expect(await validerPlan("t1", "plan1", "user1")).toBe(false);
  });

  it("conserve un plan refusé au lieu de l'effacer", async () => {
    expect(await refuserPlan("t1", "plan1", "Suivi déjà en place")).toBe(true);
    const data = mockPrisma.planProgression.updateMany.mock.calls[0][0].data;
    expect(data.statut).toBe("ABANDONNE");
    expect(data.resultat).toBe("Suivi déjà en place");
  });
});

describe("synchronisation des étapes", () => {
  // C'est la preuve qui pilote l'étape, jamais une déclaration.
  it("ne valide rien tant que la compétence n'est pas acquise", async () => {
    mockPrisma.studentLearningProfile.findFirst.mockResolvedValue({
      masteryStatus: "DEVELOPING", masteryScore: 0.45,
    });
    const r = await synchroniserEtapes("t1", "e1", "c1", MAINTENANT);
    expect(r.validees).toBe(0);
  });

  // Ne plus savoir n'est pas avoir oublié.
  it("ne rouvre rien sur une compétence devenue non concluante", async () => {
    mockPrisma.studentLearningProfile.findFirst.mockResolvedValue({
      masteryStatus: "UNKNOWN", masteryScore: 0.2,
    });
    const r = await synchroniserEtapes("t1", "e1", "c1", MAINTENANT);
    expect(r).toEqual({ validees: 0, rouvertes: 0 });
    expect(mockPrisma.etapePlan.updateMany).not.toHaveBeenCalled();
  });

  it("valide l'étape dès que la compétence est acquise", async () => {
    mockPrisma.studentLearningProfile.findFirst.mockResolvedValue({
      masteryStatus: "PROFICIENT", masteryScore: 0.7,
    });
    mockPrisma.etapePlan.updateMany.mockResolvedValue({ count: 1 });

    const r = await synchroniserEtapes("t1", "e1", "c1", MAINTENANT);

    expect(r.validees).toBe(1);
    expect(mockPrisma.etapePlan.updateMany.mock.calls[0][0].data.statut).toBe("VALIDE");
  });

  // Correctif : sans cela, un acquis perdu resterait marqué validé et le plan
  // se clôturerait sur un faux positif durable.
  it("rouvre une étape dont la compétence a régressé", async () => {
    mockPrisma.studentLearningProfile.findFirst.mockResolvedValue({
      masteryStatus: "EMERGING", masteryScore: 0.28,
    });
    mockPrisma.etapePlan.updateMany.mockResolvedValue({ count: 1 });

    const r = await synchroniserEtapes("t1", "e1", "c1", MAINTENANT);

    expect(r.rouvertes).toBe(1);
    const data = mockPrisma.etapePlan.updateMany.mock.calls[0][0].data;
    expect(data.statut).toBe("EN_COURS");
    expect(data.valideeLe).toBeNull();
  });

  it("rouvre aussi le plan déjà clos dont une étape retombe", async () => {
    mockPrisma.studentLearningProfile.findFirst.mockResolvedValue({
      masteryStatus: "EMERGING", masteryScore: 0.28,
    });
    mockPrisma.etapePlan.updateMany.mockResolvedValue({ count: 1 });

    await synchroniserEtapes("t1", "e1", "c1", MAINTENANT);

    const appel = mockPrisma.planProgression.updateMany.mock.calls[0][0];
    expect(appel.where.statut).toBe("TERMINE");
    expect(appel.data.statut).toBe("EN_REVUE");
  });

  it("clôt le plan et mesure l'effet quand toutes les étapes sont validées", async () => {
    mockPrisma.studentLearningProfile.findFirst.mockResolvedValue({
      masteryStatus: "MASTERED", masteryScore: 0.9,
    });
    mockPrisma.etapePlan.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.planProgression.findMany.mockResolvedValue([
      { id: "plan1", masteryAvant: 0.3, etapes: [{ statut: "VALIDE", competenceId: "c1" }] },
    ]);
    mockPrisma.studentLearningProfile.findMany.mockResolvedValue([{ masteryScore: 0.85 }]);

    await synchroniserEtapes("t1", "e1", "c1", MAINTENANT);

    const data = mockPrisma.planProgression.updateMany.mock.calls[0][0].data;
    expect(data.statut).toBe("TERMINE");
    expect(data.resultat).toContain("55"); // 0,85 − 0,30 = 55 points
  });

  it("laisse ouvert un plan dont une étape reste à faire", async () => {
    mockPrisma.studentLearningProfile.findFirst.mockResolvedValue({
      masteryStatus: "MASTERED", masteryScore: 0.9,
    });
    mockPrisma.etapePlan.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.planProgression.findMany.mockResolvedValue([
      {
        id: "plan1",
        masteryAvant: 0.3,
        etapes: [{ statut: "VALIDE", competenceId: "c1" }, { statut: "A_FAIRE", competenceId: "c2" }],
      },
    ]);

    await synchroniserEtapes("t1", "e1", "c1", MAINTENANT);
    expect(mockPrisma.planProgression.updateMany).not.toHaveBeenCalled();
  });
});

/**
 * Correctif : `dateRevue` était un rendez-vous que personne n'honorait. Un plan
 * pouvait rester actif toute l'année sans qu'on se demande s'il servait.
 */
describe("point d'étape", () => {
  it("bascule en revue les parcours dont l'échéance est atteinte", async () => {
    mockPrisma.planProgression.updateMany.mockResolvedValue({ count: 4 });

    expect(await passerEnRevueLesPlansEchus(MAINTENANT)).toBe(4);

    const appel = mockPrisma.planProgression.updateMany.mock.calls[0][0];
    expect(appel.where).toMatchObject({ statut: "ACTIF" });
    expect(appel.where.dateRevue).toEqual({ lte: MAINTENANT });
    expect(appel.data.statut).toBe("EN_REVUE");
  });
});
