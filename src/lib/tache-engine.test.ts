import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks des dépendances externes ---

vi.mock("@/lib/prisma", () => ({
  default: {
    evaluation: { findMany: vi.fn() },
    affectationEnseignant: { findMany: vi.fn() },
    emploiTemps: { findMany: vi.fn() },
    seancePedagogique: { findMany: vi.fn() },
    devoir: { findMany: vi.fn() },
    bulletin: { findMany: vi.fn() },
    enseignant: { findMany: vi.fn() },
    incident: { findMany: vi.fn() },
    absence: { findMany: vi.fn() },
    facture: { findMany: vi.fn() },
    user: { findFirst: vi.fn() },
    invitationReinscription: { findMany: vi.fn() },
    eleveParent: { findMany: vi.fn() },
    tache: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn((args: unknown[]) => Promise.all(args)),
  },
}));

const DATE_REF = new Date("2026-04-07T10:00:00.000Z");
vi.mock("@/lib/demo-now", () => ({ getDemoNow: vi.fn(async () => DATE_REF) }));

vi.mock("@/lib/annee-scolaire", () => ({
  anneeActiveId: vi.fn(async () => "annee-1"),
  getAnneeCouranteLibelle: vi.fn(async () => "2025-2026"),
}));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
}));

import prisma from "@/lib/prisma";

