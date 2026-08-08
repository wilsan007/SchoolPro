import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    absencePersonnel: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    congePersonnel: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    ficheRH: {
      update: vi.fn().mockResolvedValue({}),
    },
    enseignant: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rbac", () => ({
  checkPermission: vi.fn(() => null),
}));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  absencePersonnel: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  congePersonnel: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  ficheRH: {
    update: ReturnType<typeof vi.fn>;
  };
  enseignant: {
    findFirst: ReturnType<typeof vi.fn>;
  };
};

function createMockReq(url: string, method: string, body?: unknown) {
  return {
    method,
    url,
    json: () => Promise.resolve(body),
  } as unknown as Request;
}

// Import after mocks
const { GET: getAbsences, POST: postAbsence } = await import(
  "@/app/api/rh/absences/route"
);
const { PATCH: patchAbsence } = await import(
  "@/app/api/rh/absences/[id]/route"
);
const { GET: getConges, POST: postConge } = await import(
  "@/app/api/rh/conges/route"
);
const { PATCH: patchConge } = await import("@/app/api/rh/conges/[id]/route");

describe("RH Absences API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "user1", tenantId: "tenant1", role: "ADMIN" },
    });
  });

  describe("GET /api/rh/absences", () => {
    it("returns 401 when no session", async () => {
      mockAuth.mockResolvedValue(null);
      const req = createMockReq("http://localhost/api/rh/absences", "GET");
      const res = await getAbsences(req as never);
      expect(res.status).toBe(401);
    });

    it("returns absences list", async () => {
      const mockAbsences = [
        { id: "a1", type: "ABSENCE", enseignant: { user: { name: "John" } } },
      ];
      mockPrisma.absencePersonnel.findMany.mockResolvedValue(mockAbsences);
      const req = createMockReq("http://localhost/api/rh/absences", "GET");
      const res = await getAbsences(req as never);
      const data = await res.json();
      expect(data.absences).toEqual(mockAbsences);
    });

    it("filters by enseignantId", async () => {
      mockPrisma.absencePersonnel.findMany.mockResolvedValue([]);
      const req = createMockReq(
        "http://localhost/api/rh/absences?enseignantId=ens1",
        "GET"
      );
      await getAbsences(req as never);
      const call = mockPrisma.absencePersonnel.findMany.mock.calls[0][0];
      expect(call.where.enseignantId).toBe("ens1");
    });
  });

  describe("POST /api/rh/absences", () => {
    it("returns 401 when no session", async () => {
      mockAuth.mockResolvedValue(null);
      const req = createMockReq("http://localhost/api/rh/absences", "POST", {});
      const res = await postAbsence(req as never);
      expect(res.status).toBe(401);
    });

    it("returns 404 when enseignant not found", async () => {
      mockPrisma.enseignant.findFirst.mockResolvedValue(null);
      const req = createMockReq("http://localhost/api/rh/absences", "POST", {
        enseignantId: "e1",
        date: "2025-01-01",
        type: "ABSENCE",
      });
      const res = await postAbsence(req as never);
      expect(res.status).toBe(404);
    });

    it("creates absence successfully", async () => {
      mockPrisma.enseignant.findFirst.mockResolvedValue({ id: "e1" });
      mockPrisma.absencePersonnel.create.mockResolvedValue({ id: "a1" });
      const req = createMockReq("http://localhost/api/rh/absences", "POST", {
        enseignantId: "e1",
        date: "2025-01-01",
        type: "RETARD",
        heureDebut: "08:00",
        heureFin: "09:00",
        motif: "Retard",
      });
      const res = await postAbsence(req as never);
      const data = await res.json();
      expect(data.absence).toEqual({ id: "a1" });
      expect(mockPrisma.absencePersonnel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            enseignantId: "e1",
            saisieParId: "user1",
            type: "RETARD",
          }),
        })
      );
    });
  });

  describe("PATCH /api/rh/absences/[id]", () => {
    it("returns 401 when no session", async () => {
      mockAuth.mockResolvedValue(null);
      const req = createMockReq("http://localhost/api/rh/absences/a1", "PATCH", {});
      const res = await patchAbsence(req as never, {
        params: Promise.resolve({ id: "a1" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 404 when absence not found", async () => {
      mockPrisma.absencePersonnel.findFirst.mockResolvedValue(null);
      const req = createMockReq("http://localhost/api/rh/absences/a1", "PATCH", {
        statut: "JUSTIFIEE",
      });
      const res = await patchAbsence(req as never, {
        params: Promise.resolve({ id: "a1" }),
      });
      expect(res.status).toBe(404);
    });

    it("updates absence statut successfully", async () => {
      mockPrisma.absencePersonnel.findFirst.mockResolvedValue({
        id: "a1",
        enseignantId: "e1",
        commentaire: null,
      });
      mockPrisma.absencePersonnel.update.mockResolvedValue({
        id: "a1",
        statut: "JUSTIFIEE",
      });
      mockPrisma.absencePersonnel.count.mockResolvedValue(2);
      const req = createMockReq("http://localhost/api/rh/absences/a1", "PATCH", {
        statut: "JUSTIFIEE",
      });
      const res = await patchAbsence(req as never, {
        params: Promise.resolve({ id: "a1" }),
      });
      const data = await res.json();
      expect(data.absence.statut).toBe("JUSTIFIEE");
    });
  });
});

describe("RH Congés API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "user1", tenantId: "tenant1", role: "ADMIN" },
    });
  });

  describe("GET /api/rh/conges", () => {
    it("returns 401 when no session", async () => {
      mockAuth.mockResolvedValue(null);
      const req = createMockReq("http://localhost/api/rh/conges", "GET");
      const res = await getConges(req as never);
      expect(res.status).toBe(401);
    });

    it("returns conges list", async () => {
      const mockConges = [
        { id: "c1", type: "ANNUEL", enseignant: { user: { name: "John" } } },
      ];
      mockPrisma.congePersonnel.findMany.mockResolvedValue(mockConges);
      const req = createMockReq("http://localhost/api/rh/conges", "GET");
      const res = await getConges(req as never);
      const data = await res.json();
      expect(data.conges).toEqual(mockConges);
    });

    it("filters by statut", async () => {
      mockPrisma.congePersonnel.findMany.mockResolvedValue([]);
      const req = createMockReq(
        "http://localhost/api/rh/conges?statut=DEMANDE",
        "GET"
      );
      await getConges(req as never);
      const call = mockPrisma.congePersonnel.findMany.mock.calls[0][0];
      expect(call.where.statut).toBe("DEMANDE");
    });
  });

  describe("POST /api/rh/conges", () => {
    it("returns 401 when no session", async () => {
      mockAuth.mockResolvedValue(null);
      const req = createMockReq("http://localhost/api/rh/conges", "POST", {});
      const res = await postConge(req as never);
      expect(res.status).toBe(401);
    });

    it("returns 404 when enseignant not found", async () => {
      mockPrisma.enseignant.findFirst.mockResolvedValue(null);
      const req = createMockReq("http://localhost/api/rh/conges", "POST", {
        enseignantId: "e1",
        type: "ANNUEL",
        dateDebut: "2025-01-01",
        dateFin: "2025-01-10",
        nbJours: 10,
      });
      const res = await postConge(req as never);
      expect(res.status).toBe(404);
    });

    it("creates conge successfully", async () => {
      mockPrisma.enseignant.findFirst.mockResolvedValue({ id: "e1" });
      mockPrisma.congePersonnel.create.mockResolvedValue({ id: "c1" });
      const req = createMockReq("http://localhost/api/rh/conges", "POST", {
        enseignantId: "e1",
        type: "MALADIE",
        dateDebut: "2025-01-01",
        dateFin: "2025-01-05",
        nbJours: 5,
        motif: "Maladie",
      });
      const res = await postConge(req as never);
      const data = await res.json();
      expect(data.conge).toEqual({ id: "c1" });
      expect(mockPrisma.congePersonnel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            enseignantId: "e1",
            demandeParId: "user1",
            type: "MALADIE",
            nbJours: 5,
          }),
        })
      );
    });
  });

  describe("PATCH /api/rh/conges/[id]", () => {
    it("returns 401 when no session", async () => {
      mockAuth.mockResolvedValue(null);
      const req = createMockReq("http://localhost/api/rh/conges/c1", "PATCH", {});
      const res = await patchConge(req as never, {
        params: Promise.resolve({ id: "c1" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 404 when conge not found", async () => {
      mockPrisma.congePersonnel.findFirst.mockResolvedValue(null);
      const req = createMockReq("http://localhost/api/rh/conges/c1", "PATCH", {
        action: "APPROUVE",
      });
      const res = await patchConge(req as never, {
        params: Promise.resolve({ id: "c1" }),
      });
      expect(res.status).toBe(404);
    });

    it("approves conge and increments congesPris for ANNUEL", async () => {
      mockPrisma.congePersonnel.findFirst.mockResolvedValue({
        id: "c1",
        enseignantId: "e1",
        type: "ANNUEL",
        nbJours: 5,
        commentaire: null,
      });
      mockPrisma.congePersonnel.update.mockResolvedValue({
        id: "c1",
        statut: "APPROUVE",
      });
      const req = createMockReq("http://localhost/api/rh/conges/c1", "PATCH", {
        action: "APPROUVE",
      });
      const res = await patchConge(req as never, {
        params: Promise.resolve({ id: "c1" }),
      });
      const data = await res.json();
      expect(data.conge.statut).toBe("APPROUVE");
      expect(mockPrisma.ficheRH.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { congesPris: { increment: 5 } },
        })
      );
    });

    it("refuses conge without incrementing congesPris", async () => {
      mockPrisma.congePersonnel.findFirst.mockResolvedValue({
        id: "c2",
        enseignantId: "e1",
        type: "ANNUEL",
        nbJours: 3,
        commentaire: null,
      });
      mockPrisma.congePersonnel.update.mockResolvedValue({
        id: "c2",
        statut: "REFUSE",
      });
      const req = createMockReq("http://localhost/api/rh/conges/c2", "PATCH", {
        action: "REFUSE",
      });
      await patchConge(req as never, {
        params: Promise.resolve({ id: "c2" }),
      });
      expect(mockPrisma.ficheRH.update).not.toHaveBeenCalled();
    });
  });
});
