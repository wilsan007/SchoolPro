import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    anneesScolaires: { findFirst: vi.fn() },
    emploiTemps: { findMany: vi.fn() },
    evenementCalendaire: { findMany: vi.fn() },
    remplacementCours: { findMany: vi.fn() },
    planificationChapitre: { findMany: vi.fn() },
    seancePedagogique: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));

vi.mock("@/lib/annee-scolaire", () => ({
  getAnneeCouranteLibelle: vi.fn().mockResolvedValue("2025-2026"),
}));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
}));

vi.mock("@/lib/teacher-classes", () => ({
  getTeacherScope: vi.fn().mockResolvedValue({
    classeIds: ["c1"],
    matiereIds: ["m1"],
    isRestricted: true,
  }),
  isTeacherRole: vi.fn((role: string) =>
    role === "TEACHER" || role === "CLASS_TEACHER"
  ),
}));

vi.mock("@/lib/audit", () => ({ auditFire: vi.fn() }));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCheckPermission = checkPermission as ReturnType<typeof vi.fn>;
const mockGetAnneeCouranteLibelle =
  getAnneeCouranteLibelle as ReturnType<typeof vi.fn>;
const mockGetTeacherScope = getTeacherScope as ReturnType<typeof vi.fn>;
const mockIsTeacherRole = isTeacherRole as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  anneesScolaires: { findFirst: ReturnType<typeof vi.fn> };
  emploiTemps: { findMany: ReturnType<typeof vi.fn> };
  evenementCalendaire: { findMany: ReturnType<typeof vi.fn> };
  remplacementCours: { findMany: ReturnType<typeof vi.fn> };
  planificationChapitre: { findMany: ReturnType<typeof vi.fn> };
  seancePedagogique: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

function req(url: string, body?: unknown) {
  return { url, json: () => Promise.resolve(body) } as unknown as Request;
}

const { POST } = await import("@/app/api/cahier-journal/generer-semaine/route");

const SESSION_ADMIN = {
  user: { id: "u1", tenantId: "t1", role: "TENANT_ADMIN", siteId: null },
};

const SESSION_TEACHER = {
  user: { id: "u-teacher", tenantId: "t1", role: "TEACHER", siteId: null },
};

