import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    classe: { findFirst: vi.fn() },
    periode: { findFirst: vi.fn() },
    eleve: { findMany: vi.fn() },
    absence: { findMany: vi.fn() },
    incident: { findMany: vi.fn() },
    recommandation: { findMany: vi.fn() },
    studentLearningProfile: { findMany: vi.fn() },
    studentIntervention: { findMany: vi.fn() },
    planProgression: { findMany: vi.fn() },
    predictionDifficulte: { findMany: vi.fn() },
    mentorat: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCheckPermission = checkPermission as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  classe: { findFirst: ReturnType<typeof vi.fn> };
  periode: { findFirst: ReturnType<typeof vi.fn> };
  eleve: { findMany: ReturnType<typeof vi.fn> };
  absence: { findMany: ReturnType<typeof vi.fn> };
  incident: { findMany: ReturnType<typeof vi.fn> };
  recommandation: { findMany: ReturnType<typeof vi.fn> };
  studentLearningProfile: { findMany: ReturnType<typeof vi.fn> };
  studentIntervention: { findMany: ReturnType<typeof vi.fn> };
  planProgression: { findMany: ReturnType<typeof vi.fn> };
  predictionDifficulte: { findMany: ReturnType<typeof vi.fn> };
  mentorat: { findMany: ReturnType<typeof vi.fn> };
};

function req(url: string) {
  return { url } as unknown as import("next/server").NextRequest;
}

const { GET } = await import("@/app/api/conseil-augmente/route");

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckPermission.mockReturnValue(null);
  mockAuth.mockResolvedValue({
    user: { id: "u1", tenantId: "t1", role: "PRINCIPAL", siteId: null },
  });
  // Stubs par défaut : classe et période trouvées, aucun élève/signaux.
  mockPrisma.classe.findFirst.mockResolvedValue({ id: "c1" });
  mockPrisma.periode.findFirst.mockResolvedValue({
    id: "p1",
    dateDebut: new Date("2025-09-01"),
    dateFin: new Date("2025-12-31"),
  });
  mockPrisma.eleve.findMany.mockResolvedValue([]);
  mockPrisma.absence.findMany.mockResolvedValue([]);
  mockPrisma.incident.findMany.mockResolvedValue([]);
  mockPrisma.recommandation.findMany.mockResolvedValue([]);
  mockPrisma.studentLearningProfile.findMany.mockResolvedValue([]);
  mockPrisma.studentIntervention.findMany.mockResolvedValue([]);
  mockPrisma.planProgression.findMany.mockResolvedValue([]);
  mockPrisma.predictionDifficulte.findMany.mockResolvedValue([]);
  mockPrisma.mentorat.findMany.mockResolvedValue([]);
});

