import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    eleve: { findFirst: vi.fn() },
    studentLearningProfile: { findMany: vi.fn() },
    learningEvidence: { findMany: vi.fn() },
    studentIntervention: { findMany: vi.fn() },
    planProgression: { findMany: vi.fn() },
    predictionDifficulte: { findMany: vi.fn() },
    recommandation: { findMany: vi.fn() },
    journalApprentissage: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCheckPermission = checkPermission as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  eleve: { findFirst: ReturnType<typeof vi.fn> };
  studentLearningProfile: { findMany: ReturnType<typeof vi.fn> };
  learningEvidence: { findMany: ReturnType<typeof vi.fn> };
  studentIntervention: { findMany: ReturnType<typeof vi.fn> };
  planProgression: { findMany: ReturnType<typeof vi.fn> };
  predictionDifficulte: { findMany: ReturnType<typeof vi.fn> };
  recommandation: { findMany: ReturnType<typeof vi.fn> };
  journalApprentissage: { findMany: ReturnType<typeof vi.fn> };
};

function req(url: string) {
  return { url } as unknown as import("next/server").NextRequest;
}

const { GET } = await import("@/app/api/dossier-progression/route");

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckPermission.mockReturnValue(null);
  mockAuth.mockResolvedValue({
    user: { id: "u1", tenantId: "t1", role: "PRINCIPAL", siteId: null },
  });
  mockPrisma.eleve.findFirst.mockResolvedValue({
    id: "e1",
    nom: "Ahmed",
    prenom: "Ali",
    matricule: "M001",
    classe: { id: "c1", nom: "Terminale A", niveau: "Terminale" },
  });
  mockPrisma.studentLearningProfile.findMany.mockResolvedValue([]);
  mockPrisma.learningEvidence.findMany.mockResolvedValue([]);
  mockPrisma.studentIntervention.findMany.mockResolvedValue([]);
  mockPrisma.planProgression.findMany.mockResolvedValue([]);
  mockPrisma.predictionDifficulte.findMany.mockResolvedValue([]);
  mockPrisma.recommandation.findMany.mockResolvedValue([]);
  mockPrisma.journalApprentissage.findMany.mockResolvedValue([]);
});

describe("GET /api/dossier-progression", () => {
  it("refuse l'accès sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req("http://l?eleveId=e1"));
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission eleves:read", async () => {
    mockCheckPermission.mockReturnValue(
      new Response("Forbidden", { status: 403 })
    );
    const res = await GET(req("http://l?eleveId=e1"));
    expect(res.status).toBe(403);
  });

  it("rejette les paramètres manquants", async () => {
    const res = await GET(req("http://l"));
    expect(res.status).toBe(400);
  });

  it("renvoie 404 si l'élève n'existe pas dans le tenant", async () => {
    mockPrisma.eleve.findFirst.mockResolvedValue(null);
    const res = await GET(req("http://l?eleveId=e1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("ELEVE_INTROUVABLE");
  });

  it("filtre l'élève par tenantId", async () => {
    await GET(req("http://l?eleveId=e1"));
    const where = mockPrisma.eleve.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.id).toBe("e1");
  });

  it("renvoie la synthèse et les sections vides", async () => {
    const res = await GET(req("http://l?eleveId=e1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.eleve.nom).toBe("Ahmed");
    expect(data.synthese.totalCompetences).toBe(0);
    expect(data.profils).toEqual([]);
    expect(data.evidences).toEqual([]);
  });

  it("agrège les profils de compétences", async () => {
    mockPrisma.studentLearningProfile.findMany.mockResolvedValue([
      {
        competenceId: "comp1",
        masteryScore: 0.9,
        confidenceScore: 0.8,
        masteryStatus: "MASTERED",
        trend: "hausse",
        evidenceCount: 5,
        lastEvidenceAt: "2025-10-01",
        competence: {
          id: "comp1",
          code: "MATH-C1",
          libelle: "Calculer une dérivée",
          chapitre: { id: "ch1", nom: "Dérivées", matiere: { id: "m1", nom: "Maths", code: "MATH" } },
        },
      },
    ]);
    const res = await GET(req("http://l?eleveId=e1"));
    const data = await res.json();
    expect(data.synthese.totalCompetences).toBe(1);
    expect(data.synthese.maitrisees).toBe(1);
    expect(data.profils).toHaveLength(1);
    expect(data.profils[0].competence.libelle).toBe("Calculer une dérivée");
  });

  it("filtre les profils par tenantId et eleveId", async () => {
    await GET(req("http://l?eleveId=e1"));
    const where = mockPrisma.studentLearningProfile.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.eleveId).toBe("e1");
  });

  it("filtre les evidences par tenantId et eleveId", async () => {
    await GET(req("http://l?eleveId=e1"));
    const where = mockPrisma.learningEvidence.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.eleveId).toBe("e1");
  });

  it("filtre les interventions par tenantId et eleveId", async () => {
    await GET(req("http://l?eleveId=e1"));
    const where = mockPrisma.studentIntervention.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.eleveId).toBe("e1");
  });

  it("filtre les plans par tenantId et eleveId", async () => {
    await GET(req("http://l?eleveId=e1"));
    const where = mockPrisma.planProgression.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.eleveId).toBe("e1");
  });

  it("renvoie les prédictions avec vérification", async () => {
    mockPrisma.predictionDifficulte.findMany.mockResolvedValue([
      {
        id: "pred1",
        probaReussite: 0.3,
        difficultePredite: "CRITIQUE",
        masteryAvant: 0.2,
        prerequisManquants: 3,
        masteryApres: 0.4,
        predictionCorrecte: true,
        ecart: 0.1,
        emiseLe: "2025-09-01",
        verifieeLe: "2025-10-01",
        competence: { id: "comp1", code: "MATH-C1", libelle: "Calculer" },
        chapitre: { id: "ch1", nom: "Dérivées" },
      },
    ]);
    const res = await GET(req("http://l?eleveId=e1"));
    const data = await res.json();
    expect(data.predictions).toHaveLength(1);
    expect(data.synthese.predictionsVerifiees).toBe(1);
    expect(data.synthese.predictionsCorrectes).toBe(1);
  });

  it("renvoie les recommandations résolues et actives", async () => {
    mockPrisma.recommandation.findMany.mockResolvedValue([
      {
        id: "r1",
        niveau: "CRITIQUE",
        statut: "OBLIGATOIRE",
        motif: "Compétence bloquante",
        actionProposee: "Remédiation",
        regleDeclenchee: "critique",
        competencesBloquees: 2,
        decideParId: null,
        decideeLe: null,
        resolueLe: null,
        createdAt: "2025-09-01",
        competence: { id: "comp1", code: "MATH-C1", libelle: "Calculer" },
      },
      {
        id: "r2",
        niveau: "FRAGILE",
        statut: "ECARTEE",
        motif: "Compétence fragile",
        actionProposee: "Exercices",
        regleDeclenchee: "fragile",
        competencesBloquees: 0,
        decideParId: "u1",
        decideeLe: "2025-09-02",
        resolueLe: "2025-10-01",
        createdAt: "2025-09-01",
        competence: { id: "comp2", code: "MATH-C2", libelle: "Intégrer" },
      },
    ]);
    const res = await GET(req("http://l?eleveId=e1"));
    const data = await res.json();
    expect(data.recommandations).toHaveLength(2);
    expect(data.synthese.recosActives).toBe(1);
    expect(data.synthese.recosResolues).toBe(1);
  });
});