const mockPrisma = prisma as unknown as {
  evaluation: { findMany: ReturnType<typeof vi.fn> };
  affectationEnseignant: { findMany: ReturnType<typeof vi.fn> };
  emploiTemps: { findMany: ReturnType<typeof vi.fn> };
  seancePedagogique: { findMany: ReturnType<typeof vi.fn> };
  devoir: { findMany: ReturnType<typeof vi.fn> };
  bulletin: { findMany: ReturnType<typeof vi.fn> };
  enseignant: { findMany: ReturnType<typeof vi.fn> };
  incident: { findMany: ReturnType<typeof vi.fn> };
  absence: { findMany: ReturnType<typeof vi.fn> };
  facture: { findMany: ReturnType<typeof vi.fn> };
  user: { findFirst: ReturnType<typeof vi.fn> };
  invitationReinscription: { findMany: ReturnType<typeof vi.fn> };
  eleveParent: { findMany: ReturnType<typeof vi.fn> };
  tache: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const { synchroniserTachesAuto, getTachesUtilisateur } = await import("./tache-engine");

const CLAIMS = { role: "TENANT_ADMIN", siteId: null };

beforeEach(() => {
  vi.clearAllMocks();

  // Par défaut, tous les scanners renvoient un tableau vide.
  mockPrisma.evaluation.findMany.mockResolvedValue([]);
  mockPrisma.affectationEnseignant.findMany.mockResolvedValue([]);
  mockPrisma.emploiTemps.findMany.mockResolvedValue([]);
  mockPrisma.seancePedagogique.findMany.mockResolvedValue([]);
  mockPrisma.devoir.findMany.mockResolvedValue([]);
  mockPrisma.bulletin.findMany.mockResolvedValue([]);
  mockPrisma.enseignant.findMany.mockResolvedValue([]);
  mockPrisma.incident.findMany.mockResolvedValue([]);
  mockPrisma.absence.findMany.mockResolvedValue([]);
  mockPrisma.facture.findMany.mockResolvedValue([]);
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.invitationReinscription.findMany.mockResolvedValue([]);
  mockPrisma.eleveParent.findMany.mockResolvedValue([]);
  mockPrisma.tache.findMany.mockResolvedValue([]);
  mockPrisma.tache.create.mockResolvedValue({});
  mockPrisma.tache.updateMany.mockResolvedValue({ count: 0 });
});

// ────────────────────────────────────────────────────────────────
// synchroniserTachesAuto
// ────────────────────────────────────────────────────────────────

describe("synchroniserTachesAuto", () => {
  it("détecte les évaluations passées sans notes et crée une tâche", async () => {
    // Une évaluation passée sans notes
    mockPrisma.evaluation.findMany.mockResolvedValue([
      {
        id: "eval-1",
        titre: "Devoir n°1",
        date: new Date("2026-03-01"),
        classeId: "cl-1",
        matiereId: "mat-1",
        classe: { nom: "5ème A", profPrincipalId: "prof-1" },
        matiere: { nom: "Mathématiques" },
      },
    ]);
    // L'enseignant responsable
    mockPrisma.affectationEnseignant.findMany.mockResolvedValue([
      {
        classeId: "cl-1",
        matiereId: "mat-1",
        enseignantId: "ens-1",
        enseignant: { id: "ens-1", userId: "user-ens-1", user: { name: "M. Ahmed" } },
      },
    ]);
    // Aucune tâche existante
    mockPrisma.tache.findMany.mockResolvedValue([]);

    const result = await synchroniserTachesAuto("t1", CLAIMS);

    expect(result.created).toBe(1);
    expect(result.total).toBe(1);

    // La tâche est créée avec le bon sourceType et sourceId
    expect(mockPrisma.tache.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t1",
          sourceType: "evaluation_sans_notes",
          sourceId: "eval-1",
          assigneeAId: "user-ens-1",
          titre: "Saisir les notes : Devoir n°1",
          type: "saisie_notes",
          statut: "A_FAIRE",
        }),
      })
    );
  });

  it("détecte les séances planifiées passées à valider", async () => {
    mockPrisma.seancePedagogique.findMany.mockResolvedValue([
      {
        id: "seance-1",
        date: new Date("2026-03-15"),
        enseignantId: "ens-1",
        enseignant: { userId: "user-ens-1", user: { name: "M. Ahmed" } },
        classe: { nom: "5ème A" },
        matiere: { nom: "Français" },
      },
    ]);
    mockPrisma.tache.findMany.mockResolvedValue([]);

    const result = await synchroniserTachesAuto("t1", CLAIMS);

    expect(result.created).toBe(1);

    expect(mockPrisma.tache.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: "seance_a_valider",
          sourceId: "seance-1",
          assigneeAId: "user-ens-1",
          type: "validation_seance",
        }),
      })
    );
  });

  it("détecte les devoirs rendus non corrigés", async () => {
    mockPrisma.devoir.findMany.mockResolvedValue([
      {
        id: "devoir-1",
        titre: "Exercices chapitre 3",
        dateRendu: new Date("2026-03-20"),
        enseignantId: "ens-1",
        enseignant: { userId: "user-ens-1" },
        classe: { nom: "4ème B" },
      },
    ]);
    mockPrisma.tache.findMany.mockResolvedValue([]);

    const result = await synchroniserTachesAuto("t1", CLAIMS);

    expect(result.created).toBe(1);

    expect(mockPrisma.tache.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: "devoir_a_corriger",
          sourceId: "devoir-1",
          assigneeAId: "user-ens-1",
          type: "correction_devoirs",
        }),
      })
    );
  });

  it("détecte les bulletins non publiés et assigne au prof principal", async () => {
    mockPrisma.bulletin.findMany.mockResolvedValue([
      {
        id: "bull-1",
        eleve: {
          nom: "Dupont",
          prenom: "Marie",
          classe: { nom: "3ème A", profPrincipalId: "prof-1" },
        },
        periode: { nom: "Trimestre 1" },
      },
    ]);
    mockPrisma.enseignant.findMany.mockResolvedValue([
      { id: "prof-1", userId: "user-prof-1" },
    ]);
    mockPrisma.tache.findMany.mockResolvedValue([]);

    const result = await synchroniserTachesAuto("t1", CLAIMS);

    expect(result.created).toBe(1);

    expect(mockPrisma.tache.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: "bulletin_a_publier",
          sourceId: "bull-1",
          assigneeAId: "user-prof-1",
          type: "remise_bulletins",
          priorite: "HAUTE",
        }),
      })
    );
  });

  it("détecte les incidents ouverts et assigne au prof principal", async () => {
    mockPrisma.incident.findMany.mockResolvedValue([
      {
        id: "inc-1",
        type: "BAGARRE",
        gravite: 3,
        date: new Date("2026-03-25"),
        eleve: {
          nom: "Ahmed",
          prenom: "Ali",
          classe: { nom: "5ème A", profPrincipalId: "prof-1" },
        },
      },
    ]);
    mockPrisma.enseignant.findMany.mockResolvedValue([
      { id: "prof-1", userId: "user-prof-1" },
    ]);
    mockPrisma.tache.findMany.mockResolvedValue([]);

    const result = await synchroniserTachesAuto("t1", CLAIMS);

    expect(result.created).toBe(1);

    expect(mockPrisma.tache.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: "incident_a_traiter",
          sourceId: "inc-1",
          priorite: "URGENTE", // gravité >= 3
        }),
      })
    );
  });

  it("détecte les factures en retard et assigne au comptable", async () => {
    mockPrisma.facture.findMany.mockResolvedValue([
      {
        id: "fact-1",
        numero: "F-2026-001",
        libelle: "Frais de scolarité",
        montant: 50000,
        echeance: new Date("2026-03-01"),
        eleve: { nom: "Said", prenom: "Fatima" },
      },
    ]);
    mockPrisma.user.findFirst.mockResolvedValue({ id: "user-compta" });
    mockPrisma.tache.findMany.mockResolvedValue([]);

    const result = await synchroniserTachesAuto("t1", CLAIMS);

    expect(result.created).toBe(1);

    expect(mockPrisma.tache.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: "facture_en_retard",
          sourceId: "fact-1",
          assigneeAId: "user-compta",
          type: "relance_facture",
        }),
      })
    );
  });

  it("détecte les invitations de réinscription en attente et assigne au parent", async () => {
    mockPrisma.invitationReinscription.findMany.mockResolvedValue([
      {
        id: "inv-1",
        eleveId: "ele-1",
        eleve: { nom: "Mahamoud", prenom: "Amina" },
        campagne: { libelle: "Campagne 2026", anneeCible: "2026-2027" },
      },
    ]);
    mockPrisma.eleveParent.findMany.mockResolvedValue([
      {
        eleveId: "ele-1",
        parent: { userId: "user-parent-1" },
      },
    ]);
    mockPrisma.tache.findMany.mockResolvedValue([]);

    const result = await synchroniserTachesAuto("t1", CLAIMS);

    expect(result.created).toBe(1);

    expect(mockPrisma.tache.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: "reinscription_en_attente",
          sourceId: "inv-1",
          assigneeAId: "user-parent-1",
          type: "reinscription",
        }),
      })
    );
  });

  // ── Idempotence ───────────────────────────────────────────────

  it("ne recrée pas une tâche si sourceType+sourceId existe déjà", async () => {
    mockPrisma.evaluation.findMany.mockResolvedValue([
      {
        id: "eval-1",
        titre: "Devoir n°1",
        date: new Date("2026-03-01"),
        classeId: "cl-1",
        matiereId: "mat-1",
        classe: { nom: "5ème A", profPrincipalId: "prof-1" },
        matiere: { nom: "Mathématiques" },
      },
    ]);
    mockPrisma.affectationEnseignant.findMany.mockResolvedValue([
      {
        classeId: "cl-1",
        matiereId: "mat-1",
        enseignantId: "ens-1",
        enseignant: { id: "ens-1", userId: "user-ens-1", user: { name: "M. Ahmed" } },
      },
    ]);

    // La tâche existe déjà pour cette source
    mockPrisma.tache.findMany.mockResolvedValue([
      {
        id: "tache-exist-1",
        sourceType: "evaluation_sans_notes",
        sourceId: "eval-1",
        statut: "A_FAIRE",
      },
    ]);

    const result = await synchroniserTachesAuto("t1", CLAIMS);

    expect(result.created).toBe(0);
    expect(result.total).toBe(1); // la source est toujours active
    expect(mockPrisma.tache.create).not.toHaveBeenCalled();
    // Aucune tâche à fermer : la source est toujours active
    expect(mockPrisma.tache.updateMany).not.toHaveBeenCalled();
  });

  it("ferme les tâches dont la source n'est plus pertinente", async () => {
    // Aucune source active (tous les scanners renvoient vide par défaut)
    // Mais une tâche existe encore
    mockPrisma.tache.findMany.mockResolvedValue([
      {
        id: "tache-old-1",
        sourceType: "evaluation_sans_notes",
        sourceId: "eval-gone",
        statut: "A_FAIRE",
      },
    ]);
    mockPrisma.tache.updateMany.mockResolvedValue({ count: 1 });

    const result = await synchroniserTachesAuto("t1", CLAIMS);

    expect(result.created).toBe(0);
    expect(result.closed).toBe(1);
    expect(result.total).toBe(0);

    expect(mockPrisma.tache.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["tache-old-1"] },
        }),
        data: expect.objectContaining({
          statut: "FAIT",
        }),
      })
    );
  });

  it("renvoie un SyncResult avec created, closed et total", async () => {
    const result = await synchroniserTachesAuto("t1", CLAIMS);

    expect(result).toHaveProperty("created");
    expect(result).toHaveProperty("closed");
    expect(result).toHaveProperty("total");
    expect(typeof result.created).toBe("number");
    expect(typeof result.closed).toBe("number");
    expect(typeof result.total).toBe("number");
  });

  it("utilise les claims par défaut (TENANT_ADMIN, siteId null) si non fournis", async () => {
    // Aucun claim passé — le moteur doit utiliser des claims par défaut
    const result = await synchroniserTachesAuto("t1");
    expect(result).toBeDefined();
    expect(result.total).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────
// getTachesUtilisateur
// ────────────────────────────────────────────────────────────────

describe("getTachesUtilisateur", () => {
  it("filtre par tenantId et userId", async () => {
    const taches = [
      {
        id: "t1",
        titre: "Saisir les notes",
        description: "5ème A · Mathématiques",
        type: "saisie_notes",
        priorite: "NORMALE",
        statut: "A_FAIRE",
        echeance: new Date("2026-04-10"),
        dateFaite: null,
        sourceType: "evaluation_sans_notes",
        sourceId: "eval-1",
        classe: { id: "cl-1", nom: "5ème A" },
        matiere: { id: "mat-1", nom: "Mathématiques" },
        assigneeA: { id: "u1", name: "M. Ahmed", email: "a@test.com" },
        creePar: null,
      },
    ];
    mockPrisma.tache.findMany.mockResolvedValue(taches);

    const result = await getTachesUtilisateur("t1", "u1", CLAIMS);

    expect(result.taches).toHaveLength(1);
    expect(result.taches[0].titre).toBe("Saisir les notes");
    expect(result.taches[0].echeance).toBe("2026-04-10T00:00:00.000Z");

    const where = mockPrisma.tache.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.assigneeAId).toBe("u1");
  });

  it("filtre par statut quand l'option est fournie", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([]);

    await getTachesUtilisateur("t1", "u1", CLAIMS, { statut: "A_FAIRE" });

    const where = mockPrisma.tache.findMany.mock.calls[0][0].where;
    expect(where.statut).toBe("A_FAIRE");
  });

  it("respecte la limite par défaut (200)", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([]);

    await getTachesUtilisateur("t1", "u1", CLAIMS);

    expect(mockPrisma.tache.findMany.mock.calls[0][0].take).toBe(200);
  });

  it("respecte une limite personnalisée", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([]);

    await getTachesUtilisateur("t1", "u1", CLAIMS, { limit: 50 });

    expect(mockPrisma.tache.findMany.mock.calls[0][0].take).toBe(50);
  });

  it("sérialise echeance et dateFaite en ISO string", async () => {
    const echeance = new Date("2026-04-10T12:00:00.000Z");
    const dateFaite = new Date("2026-04-05T08:00:00.000Z");
    mockPrisma.tache.findMany.mockResolvedValue([
      {
        id: "t1",
        titre: "Tâche 1",
        description: null,
        type: "autre",
        priorite: "NORMALE",
        statut: "FAIT",
        echeance,
        dateFaite,
        sourceType: null,
        sourceId: null,
        classe: null,
        matiere: null,
        assigneeA: { id: "u1", name: null, email: null },
        creePar: null,
      },
    ]);

    const result = await getTachesUtilisateur("t1", "u1", CLAIMS);

    expect(result.taches[0].echeance).toBe(echeance.toISOString());
    expect(result.taches[0].dateFaite).toBe(dateFaite.toISOString());
  });

  it("gère echeance et dateFaite null", async () => {
    mockPrisma.tache.findMany.mockResolvedValue([
      {
        id: "t1",
        titre: "Tâche sans échéance",
        description: null,
        type: "autre",
        priorite: "BASSE",
        statut: "A_FAIRE",
        echeance: null,
        dateFaite: null,
        sourceType: null,
        sourceId: null,
        classe: null,
        matiere: null,
        assigneeA: { id: "u1", name: "User", email: "u@test.com" },
        creePar: null,
      },
    ]);

    const result = await getTachesUtilisateur("t1", "u1", CLAIMS);

    expect(result.taches[0].echeance).toBeNull();
    expect(result.taches[0].dateFaite).toBeNull();
  });
});
