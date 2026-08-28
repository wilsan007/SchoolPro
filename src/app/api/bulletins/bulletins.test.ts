import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks des dépendances externes ──────────────────────────────
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    classe: { findFirst: vi.fn() },
    periode: { findFirst: vi.fn() },
    eleve: { findMany: vi.fn() },
    note: { findMany: vi.fn() },
    absence: { findMany: vi.fn() },
    dispenseMatiere: { findMany: vi.fn() },
    reglesAppreciation: { findMany: vi.fn() },
    bulletin: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    bulletinMatiere: { deleteMany: vi.fn(), createMany: vi.fn() },
    bulletinHistorique: { findMany: vi.fn(), create: vi.fn() },
    notification: { create: vi.fn() },
  },
}));

vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
  personalScopeFilter: vi.fn(() => ({})),
  mergeFilters: vi.fn((...args: unknown[]) => Object.assign({}, ...args)),
}));

vi.mock("@/lib/site-filter", () => ({
  siteFilterForRelation: vi.fn(() => ({})),
  eleveScopeFilter: vi.fn(() => ({})),
  mergeFilters: vi.fn((...args: unknown[]) => Object.assign({}, ...args)),
}));

vi.mock("@/lib/annee-scolaire", () => ({
  getAnneeCouranteLibelle: vi.fn(async () => "2025-2026"),
  anneeActiveId: vi.fn(async () => "annee-1"),
}));

vi.mock("@/lib/teacher-classes", () => ({
  isTeacherRole: vi.fn(() => false),
  getTeacherScope: vi.fn(async () => ({ isRestricted: false, classeIds: [] })),
}));

vi.mock("@/lib/bulletin-historique", () => ({
  enregistrerHistoriqueBulletin: vi.fn(async () => {}),
  tracerModificationsBulletin: vi.fn(async () => {}),
  peutModifierBulletin: vi.fn(() => true),
  bulletinEstVerrouille: vi.fn((statut: string) => statut === "VERROUILLE" || statut === "PUBLIE"),
}));

vi.mock("@/lib/utils", () => ({ calculerMoyenne: vi.fn(() => 14) }));

vi.mock("@/lib/demo-now", () => ({ getDemoNow: vi.fn(async () => new Date("2026-01-15T00:00:00.000Z")) }));

// ── Imports APRÈS les mocks ─────────────────────────────────────
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { peutModifierBulletin, enregistrerHistoriqueBulletin } from "@/lib/bulletin-historique";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCheckPermission = checkPermission as ReturnType<typeof vi.fn>;
const mockPeutModifier = peutModifierBulletin as ReturnType<typeof vi.fn>;
const mockEnregistrerHistorique = enregistrerHistoriqueBulletin as ReturnType<typeof vi.fn>;

const mockPrisma = prisma as unknown as {
  classe: { findFirst: ReturnType<typeof vi.fn> };
  periode: { findFirst: ReturnType<typeof vi.fn> };
  eleve: { findMany: ReturnType<typeof vi.fn> };
  note: { findMany: ReturnType<typeof vi.fn> };
  absence: { findMany: ReturnType<typeof vi.fn> };
  dispenseMatiere: { findMany: ReturnType<typeof vi.fn> };
  reglesAppreciation: { findMany: ReturnType<typeof vi.fn> };
  bulletin: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  bulletinMatiere: { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
  bulletinHistorique: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  notification: { create: ReturnType<typeof vi.fn> };
};

// ── Helpers ─────────────────────────────────────────────────────
function req(url: string, body?: unknown) {
  return { url, json: () => Promise.resolve(body) } as unknown as import("next/server").NextRequest;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const SESSION = {
  user: {
    id: "u1",
    tenantId: "t1",
    role: "TENANT_ADMIN",
    name: "Admin Test",
    siteId: null,
  },
};

const { POST: POST_GENERER } = await import("@/app/api/bulletins/generer/route");
const { POST: POST_PUBLIER } = await import("@/app/api/bulletins/publier/route");
const { POST: POST_VERROUILLER } = await import("@/app/api/bulletins/verrouiller/route");
const { PUT: PUT_BULLETIN, DELETE: DELETE_BULLETIN } = await import("@/app/api/bulletins/[id]/route");
const { GET: GET_HISTORIQUE } = await import("@/app/api/bulletins/[id]/historique/route");
const { GET: GET_LIST } = await import("@/app/api/bulletins/list/route");
const { GET: GET_CHECK } = await import("@/app/api/bulletins/check-existing/route");

// ── Setup par défaut ────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockCheckPermission.mockReturnValue(null);
  mockPeutModifier.mockReturnValue(true);
  mockEnregistrerHistorique.mockResolvedValue(undefined);
  mockAuth.mockResolvedValue(SESSION);
});

