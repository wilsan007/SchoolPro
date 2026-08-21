import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    sanction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    incident: { update: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));

// La Time Machine est figée : les états calculés (EN_COURS / A_VENIR / retard)
// doivent être déterministes dans les tests.
const DATE_REF = new Date("2026-04-07T00:00:00.000Z");
vi.mock("@/lib/demo-now", () => ({ getDemoNow: vi.fn(async () => DATE_REF) }));

// Le périmètre site est neutralisé : son comportement est testé ailleurs.
vi.mock("@/lib/site-scope", () => ({ siteFilterForModel: vi.fn(() => ({})) }));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCheckPermission = checkPermission as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  sanction: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  incident: { update: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
};

function req(url: string, body?: unknown) {
  return { url, json: () => Promise.resolve(body) } as unknown as Request;
}

const { GET } = await import("@/app/api/vie-scolaire/exclusions/route");
const { PATCH } = await import("@/app/api/vie-scolaire/exclusions/[id]/route");

/** Fabrique une sanction d'exclusion telle que renvoyée par Prisma. */
function sanction(over: Record<string, unknown> = {}) {
  return {
    id: "san-1",
    type: "EXCLUSION_TEMP",
    description: "Exclusion suite à BAGARRE",
    dateDebut: new Date("2026-03-30T00:00:00.000Z"),
    dateFin: new Date("2026-04-02T00:00:00.000Z"),
    dateRetourEffective: null,
    travailDonne: null,
    parentNotifie: true,
    accuseReceptionParent: null,
    reintegrePar: null,
    incident: {
      id: "inc-1",
      type: "BAGARRE",
      gravite: 3,
      date: new Date("2026-03-29T00:00:00.000Z"),
      description: "Bagarre dans la cour",
      eleve: {
        id: "ele-1",
        nom: "Dupont",
        prenom: "Marie",
        matricule: "AMB-2025-0001",
        classe: { id: "cl-1", nom: "5ème B" },
      },
    },
    ...over,
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/vie-scolaire/exclusions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPermission.mockReturnValue(null);
    mockAuth.mockResolvedValue({
      user: { id: "u1", tenantId: "t1", role: "PRINCIPAL" },
    });
  });

  it("refuse l'accès sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req("http://l/api/vie-scolaire/exclusions") as never);
    expect(res.status).toBe(401);
  });

  it("refuse l'accès sans la permission vie-scolaire:read", async () => {
    mockCheckPermission.mockReturnValue(
      new Response(null, { status: 403 }) as never
    );
    const res = await GET(req("http://l/api/vie-scolaire/exclusions") as never);
    expect(res.status).toBe(403);
  });

  it("ne remonte que les sanctions de type exclusion", async () => {
    mockPrisma.sanction.findMany.mockResolvedValue([]);
    await GET(req("http://l/api/vie-scolaire/exclusions") as never);
    const where = mockPrisma.sanction.findMany.mock.calls[0][0].where;
    expect(where.type).toEqual({ in: ["EXCLUSION_COURS", "EXCLUSION_TEMP"] });
  });

  it("isole par tenant via la chaîne incident", async () => {
    mockPrisma.sanction.findMany.mockResolvedValue([]);
    await GET(req("http://l/api/vie-scolaire/exclusions") as never);
    const where = mockPrisma.sanction.findMany.mock.calls[0][0].where;
    expect(where.incident.tenantId).toBe("t1");
  });

  it("calcule l'état EN_COURS et le retard de réintégration", async () => {
    // dateFin (02/04) dépassée à la date de référence (07/04) sans retour = retard 5 j.
    mockPrisma.sanction.findMany.mockResolvedValue([sanction()]);
    const res = await GET(req("http://l/api/vie-scolaire/exclusions") as never);
    const data = await res.json();
    expect(data.exclusions[0].etat).toBe("EN_COURS");
    expect(data.exclusions[0].joursRetardReintegration).toBe(5);
  });

  it("marque A_VENIR une exclusion qui n'a pas commencé", async () => {
    mockPrisma.sanction.findMany.mockResolvedValue([
      sanction({
        dateDebut: new Date("2026-04-20T00:00:00.000Z"),
        dateFin: new Date("2026-04-22T00:00:00.000Z"),
      }),
    ]);
    const res = await GET(req("http://l/api/vie-scolaire/exclusions") as never);
    const data = await res.json();
    expect(data.exclusions[0].etat).toBe("A_VENIR");
    expect(data.exclusions[0].joursRetardReintegration).toBe(0);
  });

  it("marque CLOSE une exclusion avec retour effectif", async () => {
    mockPrisma.sanction.findMany.mockResolvedValue([
      sanction({
        dateRetourEffective: new Date("2026-04-02T00:00:00.000Z"),
        travailDonne: "Exercices p.94",
        reintegrePar: { name: "M. Diallo" },
      }),
    ]);
    const res = await GET(req("http://l/api/vie-scolaire/exclusions") as never);
    const data = await res.json();
    expect(data.exclusions[0].etat).toBe("CLOSE");
    expect(data.exclusions[0].reintegrePar).toBe("M. Diallo");
    expect(data.exclusions[0].joursRetardReintegration).toBe(0);
  });

  it("signale les manquements de conformité", async () => {
    mockPrisma.sanction.findMany.mockResolvedValue([sanction()]);
    const res = await GET(req("http://l/api/vie-scolaire/exclusions") as never);
    const data = await res.json();
    expect(data.exclusions[0].continuitePedagogiqueManquante).toBe(true);
    expect(data.exclusions[0].accuseReceptionManquant).toBe(true);
    expect(data.stats.sansContinuitePedagogique).toBe(1);
    expect(data.stats.sansAccuseReception).toBe(1);
    expect(data.stats.retardsReintegration).toBe(1);
  });

  it("filtre par état EN_COURS via la requête Prisma", async () => {
    mockPrisma.sanction.findMany.mockResolvedValue([]);
    await GET(req("http://l/api/vie-scolaire/exclusions?etat=EN_COURS") as never);
    const where = mockPrisma.sanction.findMany.mock.calls[0][0].where;
    expect(where.dateRetourEffective).toBeNull();
    expect(where.dateDebut).toEqual({ lte: DATE_REF });
  });

  it("filtre par classe", async () => {
    mockPrisma.sanction.findMany.mockResolvedValue([]);
    await GET(req("http://l/api/vie-scolaire/exclusions?classeId=cl-1") as never);
    const where = mockPrisma.sanction.findMany.mock.calls[0][0].where;
    expect(where.incident.eleve).toEqual({ classeId: "cl-1" });
  });
});