describe("GET /api/conseil-augmente", () => {
  it("refuse l'accès sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req("http://l?classeId=c1&periodeId=p1"));
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission bulletins:read", async () => {
    mockCheckPermission.mockReturnValue(
      new Response("Forbidden", { status: 403 })
    );
    const res = await GET(req("http://l?classeId=c1&periodeId=p1"));
    expect(res.status).toBe(403);
  });

  it("rejette les paramètres manquants", async () => {
    const res = await GET(req("http://l"));
    expect(res.status).toBe(400);
  });

  it("renvoie 404 si la classe n'existe pas dans le tenant", async () => {
    mockPrisma.classe.findFirst.mockResolvedValue(null);
    const res = await GET(req("http://l?classeId=c1&periodeId=p1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("CLASSE_INTROUVABLE");
  });

  it("renvoie 404 si la période n'existe pas dans le tenant", async () => {
    mockPrisma.periode.findFirst.mockResolvedValue(null);
    const res = await GET(req("http://l?classeId=c1&periodeId=p1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PERIODE_INTROUVABLE");
  });

  it("filtre la classe par tenantId", async () => {
    await GET(req("http://l?classeId=c1&periodeId=p1"));
    const where = mockPrisma.classe.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.id).toBe("c1");
  });

  it("filtre la période par tenant via l'année", async () => {
    await GET(req("http://l?classeId=c1&periodeId=p1"));
    const where = mockPrisma.periode.findFirst.mock.calls[0][0].where;
    expect(where.annee).toEqual({ tenantId: "t1" });
  });

  it("renvoie une liste vide si aucun élève actif", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([]);
    const res = await GET(req("http://l?classeId=c1&periodeId=p1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.eleves).toEqual([]);
  });

  it("agrège les signaux par élève", async () => {
    mockPrisma.eleve.findMany
      .mockResolvedValueOnce([
        {
          id: "e1",
          nom: "Ahmed",
          prenom: "Ali",
          matricule: "M001",
          bulletins: [
            {
              id: "b1",
              moyenneGenerale: 14.5,
              rang: 3,
              decision: "ENCOURAGEMENTS",
              appreciation: "Travail satisfaisant",
              heuresAbsence: 4,
              matieres: [
                {
                  matiereId: "m1",
                  matiere: { nom: "Maths", code: "MATH" },
                  moyenneEleve: 15,
                  rang: 2,
                  appreciation: "Bien",
                },
              ],
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        { id: "e1", userId: "u-e1" },
      ]);
    mockPrisma.absence.findMany.mockResolvedValue([
      { eleveId: "e1", isRetard: false, motif: "INJUSTIFIE", statut: "EN_ATTENTE" },
      { eleveId: "e1", isRetard: true, motif: "JUSTIFIE", statut: "JUSTIFIE" },
    ]);
    mockPrisma.incident.findMany.mockResolvedValue([
      {
        eleveId: "e1",
        statut: "OUVERT",
        gravite: 3,
        sanctions: [{ id: "s1", type: "EXCLUSION_TEMP", dateFin: null, dateRetourEffective: null }],
      },
    ]);
    mockPrisma.recommandation.findMany.mockResolvedValue([
      { eleveId: "e1", niveau: "CRITIQUE" },
      { eleveId: "e1", niveau: "FRAGILE" },
    ]);
    mockPrisma.studentLearningProfile.findMany.mockResolvedValue([
      { eleveId: "e1", masteryStatus: "MASTERED" },
      { eleveId: "e1", masteryStatus: "DEVELOPING" },
      { eleveId: "e1", masteryStatus: "NEEDS_REVIEW" },
    ]);
    mockPrisma.studentIntervention.findMany.mockResolvedValue([
      { eleveId: "e1", status: "PROPOSED" },
    ]);
    mockPrisma.planProgression.findMany.mockResolvedValue([
      { eleveId: "e1", type: "remediation", statut: "ACTIF" },
    ]);
    mockPrisma.predictionDifficulte.findMany.mockResolvedValue([
      { eleveId: "e1", difficultePredite: "CRITIQUE" },
    ]);
    mockPrisma.mentorat.findMany.mockResolvedValue([
      { mentoreId: "u-e1", type: "ACADEMIQUE" },
    ]);

    const res = await GET(req("http://l?classeId=c1&periodeId=p1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.eleves).toHaveLength(1);
    const e = data.eleves[0];
    expect(e.nom).toBe("Ahmed");
    expect(e.moyenneGenerale).toBe(14.5);
    expect(e.rang).toBe(3);
    expect(e.decision).toBe("ENCOURAGEMENTS");
    expect(e.assiduite.absences).toBe(2);
    expect(e.assiduite.retards).toBe(1);
    expect(e.assiduite.injustifiees).toBe(1);
    expect(e.discipline.incidents).toBe(1);
    expect(e.discipline.incidentsGraves).toBe(1);
    expect(e.discipline.sanctionsActives).toBe(1);
    expect(e.learnos.recommandations).toBe(2);
    expect(e.learnos.recosCritiques).toBe(1);
    expect(e.learnos.recosFragiles).toBe(1);
    expect(e.learnos.competencesMaitrisees).toBe(1);
    expect(e.learnos.competencesFragiles).toBe(1);
    expect(e.learnos.competencesCritiques).toBe(1);
    expect(e.learnos.interventionsProposees).toBe(1);
    expect(e.learnos.plansRemediation).toBe(1);
    expect(e.learnos.predictionsEnCours).toBe(1);
    expect(e.learnos.predictionsCritiques).toBe(1);
    expect(e.mentorat).toBe("ACADEMIQUE");
    expect(e.matieres).toHaveLength(1);
    expect(e.matieres[0].matiere.nom).toBe("Maths");
  });

  it("trie les élèves par moyenne décroissante", async () => {
    mockPrisma.eleve.findMany
      .mockResolvedValueOnce([
        {
          id: "e1",
          nom: "Bas",
          prenom: "Eleve",
          matricule: "M001",
          bulletins: [{ moyenneGenerale: 8, rang: 5, decision: null, appreciation: "", heuresAbsence: 0, matieres: [] }],
        },
        {
          id: "e2",
          nom: "Haut",
          prenom: "Eleve",
          matricule: "M002",
          bulletins: [{ moyenneGenerale: 16, rang: 1, decision: null, appreciation: "", heuresAbsence: 0, matieres: [] }],
        },
      ])
      .mockResolvedValueOnce([]);
    const res = await GET(req("http://l?classeId=c1&periodeId=p1"));
    const data = await res.json();
    expect(data.eleves[0].moyenneGenerale).toBe(16);
    expect(data.eleves[1].moyenneGenerale).toBe(8);
  });

  it("filtre les absences par tenantId", async () => {
    // L'API court-circuite quand il n'y a aucun élève : il faut au moins un
    // élève pour que les requêtes de signaux soient exécutées.
    mockPrisma.eleve.findMany
      .mockResolvedValueOnce([
        { id: "e1", nom: "A", prenom: "B", matricule: "M", bulletins: [] },
      ])
      .mockResolvedValueOnce([]);
    await GET(req("http://l?classeId=c1&periodeId=p1"));
    const where = mockPrisma.absence.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
  });

  it("filtre les recommandations par tenantId", async () => {
    mockPrisma.eleve.findMany
      .mockResolvedValueOnce([
        { id: "e1", nom: "A", prenom: "B", matricule: "M", bulletins: [] },
      ])
      .mockResolvedValueOnce([]);
    await GET(req("http://l?classeId=c1&periodeId=p1"));
    const where = mockPrisma.recommandation.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
  });
});