const ANNEE_RECORD = {
  id: "an1",
  libelle: "2025-2026",
  dateDebut: new Date("2025-09-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckPermission.mockReturnValue(null);
  mockGetAnneeCouranteLibelle.mockResolvedValue("2025-2026");
  mockIsTeacherRole.mockImplementation(
    (role: string) => role === "TEACHER" || role === "CLASS_TEACHER"
  );
  mockGetTeacherScope.mockResolvedValue({
    classeIds: ["c1"],
    matiereIds: ["m1"],
    isRestricted: true,
  });
  mockAuth.mockResolvedValue(SESSION_ADMIN);
  mockPrisma.anneesScolaires.findFirst.mockResolvedValue(ANNEE_RECORD);
  mockPrisma.evenementCalendaire.findMany.mockResolvedValue([]);
  mockPrisma.remplacementCours.findMany.mockResolvedValue([]);
  mockPrisma.planificationChapitre.findMany.mockResolvedValue([]);
  mockPrisma.seancePedagogique.findFirst.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// POST /api/cahier-journal/generer-semaine
// ---------------------------------------------------------------------------

describe("POST /api/cahier-journal/generer-semaine", () => {
  it("refuse l'accès sans session (401)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(req("http://l", { semaine: 1 }) as never);
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission cahier-journal:write (403)", async () => {
    mockCheckPermission.mockReturnValue(
      new Response("Forbidden", { status: 403 })
    );
    const res = await POST(req("http://l", { semaine: 1 }) as never);
    expect(res.status).toBe(403);
  });

  it("rejette les données invalides — semaine hors range (400)", async () => {
    const res = await POST(req("http://l", { semaine: 99 }) as never);
    expect(res.status).toBe(400);
  });

  it("retourne 400 si aucune année courante n'est active", async () => {
    mockGetAnneeCouranteLibelle.mockResolvedValue(null);
    const res = await POST(req("http://l", { semaine: 1 }) as never);
    expect(res.status).toBe(400);
  });

  it("retourne 404 si l'année scolaire est introuvable", async () => {
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue(null);
    const res = await POST(req("http://l", { semaine: 1 }) as never);
    expect(res.status).toBe(404);
  });

  it("génère les séances d'une semaine à partir de l'EDT (201)", async () => {
    mockPrisma.emploiTemps.findMany.mockResolvedValue([
      {
        id: "edt1",
        classeId: "c1",
        matiereId: "m1",
        enseignantId: "e1",
        jour: "LUNDI",
        heureDebut: "08:00",
        heureFin: "09:00",
        matiere: { id: "m1" },
      },
    ]);
    mockPrisma.seancePedagogique.create.mockResolvedValue({
      id: "s1",
      classeId: "c1",
      matiereId: "m1",
      matiere: { id: "m1", nom: "Maths", code: "MAT", couleur: null },
      classe: { id: "c1", nom: "6A", niveau: "6EME" },
      chapitre: null,
    });
    const res = await POST(req("http://l", { semaine: 1 }) as never);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.crees).toBe(1);
    expect(data.ignores).toBe(0);
    expect(data.total).toBe(1);
    expect(data.seances).toHaveLength(1);
  });

  it("retourne un résultat vide quand l'EDT est vide", async () => {
    mockPrisma.emploiTemps.findMany.mockResolvedValue([]);
    const res = await POST(req("http://l", { semaine: 1 }) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.crees).toBe(0);
    expect(data.ignores).toBe(0);
    expect(data.total).toBe(0);
  });

  it("ignore les créneaux déjà générés (idempotence)", async () => {
    mockPrisma.emploiTemps.findMany.mockResolvedValue([
      {
        id: "edt1",
        classeId: "c1",
        matiereId: "m1",
        enseignantId: "e1",
        jour: "LUNDI",
        heureDebut: "08:00",
        heureFin: "09:00",
        matiere: { id: "m1" },
      },
    ]);
    mockPrisma.seancePedagogique.findFirst.mockResolvedValue({
      id: "existante",
    }); // séance déjà existante
    const res = await POST(req("http://l", { semaine: 1 }) as never);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.crees).toBe(0);
    expect(data.ignores).toBe(1);
    expect(mockPrisma.seancePedagogique.create).not.toHaveBeenCalled();
  });

  it("ignore les créneaux tombant dans une période de vacances", async () => {
    // La semaine 1 commence le 2025-09-01 (lundi). Le créneau LUNDI tombe le
    // 2025-09-01. On déclare une vacance couvrant cette date.
    mockPrisma.emploiTemps.findMany.mockResolvedValue([
      {
        id: "edt1",
        classeId: "c1",
        matiereId: "m1",
        enseignantId: "e1",
        jour: "LUNDI",
        heureDebut: "08:00",
        heureFin: "09:00",
        matiere: { id: "m1" },
      },
    ]);
    mockPrisma.evenementCalendaire.findMany.mockResolvedValue([
      {
        type: "VACANCE_SCOLAIRE",
        dateDebut: new Date("2025-08-31T00:00:00.000Z"),
        dateFin: new Date("2025-09-02T00:00:00.000Z"),
      },
    ]);
    const res = await POST(req("http://l", { semaine: 1 }) as never);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.crees).toBe(0);
    expect(data.ignores).toBe(1);
  });

  it("restreint l'EDT au périmètre enseignant (teacher scope)", async () => {
    mockAuth.mockResolvedValue(SESSION_TEACHER);
    mockPrisma.emploiTemps.findMany.mockResolvedValue([]);
    await POST(req("http://l", { semaine: 1 }) as never);
    const where = mockPrisma.emploiTemps.findMany.mock.calls[0][0].where;
    // Le périmètre enseignant restreint par classeIds ET matiereIds
    expect(where.AND).toEqual([
      { classeId: { in: ["c1"] } },
      { matiereId: { in: ["m1"] } },
    ]);
  });

  it("ne restreint pas l'EDT pour un admin (pas de teacher scope)", async () => {
    mockPrisma.emploiTemps.findMany.mockResolvedValue([]);
    await POST(req("http://l", { semaine: 1 }) as never);
    const where = mockPrisma.emploiTemps.findMany.mock.calls[0][0].where;
    expect(where.AND).toBeUndefined();
  });
});