describe("PATCH /api/vie-scolaire/exclusions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPermission.mockReturnValue(null);
    mockAuth.mockResolvedValue({
      user: { id: "u1", tenantId: "t1", role: "PRINCIPAL" },
    });
    mockPrisma.sanction.update.mockResolvedValue({
      id: "san-1",
      travailDonne: "Exercices p.94",
      accuseReceptionParent: null,
      dateRetourEffective: null,
      reintegrePar: null,
    });
    mockPrisma.sanction.count.mockResolvedValue(0);
    mockPrisma.incident.findFirst.mockResolvedValue({ id: "inc-1" });
    mockPrisma.incident.update.mockResolvedValue({});
  });

  it("refuse l'accès sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(req("http://l", { reintegrer: true }) as never, params("san-1") as never);
    expect(res.status).toBe(401);
  });

  it("404 si la sanction est hors périmètre", async () => {
    mockPrisma.sanction.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      req("http://l", { travailDonne: "Exercices p.94" }) as never,
      params("san-1") as never
    );
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("SANCTION_INTROUVABLE");
  });

  it("refuse une sanction qui n'est pas une exclusion", async () => {
    mockPrisma.sanction.findFirst.mockResolvedValue({
      id: "san-1",
      type: "AVERTISSEMENT",
      travailDonne: null,
      dateRetourEffective: null,
      incidentId: "inc-1",
    });
    const res = await PATCH(
      req("http://l", { travailDonne: "Exercices p.94" }) as never,
      params("san-1") as never
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("SANCTION_NON_EXCLUSION");
  });

  it("refuse de modifier une exclusion déjà close", async () => {
    mockPrisma.sanction.findFirst.mockResolvedValue({
      id: "san-1",
      type: "EXCLUSION_TEMP",
      travailDonne: "Exercices p.94",
      dateRetourEffective: new Date("2026-04-02T00:00:00.000Z"),
      incidentId: "inc-1",
    });
    const res = await PATCH(
      req("http://l", { reintegrer: true }) as never,
      params("san-1") as never
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("EXCLUSION_DEJA_CLOSE");
  });

  it("refuse la réintégration sans continuité pédagogique", async () => {
    mockPrisma.sanction.findFirst.mockResolvedValue({
      id: "san-1",
      type: "EXCLUSION_TEMP",
      travailDonne: null,
      dateRetourEffective: null,
      incidentId: "inc-1",
    });
    const res = await PATCH(
      req("http://l", { reintegrer: true }) as never,
      params("san-1") as never
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("TRAVAIL_DONNE_REQUIS");
    expect(mockPrisma.sanction.update).not.toHaveBeenCalled();
  });

  it("autorise la réintégration si le travail est fourni dans la requête", async () => {
    mockPrisma.sanction.findFirst.mockResolvedValue({
      id: "san-1",
      type: "EXCLUSION_TEMP",
      travailDonne: null,
      dateRetourEffective: null,
      incidentId: "inc-1",
    });
    const res = await PATCH(
      req("http://l", { reintegrer: true, travailDonne: "Exercices p.94 à faire" }) as never,
      params("san-1") as never
    );
    expect(res.status).toBe(200);
    const data = mockPrisma.sanction.update.mock.calls[0][0].data;
    expect(data.dateRetourEffective).toEqual(DATE_REF);
    expect(data.reintegreParId).toBe("u1");
    expect(data.travailDonne).toBe("Exercices p.94 à faire");
  });

  it("enregistre l'accusé de réception à la date de référence", async () => {
    mockPrisma.sanction.findFirst.mockResolvedValue({
      id: "san-1",
      type: "EXCLUSION_TEMP",
      travailDonne: null,
      dateRetourEffective: null,
      incidentId: "inc-1",
    });
    const res = await PATCH(
      req("http://l", { accuseReception: true }) as never,
      params("san-1") as never
    );
    expect(res.status).toBe(200);
    const data = mockPrisma.sanction.update.mock.calls[0][0].data;
    expect(data.accuseReceptionParent).toEqual(DATE_REF);
    // Pas de réintégration demandée : l'exclusion reste ouverte.
    expect(data.dateRetourEffective).toBeUndefined();
  });

  it("clôt l'incident quand plus aucune exclusion n'est ouverte", async () => {
    mockPrisma.sanction.findFirst.mockResolvedValue({
      id: "san-1",
      type: "EXCLUSION_TEMP",
      travailDonne: "Exercices p.94",
      dateRetourEffective: null,
      incidentId: "inc-1",
    });
    mockPrisma.sanction.count.mockResolvedValue(0);
    mockPrisma.incident.findFirst.mockResolvedValue({ id: "inc-1" });
    await PATCH(req("http://l", { reintegrer: true }) as never, params("san-1") as never);
    expect(mockPrisma.incident.update).toHaveBeenCalled();
    const call = mockPrisma.incident.update.mock.calls[0][0];
    expect(call.where.id).toBe("inc-1");
    expect(call.data.statut).toBe("RESOLU");
    expect(call.data.resoluParId).toBe("u1");
  });

  it("laisse l'incident ouvert s'il reste une exclusion en cours", async () => {
    mockPrisma.sanction.findFirst.mockResolvedValue({
      id: "san-1",
      type: "EXCLUSION_TEMP",
      travailDonne: "Exercices p.94",
      dateRetourEffective: null,
      incidentId: "inc-1",
    });
    mockPrisma.sanction.count.mockResolvedValue(1);
    await PATCH(req("http://l", { reintegrer: true }) as never, params("san-1") as never);
    expect(mockPrisma.incident.update).not.toHaveBeenCalled();
  });

  it("rejette un corps de requête vide", async () => {
    mockPrisma.sanction.findFirst.mockResolvedValue({
      id: "san-1",
      type: "EXCLUSION_TEMP",
      travailDonne: null,
      dateRetourEffective: null,
      incidentId: "inc-1",
    });
    const res = await PATCH(req("http://l", {}) as never, params("san-1") as never);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("DONNEES_INVALIDES");
  });
});