// ================================================================
// POST /api/bulletins/generer
// ================================================================
describe("POST /api/bulletins/generer", () => {
  function stubGenerationSuccess() {
    mockPrisma.classe.findFirst.mockResolvedValue({
      id: "c1",
      nom: "5ème B",
      eleves: [{ id: "e1", nom: "Dupont", prenom: "Marie" }],
    });
    mockPrisma.periode.findFirst.mockResolvedValue({
      id: "p1",
      nom: "Trimestre 1",
      dateDebut: new Date("2025-09-01"),
      dateFin: new Date("2025-12-31"),
    });
    mockPrisma.reglesAppreciation.findMany.mockResolvedValue([]);
    mockPrisma.note.findMany.mockResolvedValue([
      { eleveId: "e1", matiereId: "m1", valeur: 14, noteMax: 20, coefficient: 1, matiere: { id: "m1", coefficient: 1 } },
    ]);
    mockPrisma.dispenseMatiere.findMany.mockResolvedValue([]);
    mockPrisma.absence.findMany.mockResolvedValue([]);
    mockPrisma.bulletin.findFirst.mockResolvedValue(null);
    mockPrisma.bulletin.upsert.mockResolvedValue({ id: "b1", statut: "BROUILLON" });
    mockPrisma.bulletinMatiere.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.bulletinMatiere.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.bulletin.updateMany.mockResolvedValue({ count: 1 });
  }

  it("refuse sans session (401)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST_GENERER(req("http://l/api/bulletins/generer", { classeId: "c1", periodeId: "p1" }));
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission bulletins:write (403)", async () => {
    mockCheckPermission.mockReturnValue(new Response("Forbidden", { status: 403 }) as never);
    const res = await POST_GENERER(req("http://l/api/bulletins/generer", { classeId: "c1", periodeId: "p1" }));
    expect(res.status).toBe(403);
  });

  it("rejette les données invalides (400)", async () => {
    const res = await POST_GENERER(req("http://l/api/bulletins/generer", { classeId: "" }));
    expect(res.status).toBe(400);
  });

  it("retourne 404 si la classe est introuvable", async () => {
    mockPrisma.classe.findFirst.mockResolvedValue(null);
    mockPrisma.periode.findFirst.mockResolvedValue({ id: "p1" });
    const res = await POST_GENERER(req("http://l/api/bulletins/generer", { classeId: "c1", periodeId: "p1" }));
    expect(res.status).toBe(404);
  });

  it("génère les bulletins avec succès et renvoie le count", async () => {
    stubGenerationSuccess();
    const res = await POST_GENERER(req("http://l/api/bulletins/generer", { classeId: "c1", periodeId: "p1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(1);
  });

  it("crée un bulletin en statut BROUILLON via upsert", async () => {
    stubGenerationSuccess();
    await POST_GENERER(req("http://l/api/bulletins/generer", { classeId: "c1", periodeId: "p1" }));
    const upsertCall = mockPrisma.bulletin.upsert.mock.calls[0][0];
    expect(upsertCall.create.statut).toBe("BROUILLON");
    expect(upsertCall.create.tenantId).toBe("t1");
  });

  it("enregistre une entrée d'historique GENERER", async () => {
    stubGenerationSuccess();
    await POST_GENERER(req("http://l/api/bulletins/generer", { classeId: "c1", periodeId: "p1" }));
    expect(mockEnregistrerHistorique).toHaveBeenCalledWith(
      "b1",
      "t1",
      expect.objectContaining({ id: "u1" }),
      "GENERER",
      "moyenneGenerale",
      null,
      expect.any(String)
    );
  });

  it("préserve le statut existant si le bulletin est déjà VERROUILLE", async () => {
    stubGenerationSuccess();
    mockPrisma.bulletin.findFirst.mockResolvedValue({ id: "b1", statut: "VERROUILLE" });
    await POST_GENERER(req("http://l/api/bulletins/generer", { classeId: "c1", periodeId: "p1" }));
    const upsertCall = mockPrisma.bulletin.upsert.mock.calls[0][0];
    // L'update ne doit pas écraser le statut
    expect(upsertCall.update.statut).toBeUndefined();
  });
});

// ================================================================
// POST /api/bulletins/verrouiller
// ================================================================
describe("POST /api/bulletins/verrouiller", () => {
  function stubEleves() {
    mockPrisma.eleve.findMany.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
  }

  it("refuse sans session (401)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST_VERROUILLER(req("http://l/api/bulletins/verrouiller", { classeId: "c1", periodeId: "p1", action: "verrouiller" }));
    expect(res.status).toBe(401);
  });

  it("rejette les données invalides (400)", async () => {
    const res = await POST_VERROUILLER(req("http://l/api/bulletins/verrouiller", { classeId: "c1", periodeId: "p1", action: "invalide" }));
    expect(res.status).toBe(400);
  });

  it("retourne 404 si aucun bulletin à verrouiller", async () => {
    stubEleves();
    mockPrisma.bulletin.findMany.mockResolvedValue([]);
    const res = await POST_VERROUILLER(req("http://l/api/bulletins/verrouiller", { classeId: "c1", periodeId: "p1", action: "verrouiller" }));
    expect(res.status).toBe(404);
  });

  it("verrouille les bulletins BROUILLON → VERROUILLE avec verrouilleAt et verrouilleParId", async () => {
    stubEleves();
    mockPrisma.bulletin.findMany.mockResolvedValue([
      { id: "b1", statut: "BROUILLON" },
      { id: "b2", statut: "BROUILLON" },
    ]);
    mockPrisma.bulletin.updateMany.mockResolvedValue({ count: 2 });

    const res = await POST_VERROUILLER(req("http://l/api/bulletins/verrouiller", { classeId: "c1", periodeId: "p1", action: "verrouiller" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(2);

    const updateCall = mockPrisma.bulletin.updateMany.mock.calls[0][0];
    expect(updateCall.where.statut).toBe("BROUILLON");
    expect(updateCall.data.statut).toBe("VERROUILLE");
    expect(updateCall.data.verrouilleAt).toBeInstanceOf(Date);
    expect(updateCall.data.verrouilleParId).toBe("u1");
  });

  it("ne verrouille aucun bulletin si tous sont déjà VERROUILLE (count 0)", async () => {
    stubEleves();
    mockPrisma.bulletin.findMany.mockResolvedValue([
      { id: "b1", statut: "VERROUILLE" },
      { id: "b2", statut: "VERROUILLE" },
    ]);
    mockPrisma.bulletin.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST_VERROUILLER(req("http://l/api/bulletins/verrouiller", { classeId: "c1", periodeId: "p1", action: "verrouiller" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(0);

    // L'updateMany filtre sur statut BROUILLON : aucun bulletin VERROUILLE n'est touché
    const updateCall = mockPrisma.bulletin.updateMany.mock.calls[0][0];
    expect(updateCall.where.statut).toBe("BROUILLON");
  });

  it("ne verrouille aucun bulletin si tous sont PUBLIE (count 0)", async () => {
    stubEleves();
    mockPrisma.bulletin.findMany.mockResolvedValue([
      { id: "b1", statut: "PUBLIE" },
    ]);
    mockPrisma.bulletin.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST_VERROUILLER(req("http://l/api/bulletins/verrouiller", { classeId: "c1", periodeId: "p1", action: "verrouiller" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(0);
  });

  it("enregistre une entrée d'historique VERROUILLER pour chaque bulletin verrouillé", async () => {
    stubEleves();
    mockPrisma.bulletin.findMany.mockResolvedValue([
      { id: "b1", statut: "BROUILLON" },
    ]);
    mockPrisma.bulletin.updateMany.mockResolvedValue({ count: 1 });

    await POST_VERROUILLER(req("http://l/api/bulletins/verrouiller", { classeId: "c1", periodeId: "p1", action: "verrouiller" }));
    expect(mockEnregistrerHistorique).toHaveBeenCalledWith(
      "b1",
      "t1",
      expect.objectContaining({ id: "u1" }),
      "VERROUILLER",
      "statut",
      JSON.stringify("BROUILLON"),
      JSON.stringify("VERROUILLE")
    );
  });

  it("déverrouille VERROUILLE → BROUILLON (action deverrouiller)", async () => {
    stubEleves();
    mockPrisma.bulletin.findMany.mockResolvedValue([{ id: "b1", statut: "VERROUILLE" }]);
    mockPrisma.bulletin.updateMany.mockResolvedValue({ count: 1 });

    const res = await POST_VERROUILLER(req("http://l/api/bulletins/verrouiller", { classeId: "c1", periodeId: "p1", action: "deverrouiller" }));
    expect(res.status).toBe(200);
    const updateCall = mockPrisma.bulletin.updateMany.mock.calls[0][0];
    expect(updateCall.where.statut).toBe("VERROUILLE");
    expect(updateCall.data.statut).toBe("BROUILLON");
    expect(updateCall.data.verrouilleAt).toBeNull();
    expect(updateCall.data.verrouilleParId).toBeNull();
  });
});

// ================================================================
// POST /api/bulletins/publier
// ================================================================
describe("POST /api/bulletins/publier", () => {
  function stubPublierSuccess() {
    mockPrisma.eleve.findMany.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
    mockPrisma.bulletin.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.bulletin.findMany.mockResolvedValue([{ id: "b1" }, { id: "b2" }]);
    mockPrisma.periode.findFirst.mockResolvedValue({ nom: "Trimestre 1" });
    mockPrisma.notification.create.mockResolvedValue({});
  }

  it("refuse sans session (401)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST_PUBLIER(req("http://l/api/bulletins/publier", { classeId: "c1", periodeId: "p1" }));
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission bulletins:publish (403)", async () => {
    mockCheckPermission.mockReturnValue(new Response("Forbidden", { status: 403 }) as never);
    const res = await POST_PUBLIER(req("http://l/api/bulletins/publier", { classeId: "c1", periodeId: "p1" }));
    expect(res.status).toBe(403);
  });

  it("rejette les données invalides (400)", async () => {
    const res = await POST_PUBLIER(req("http://l/api/bulletins/publier", {}));
    expect(res.status).toBe(400);
  });

  it("publie les bulletins avec isPublie=true, statut=PUBLIE, publishedAt et verrouilleParId", async () => {
    stubPublierSuccess();
    const res = await POST_PUBLIER(req("http://l/api/bulletins/publier", { classeId: "c1", periodeId: "p1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(2);

    const updateCall = mockPrisma.bulletin.updateMany.mock.calls[0][0];
    expect(updateCall.data.isPublie).toBe(true);
    expect(updateCall.data.statut).toBe("PUBLIE");
    expect(updateCall.data.publishedAt).toBeInstanceOf(Date);
    expect(updateCall.data.verrouilleParId).toBe("u1");
    // Seuls les bulletins non publiés sont concernés
    expect(updateCall.where.isPublie).toBe(false);
  });

  it("enregistre une entrée d'historique PUBLIER pour chaque bulletin", async () => {
    stubPublierSuccess();
    await POST_PUBLIER(req("http://l/api/bulletins/publier", { classeId: "c1", periodeId: "p1" }));
    expect(mockEnregistrerHistorique).toHaveBeenCalledTimes(2);
    expect(mockEnregistrerHistorique).toHaveBeenCalledWith(
      "b1",
      "t1",
      expect.objectContaining({ id: "u1" }),
      "PUBLIER",
      "statut",
      JSON.stringify("BROUILLON"),
      JSON.stringify("PUBLIE")
    );
  });

  it("ne publie rien si tous les bulletins sont déjà publiés (count 0)", async () => {
    mockPrisma.eleve.findMany.mockResolvedValue([{ id: "e1" }]);
    mockPrisma.bulletin.updateMany.mockResolvedValue({ count: 0 });
    const res = await POST_PUBLIER(req("http://l/api/bulletins/publier", { classeId: "c1", periodeId: "p1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(0);
    // Pas d'historique si rien n'a été publié
    expect(mockEnregistrerHistorique).not.toHaveBeenCalled();
  });
});

// ================================================================
// PUT /api/bulletins/[id] — modification
// ================================================================
describe("PUT /api/bulletins/[id]", () => {
  it("refuse sans session (401)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PUT_BULLETIN(req("http://l/api/bulletins/b1", { appreciation: "Bien" }), params("b1"));
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission bulletins:write (403)", async () => {
    mockCheckPermission.mockReturnValue(new Response("Forbidden", { status: 403 }) as never);
    const res = await PUT_BULLETIN(req("http://l/api/bulletins/b1", { appreciation: "Bien" }), params("b1"));
    expect(res.status).toBe(403);
  });

  it("retourne 404 si le bulletin est introuvable", async () => {
    mockPrisma.bulletin.findFirst.mockResolvedValue(null);
    const res = await PUT_BULLETIN(req("http://l/api/bulletins/b1", { appreciation: "Bien" }), params("b1"));
    expect(res.status).toBe(404);
  });

  it("modifie un bulletin BROUILLON avec succès", async () => {
    const existing = { id: "b1", statut: "BROUILLON", appreciation: "Ancien", decision: null };
    mockPrisma.bulletin.findFirst.mockResolvedValue(existing);
    const updated = { ...existing, appreciation: "Nouveau commentaire" };
    mockPrisma.bulletin.update.mockResolvedValue(updated);

    const res = await PUT_BULLETIN(req("http://l/api/bulletins/b1", { appreciation: "Nouveau commentaire" }), params("b1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.bulletin.appreciation).toBe("Nouveau commentaire");
    expect(mockPrisma.bulletin.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "b1" }, data: { appreciation: "Nouveau commentaire" } })
    );
  });

  it("refuse la modification d'un bulletin VERROUILLE par un non-admin (403)", async () => {
    mockAuth.mockResolvedValue({ user: { ...SESSION.user, role: "ENSEIGNANT" } });
    mockPeutModifier.mockReturnValue(false);
    mockPrisma.bulletin.findFirst.mockResolvedValue({ id: "b1", statut: "VERROUILLE" });

    const res = await PUT_BULLETIN(req("http://l/api/bulletins/b1", { appreciation: "X" }), params("b1"));
    expect(res.status).toBe(403);
    expect(mockPrisma.bulletin.update).not.toHaveBeenCalled();
  });

  it("refuse la modification d'un bulletin PUBLIE par un non-admin (403)", async () => {
    mockAuth.mockResolvedValue({ user: { ...SESSION.user, role: "ENSEIGNANT" } });
    mockPeutModifier.mockReturnValue(false);
    mockPrisma.bulletin.findFirst.mockResolvedValue({ id: "b1", statut: "PUBLIE" });

    const res = await PUT_BULLETIN(req("http://l/api/bulletins/b1", { appreciation: "X" }), params("b1"));
    expect(res.status).toBe(403);
    expect(mockPrisma.bulletin.update).not.toHaveBeenCalled();
  });

  it("autorise un TENANT_ADMIN à modifier un bulletin VERROUILLE", async () => {
    mockPeutModifier.mockReturnValue(true);
    const existing = { id: "b1", statut: "VERROUILLE", appreciation: "Ancien" };
    mockPrisma.bulletin.findFirst.mockResolvedValue(existing);
    mockPrisma.bulletin.update.mockResolvedValue({ ...existing, appreciation: "Corrigé" });

    const res = await PUT_BULLETIN(req("http://l/api/bulletins/b1", { appreciation: "Corrigé" }), params("b1"));
    expect(res.status).toBe(200);
    expect(mockPrisma.bulletin.update).toHaveBeenCalled();
  });

  it("trace les modifications via tracerModificationsBulletin", async () => {
    const existing = { id: "b1", statut: "BROUILLON", appreciation: "Ancien" };
    mockPrisma.bulletin.findFirst.mockResolvedValue(existing);
    const updated = { ...existing, appreciation: "Nouveau" };
    mockPrisma.bulletin.update.mockResolvedValue(updated);

    await PUT_BULLETIN(req("http://l/api/bulletins/b1", { appreciation: "Nouveau" }), params("b1"));
    const { tracerModificationsBulletin } = await import("@/lib/bulletin-historique");
    expect(tracerModificationsBulletin).toHaveBeenCalledWith(
      "b1",
      "t1",
      expect.objectContaining({ id: "u1" }),
      existing,
      updated
    );
  });
});

// ================================================================
// DELETE /api/bulletins/[id]
// ================================================================
describe("DELETE /api/bulletins/[id]", () => {
  it("refuse sans session (401)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE_BULLETIN(req("http://l/api/bulletins/b1"), params("b1"));
    expect(res.status).toBe(401);
  });

  it("refuse de supprimer un bulletin VERROUILLE par un non-admin (403)", async () => {
    mockAuth.mockResolvedValue({ user: { ...SESSION.user, role: "ENSEIGNANT" } });
    mockPeutModifier.mockReturnValue(false);
    mockPrisma.bulletin.findFirst.mockResolvedValue({ id: "b1", statut: "VERROUILLE" });

    const res = await DELETE_BULLETIN(req("http://l/api/bulletins/b1"), params("b1"));
    expect(res.status).toBe(403);
    expect(mockPrisma.bulletin.delete).not.toHaveBeenCalled();
  });

  it("supprime un bulletin BROUILLON avec succès et enregistre l'historique DELETE", async () => {
    mockPrisma.bulletin.findFirst.mockResolvedValue({ id: "b1", statut: "BROUILLON", eleveId: "e1", periodeId: "p1" });
    mockPrisma.bulletin.delete.mockResolvedValue({});

    const res = await DELETE_BULLETIN(req("http://l/api/bulletins/b1"), params("b1"));
    expect(res.status).toBe(200);
    expect(mockPrisma.bulletin.delete).toHaveBeenCalledWith({ where: { id: "b1" } });
    expect(mockEnregistrerHistorique).toHaveBeenCalledWith(
      "b1",
      "t1",
      expect.objectContaining({ id: "u1" }),
      "DELETE",
      "global",
      expect.any(String),
      null
    );
  });
});

// ================================================================
// GET /api/bulletins/[id]/historique
// ================================================================
describe("GET /api/bulletins/[id]/historique", () => {
  it("refuse sans session (401)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET_HISTORIQUE(req("http://l/api/bulletins/b1/historique"), params("b1"));
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission bulletins:read (403)", async () => {
    mockCheckPermission.mockReturnValue(new Response("Forbidden", { status: 403 }) as never);
    const res = await GET_HISTORIQUE(req("http://l/api/bulletins/b1/historique"), params("b1"));
    expect(res.status).toBe(403);
  });

  it("retourne 404 si le bulletin est introuvable", async () => {
    mockPrisma.bulletin.findFirst.mockResolvedValue(null);
    const res = await GET_HISTORIQUE(req("http://l/api/bulletins/b1/historique"), params("b1"));
    expect(res.status).toBe(404);
  });

  it("retourne l'historique avec auteur, champ, ancienne et nouvelle valeur", async () => {
    mockPrisma.bulletin.findFirst.mockResolvedValue({ id: "b1" });
    const historique = [
      {
        id: "h1",
        bulletinId: "b1",
        auteurId: "u1",
        auteurNom: "Admin Test",
        auteurRole: "TENANT_ADMIN",
        action: "VERROUILLER",
        champ: "statut",
        ancienneValeur: JSON.stringify("BROUILLON"),
        nouvelleValeur: JSON.stringify("VERROUILLE"),
        createdAt: new Date("2026-01-10"),
      },
      {
        id: "h2",
        bulletinId: "b1",
        auteurId: "u2",
        auteurNom: "Prof Dupont",
        auteurRole: "ENSEIGNANT",
        action: "UPDATE",
        champ: "appreciation",
        ancienneValeur: JSON.stringify("Ancien"),
        nouvelleValeur: JSON.stringify("Nouveau"),
        createdAt: new Date("2026-01-09"),
      },
    ];
    mockPrisma.bulletinHistorique.findMany.mockResolvedValue(historique);

    const res = await GET_HISTORIQUE(req("http://l/api/bulletins/b1/historique"), params("b1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.historique).toHaveLength(2);
    expect(json.historique[0].auteurNom).toBe("Admin Test");
    expect(json.historique[0].champ).toBe("statut");
    expect(json.historique[0].ancienneValeur).toBe(JSON.stringify("BROUILLON"));
    expect(json.historique[0].nouvelleValeur).toBe(JSON.stringify("VERROUILLE"));
  });

  it("filtre l'historique par bulletinId et tenantId, trié par date décroissante", async () => {
    mockPrisma.bulletin.findFirst.mockResolvedValue({ id: "b1" });
    mockPrisma.bulletinHistorique.findMany.mockResolvedValue([]);
    await GET_HISTORIQUE(req("http://l/api/bulletins/b1/historique"), params("b1"));
    const query = mockPrisma.bulletinHistorique.findMany.mock.calls[0][0];
    expect(query.where.bulletinId).toBe("b1");
    expect(query.where.tenantId).toBe("t1");
    expect(query.orderBy.createdAt).toBe("desc");
  });
});

// ================================================================
// GET /api/bulletins/list
// ================================================================
describe("GET /api/bulletins/list", () => {
  it("refuse sans session (401)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET_LIST(req("http://l/api/bulletins/list"));
    expect(res.status).toBe(401);
  });

  it("refuse sans la permission bulletins:read (403)", async () => {
    mockCheckPermission.mockReturnValue(new Response("Forbidden", { status: 403 }) as never);
    const res = await GET_LIST(req("http://l/api/bulletins/list"));
    expect(res.status).toBe(403);
  });

  it("filtre par année active via periode.anneeId", async () => {
    mockPrisma.bulletin.findMany.mockResolvedValue([]);
    await GET_LIST(req("http://l/api/bulletins/list"));
    const where = mockPrisma.bulletin.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.periode.anneeId).toBe("annee-1");
  });

  it("filtre par classeId quand fourni (sans eleveId)", async () => {
    mockPrisma.bulletin.findMany.mockResolvedValue([]);
    await GET_LIST(req("http://l/api/bulletins/list?classeId=c1"));
    const where = mockPrisma.bulletin.findMany.mock.calls[0][0].where;
    expect(where.eleve.classeId).toBe("c1");
  });

  it("filtre par eleveId quand fourni (prioritaire sur classeId)", async () => {
    mockPrisma.bulletin.findMany.mockResolvedValue([]);
    await GET_LIST(req("http://l/api/bulletins/list?eleveId=e1&classeId=c1"));
    const where = mockPrisma.bulletin.findMany.mock.calls[0][0].where;
    expect(where.eleveId).toBe("e1");
    // Quand eleveId est présent, classeId n'est pas appliqué
    expect(where.eleve).toBeUndefined();
  });

  it("retourne les bulletins avec le flag verrouille calculé", async () => {
    mockPrisma.bulletin.findMany.mockResolvedValue([
      { id: "b1", statut: "BROUILLON", eleve: { id: "e1", nom: "A", prenom: "B", matricule: "M1", classe: { nom: "5B" } }, periode: { nom: "T1", numero: 1 } },
      { id: "b2", statut: "VERROUILLE", eleve: { id: "e2", nom: "C", prenom: "D", matricule: "M2", classe: { nom: "5B" } }, periode: { nom: "T1", numero: 1 } },
      { id: "b3", statut: "PUBLIE", eleve: { id: "e3", nom: "E", prenom: "F", matricule: "M3", classe: { nom: "5B" } }, periode: { nom: "T1", numero: 1 } },
    ]);
    const res = await GET_LIST(req("http://l/api/bulletins/list"));
    const json = await res.json();
    expect(json.bulletins).toHaveLength(3);
    expect(json.bulletins[0].verrouille).toBe(false);
    expect(json.bulletins[1].verrouille).toBe(true);
    expect(json.bulletins[2].verrouille).toBe(true);
  });
});

// ================================================================
// GET /api/bulletins/check-existing
// ================================================================
describe("GET /api/bulletins/check-existing", () => {
  it("refuse sans session (401)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET_CHECK(req("http://l/api/bulletins/check-existing?classeId=c1&periodeId=p1"));
    expect(res.status).toBe(401);
  });

  it("retourne 400 si paramètres manquants", async () => {
    const res = await GET_CHECK(req("http://l/api/bulletins/check-existing?classeId=c1"));
    expect(res.status).toBe(400);
  });

  it("retourne exists=false si aucun bulletin", async () => {
    mockPrisma.bulletin.count.mockResolvedValue(0);
    const res = await GET_CHECK(req("http://l/api/bulletins/check-existing?classeId=c1&periodeId=p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.exists).toBe(false);
    expect(json.published).toBe(false);
    expect(json.verrouille).toBe(false);
  });

  it("retourne exists=true avec published et verrouille quand applicable", async () => {
    // 1er count: total, 2e: published, 3e: verrouille
    mockPrisma.bulletin.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);

    const res = await GET_CHECK(req("http://l/api/bulletins/check-existing?classeId=c1&periodeId=p1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.exists).toBe(true);
    expect(json.published).toBe(true);
    expect(json.verrouille).toBe(true);
    expect(json.count).toBe(5);
  });

  it("retourne exists=true mais published=false si aucun bulletin publié", async () => {
    mockPrisma.bulletin.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const res = await GET_CHECK(req("http://l/api/bulletins/check-existing?classeId=c1&periodeId=p1"));
    const json = await res.json();
    expect(json.exists).toBe(true);
    expect(json.published).toBe(false);
    expect(json.verrouille).toBe(false);
  });

  it("filtre par classeId via eleve.classeId et periodeId", async () => {
    mockPrisma.bulletin.count.mockResolvedValue(0);
    await GET_CHECK(req("http://l/api/bulletins/check-existing?classeId=c1&periodeId=p1"));
    const where = mockPrisma.bulletin.count.mock.calls[0][0].where;
    expect(where.eleve.classeId).toBe("c1");
    expect(where.periodeId).toBe("p1");
    expect(where.tenantId).toBe("t1");
  });
});
