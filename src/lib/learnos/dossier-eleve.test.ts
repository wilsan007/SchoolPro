import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    eleve: { findMany: vi.fn(), findFirst: vi.fn() },
    studentLearningProfile: { findMany: vi.fn() },
    recommandation: { findMany: vi.fn() },
    planProgression: { findMany: vi.fn() },
    absence: { count: vi.fn() },
    facture: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/annee-scolaire", () => ({
  anneeActiveId: vi.fn().mockResolvedValue(null),
  anneeActive: vi.fn().mockResolvedValue(null),
  getAnneeCourante: vi.fn().mockResolvedValue(null),
  getAnneeCouranteLibelle: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/demo-now", () => ({
  getDemoNow: vi.fn().mockResolvedValue(new Date()),
  getDemoDate: vi.fn().mockResolvedValue(null),
}));

import prisma from "@/lib/prisma";
import {
  dossierEleve,
  enfantsDuParent,
  tendanceGlobale,
} from "@/lib/learnos/dossier-eleve";

const db = prisma as unknown as {
  eleve: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  studentLearningProfile: { findMany: ReturnType<typeof vi.fn> };
  recommandation: { findMany: ReturnType<typeof vi.fn> };
  planProgression: { findMany: ReturnType<typeof vi.fn> };
  absence: { count: ReturnType<typeof vi.fn> };
  facture: { findMany: ReturnType<typeof vi.fn> };
};

const PARENT = { role: "PARENT", id: "u-parent", tenantHasSites: true };

beforeEach(() => {
  vi.clearAllMocks();
  db.eleve.findMany.mockResolvedValue([]);
  db.studentLearningProfile.findMany.mockResolvedValue([]);
  db.recommandation.findMany.mockResolvedValue([]);
  db.planProgression.findMany.mockResolvedValue([]);
  db.absence.count.mockResolvedValue(0);
  db.facture.findMany.mockResolvedValue([]);
});

/**
 * L'isolation est le point le plus sensible de ces écrans : le filtre de site
 * ne joue pas pour PARENT / STUDENT, seul le périmètre relationnel protège.
 * Si ce test tombe, un parent voit les enfants des autres.
 */
describe("périmètre du parent", () => {
  it("restreint la liste des enfants au lien de parenté", async () => {
    await enfantsDuParent("t1", PARENT);

    const where = db.eleve.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("parents");
    expect(JSON.stringify(where)).toContain("u-parent");
  });

  it("ne rend rien quand l'identité du parent est absente", async () => {
    // Fail-closed : sans identité exploitable, le filtre doit exclure tout,
    // jamais retomber sur « pas de filtre ».
    await enfantsDuParent("t1", { role: "PARENT", tenantHasSites: true });

    const where = db.eleve.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("__ecolpro_no_site_access__");
  });
});

