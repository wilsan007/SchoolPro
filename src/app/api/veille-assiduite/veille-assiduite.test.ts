import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/demo-now", () => ({
  getDemoNow: vi.fn(async () => new Date("2025-11-15T10:00:00Z")),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    eleve: { findMany: vi.fn() },
    absence: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCheckPermission = checkPermission as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  eleve: { findMany: ReturnType<typeof vi.fn> };
  absence: { findMany: ReturnType<typeof vi.fn> };
};

function req(url: string) {
  return { url } as unknown as import("next/server").NextRequest;
}

const { GET } = await import("@/app/api/veille-assiduite/route");

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckPermission.mockReturnValue(null);
  mockAuth.mockResolvedValue({
    user: { id: "u1", tenantId: "t1", role: "PRINCIPAL", siteId: null },
  });
  mockPrisma.eleve.findMany.mockResolvedValue([]);
  mockPrisma.absence.findMany.mockResolvedValue([]);
});

describe("GET /api/veille-assiduite", () => {
  it("refuse l'accès sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req("http://l"));
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission absences:read", async () => {
    mockCheckPermission.mockReturnValue(
      new Response("Forbidden", { status: 403 })
    );
    const res = await GET(req("http://l"));
    expect(res.status).toBe(403);
  });

  it("renvoie une liste vide si aucun élève", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([]);
    const res = await GET(req("http://l"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.eleves).toEqual([]);
    expect(data.synthese.total).toBe(0);
  });

  it("filtre les élèves par tenantId", async () => {
    await GET(req("http://l"));
    const where = mockPrisma.eleve.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.statut).toBe("ACTIF");
  });

  it("filtre par classeId quand fourni", async () => {
    await GET(req("http://l?classeId=c1"));
    const where = mockPrisma.eleve.findMany.mock.calls[0][0].where;
    expect(where.classeId).toBe("c1");
  });

  it("filtre les absences par tenantId", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([
      { id: "e1", nom: "A", prenom: "B", matricule: "M", classeId: "c1", classe: { id: "c1", nom: "T A", niveau: "T" } },
    ]);
    await GET(req("http://l"));
    const where = mockPrisma.absence.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.eleveId).toEqual({ in: ["e1"] });
  });

  it("détecte l'accélération de l'absentéisme", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([
      { id: "e1", nom: "A", prenom: "B", matricule: "M", classeId: "c1", classe: { id: "c1", nom: "T A", niveau: "T" } },
    ]);
    // 5 absences injustifiées dans la fenêtre courante (après 15 oct),
    // 2 dans la fenêtre précédente (avant 15 oct).
    mockPrisma.absence.findMany.mockResolvedValue([
      { eleveId: "e1", date: new Date("2025-11-01"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
      { eleveId: "e1", date: new Date("2025-11-05"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
      { eleveId: "e1", date: new Date("2025-11-10"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
      { eleveId: "e1", date: new Date("2025-11-12"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
      { eleveId: "e1", date: new Date("2025-11-14"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
      { eleveId: "e1", date: new Date("2025-10-01"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
      { eleveId: "e1", date: new Date("2025-10-10"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
    ]);
    const res = await GET(req("http://l"));
    const data = await res.json();
    expect(data.eleves).toHaveLength(1);
    const e = data.eleves[0];
    expect(e.absencesInjustifiees).toBe(5);
    expect(e.injustifieesPrecedentes).toBe(2);
    expect(e.acceleration).toBe(true);
    expect(e.enVeille).toBe(true);
    expect(data.synthese.enAcceleration).toBe(1);
    expect(data.synthese.enVeille).toBe(1);
  });

  it("détecte le taux critique sans accélération", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([
      { id: "e1", nom: "A", prenom: "B", matricule: "M", classeId: "c1", classe: { id: "c1", nom: "T A", niveau: "T" } },
    ]);
    // Beaucoup d'absences (taux > 20%) mais pas plus que la fenêtre précédente.
    const absences: { eleveId: string; date: Date; isRetard: boolean; motif: string; statut: string }[] = [];
    // 10 absences sur la fenêtre courante (~22 jours ouvrés → ~45%)
    for (let i = 1; i <= 10; i++) {
      absences.push({ eleveId: "e1", date: new Date(`2025-11-${String(i).padStart(2, "0")}`), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" });
    }
    // 10 absences sur la fenêtre précédente aussi (pas d'accélération)
    for (let i = 1; i <= 10; i++) {
      absences.push({ eleveId: "e1", date: new Date(`2025-10-${String(i).padStart(2, "0")}`), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" });
    }
    mockPrisma.absence.findMany.mockResolvedValue(absences);
    const res = await GET(req("http://l"));
    const data = await res.json();
    const e = data.eleves[0];
    expect(e.acceleration).toBe(false);
    expect(e.tauxCritique).toBe(true);
    expect(e.enVeille).toBe(true);
    expect(data.synthese.enTauxCritique).toBe(1);
  });

  it("marque un élève stable quand l'assiduité s'améliore", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([
      { id: "e1", nom: "A", prenom: "B", matricule: "M", classeId: "c1", classe: { id: "c1", nom: "T A", niveau: "T" } },
    ]);
    // 1 absence courante, 5 précédentes → amélioration
    mockPrisma.absence.findMany.mockResolvedValue([
      { eleveId: "e1", date: new Date("2025-11-05"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
      { eleveId: "e1", date: new Date("2025-10-01"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
      { eleveId: "e1", date: new Date("2025-10-05"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
      { eleveId: "e1", date: new Date("2025-10-10"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
      { eleveId: "e1", date: new Date("2025-10-15"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
    ]);
    const res = await GET(req("http://l"));
    const data = await res.json();
    const e = data.eleves[0];
    expect(e.acceleration).toBe(false);
    expect(e.tauxCritique).toBe(false);
    expect(e.enVeille).toBe(false);
  });

  it("trie les élèves en veille en premier", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([
      { id: "e1", nom: "Stable", prenom: "A", matricule: "M1", classeId: "c1", classe: { id: "c1", nom: "T A", niveau: "T" } },
      { id: "e2", nom: "Veille", prenom: "B", matricule: "M2", classeId: "c1", classe: { id: "c1", nom: "T A", niveau: "T" } },
    ]);
    mockPrisma.absence.findMany.mockResolvedValue([
      // e2 en veille (accélération)
      { eleveId: "e2", date: new Date("2025-11-10"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
      { eleveId: "e2", date: new Date("2025-11-12"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
      { eleveId: "e2", date: new Date("2025-11-14"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" },
    ]);
    const res = await GET(req("http://l"));
    const data = await res.json();
    expect(data.eleves[0].nom).toBe("Veille");
    expect(data.eleves[1].nom).toBe("Stable");
  });

  it("détecte le jour de semaine le plus manqué", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([
      { id: "e1", nom: "A", prenom: "B", matricule: "M", classeId: "c1", classe: { id: "c1", nom: "T A", niveau: "T" } },
    ]);
    // 3 absences le lundi (jour 1), 1 le mardi
    mockPrisma.absence.findMany.mockResolvedValue([
      { eleveId: "e1", date: new Date("2025-11-03"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" }, // lundi
      { eleveId: "e1", date: new Date("2025-11-10"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" }, // lundi
      { eleveId: "e1", date: new Date("2025-11-17"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" }, // lundi
      { eleveId: "e1", date: new Date("2025-11-04"), isRetard: false, motif: "INJUSTIFIE", statut: "INJUSTIFIEE" }, // mardi
    ]);
    const res = await GET(req("http://l"));
    const data = await res.json();
    expect(data.eleves[0].jourPire).toBe("Lun");
    expect(data.eleves[0].jourPireCount).toBe(3);
  });
});