describe("dossierEleve", () => {
  it("renvoie null quand l'élève est hors périmètre", async () => {
    db.eleve.findFirst.mockResolvedValue(null);
    expect(await dossierEleve("t1", "e-inconnu", PARENT)).toBeNull();
  });

  it("n'interroge pas la facturation pour un élève", async () => {
    // Un impayé regarde l'établissement et la famille, pas l'enfant.
    db.eleve.findFirst.mockResolvedValue({
      id: "e1", nom: "Hassan", prenom: "Amina", classe: { nom: "5B" },
    });

    const dossier = await dossierEleve("t1", "e1", PARENT, {
      pourResponsable: "eleve",
    });

    expect(db.facture.findMany).not.toHaveBeenCalled();
    expect(dossier?.finance).toBeNull();
  });

  it("ne propose comme action que les étapes du bon responsable", async () => {
    db.eleve.findFirst.mockResolvedValue({
      id: "e1", nom: "Hassan", prenom: "Amina", classe: { nom: "5B" },
    });
    db.planProgression.findMany.mockResolvedValue([
      {
        id: "p1", type: "remediation", statut: "ACTIF", dateRevue: null,
        motif: "", regleDeclenchee: "r", motifParams: null, matiere: { nom: "Maths" },
        etapes: [
          {
            id: "et-ens", action: "Reprendre en classe", responsable: "enseignant",
            echeance: new Date("2026-03-01"),
            competence: { libelle: "Fractions", chapitre: { matiere: { nom: "Maths" } } },
          },
          {
            id: "et-fam", action: "15 min de fractions", responsable: "parent",
            echeance: new Date("2026-03-10"),
            competence: { libelle: "Fractions", chapitre: { matiere: { nom: "Maths" } } },
          },
        ],
      },
    ]);

    const dossier = await dossierEleve("t1", "e1", PARENT, {
      pourResponsable: "parent",
    });

    // L'étape enseignante est plus proche dans le temps, mais la famille n'a
    // aucun levier dessus : la proposer produirait de la culpabilité.
    expect(dossier?.prochaineAction?.id).toBe("et-fam");
  });

  it("classe les compétences bloquantes en tête de « à reprendre »", async () => {
    db.eleve.findFirst.mockResolvedValue({
      id: "e1", nom: "Hassan", prenom: "Amina", classe: null,
    });
    const competence = (libelle: string) => ({
      code: libelle, libelle, chapitre: { matiere: { nom: "Maths" } },
    });
    db.studentLearningProfile.findMany.mockResolvedValue([
      { competenceId: "c1", masteryScore: 0.2, masteryStatus: "EMERGING", trend: "stable", competence: competence("Aires") },
      { competenceId: "c2", masteryScore: 0.3, masteryStatus: "EMERGING", trend: "stable", competence: competence("Fractions") },
    ]);
    db.recommandation.findMany.mockResolvedValue([
      { competenceId: "c2", competencesBloquees: 4 },
    ]);

    const dossier = await dossierEleve("t1", "e1", PARENT);

    expect(dossier?.aReprendre[0].competenceId).toBe("c2");
    expect(dossier?.aReprendre[0].bloquante).toBe(true);
  });

  it("écarte les compétences jamais mesurées", async () => {
    db.eleve.findFirst.mockResolvedValue({
      id: "e1", nom: "Hassan", prenom: "Amina", classe: null,
    });
    db.studentLearningProfile.findMany.mockResolvedValue([
      {
        competenceId: "c1", masteryScore: 0, masteryStatus: "UNKNOWN", trend: "indetermine",
        competence: { code: "C1", libelle: "Jamais évaluée", chapitre: null },
      },
    ]);

    const dossier = await dossierEleve("t1", "e1", PARENT);

    // Annoncer « non acquis » ce qui n'a jamais été évalué serait un mensonge
    // par omission.
    expect(dossier?.acquis).toHaveLength(0);
    expect(dossier?.enCours).toHaveLength(0);
    expect(dossier?.aReprendre).toHaveLength(0);
  });
});

describe("tendanceGlobale", () => {
  const t = (n: number, valeur: string) =>
    Array.from({ length: n }, () => ({ trend: valeur }));

  it("refuse de conclure sur trop peu de compétences mesurées", () => {
    expect(tendanceGlobale(t(3, "hausse"))).toBe("indetermine");
  });

  it("ignore les compétences dont la tendance est indéterminée", () => {
    expect(tendanceGlobale([...t(3, "hausse"), ...t(9, "indetermine")])).toBe(
      "indetermine"
    );
  });

  it("conclut à une progression quand l'écart est net", () => {
    expect(tendanceGlobale([...t(4, "hausse"), ...t(1, "baisse")])).toBe("hausse");
  });

  it("conclut à un recul quand l'écart est net", () => {
    expect(tendanceGlobale([...t(1, "hausse"), ...t(4, "baisse")])).toBe("baisse");
  });

  it("reste stable quand hausses et baisses s'équilibrent", () => {
    // Un écart d'un seul profil ne fait pas une tendance : l'annoncer à une
    // famille serait démenti au trimestre suivant.
    expect(tendanceGlobale([...t(3, "hausse"), ...t(2, "baisse")])).toBe("stable");
  });
});
