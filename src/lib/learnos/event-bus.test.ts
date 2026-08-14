import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    learnosEvent: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Le bus est testé pour lui-même : acheminement, reprise, marquage. Le contenu
// des traitements relève de evidence-engine.test.ts et learning-twin.test.ts.
vi.mock("@/lib/learnos/evidence-engine", () => ({
  ingererNoteCommePreuve: vi.fn(),
}));
vi.mock("@/lib/learnos/learning-twin", () => ({
  recalculerProfilsApresPreuve: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { publishEvent, publishEvents } from "@/lib/learnos/events";
import { drainEvents, replayEvents, eventBacklog } from "@/lib/learnos/event-bus";
import { ingererNoteCommePreuve } from "@/lib/learnos/evidence-engine";
import { recalculerProfilsApresPreuve } from "@/lib/learnos/learning-twin";

const mockIngestion = vi.mocked(ingererNoteCommePreuve);
const mockJumeau = vi.mocked(recalculerProfilsApresPreuve);

const mockPrisma = prisma as unknown as {
  learnosEvent: {
    createMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

function evenement(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ev1",
    tenantId: "tenant1",
    siteId: "site1",
    eventType: "note.recorded",
    aggregateType: "note",
    aggregateId: "note1",
    payload: { noteId: "note1" },
    occurredAt: new Date("2026-01-01"),
    attempts: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.learnosEvent.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.learnosEvent.findMany.mockResolvedValue([]);
  mockPrisma.learnosEvent.update.mockResolvedValue({});
  mockPrisma.learnosEvent.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.learnosEvent.count.mockResolvedValue(0);
  mockIngestion.mockResolvedValue(undefined);
  mockJumeau.mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

/**
 * La propriété la plus importante du bus : LEARNOS ne doit jamais casser
 * l'ERP (spécification §49-1). Une saisie de notes réussie doit le rester
 * même si toute la couche d'intelligence est en panne.
 */
describe("publication — ne casse jamais l'appelant", () => {
  it("n'échoue pas quand l'écriture en base échoue", async () => {
    mockPrisma.learnosEvent.createMany.mockRejectedValue(new Error("table absente"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      publishEvent({
        tenantId: "tenant1",
        eventType: "note.recorded",
        aggregateType: "note",
        aggregateId: "note1",
        payload: {},
      })
    ).resolves.toBeUndefined();
  });

  it("signale l'échec en console plutôt que de le taire complètement", async () => {
    mockPrisma.learnosEvent.createMany.mockRejectedValue(new Error("base indisponible"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await publishEvents([
      {
        tenantId: "t",
        eventType: "note.recorded",
        aggregateType: "note",
        aggregateId: "n",
        payload: {},
      },
    ]);

    expect(log).toHaveBeenCalled();
  });

  it("n'écrit rien pour un lot vide", async () => {
    await publishEvents([]);
    expect(mockPrisma.learnosEvent.createMany).not.toHaveBeenCalled();
  });

  it("groupe tout un lot en une seule requête", async () => {
    await publishEvents([
      { tenantId: "t", eventType: "note.recorded", aggregateType: "note", aggregateId: "n1", payload: {} },
      { tenantId: "t", eventType: "note.recorded", aggregateType: "note", aggregateId: "n2", payload: {} },
    ]);

    expect(mockPrisma.learnosEvent.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.learnosEvent.createMany.mock.calls[0][0].data).toHaveLength(2);
  });

  it("normalise un site absent en null plutôt que undefined", async () => {
    await publishEvent({
      tenantId: "t",
      eventType: "note.recorded",
      aggregateType: "note",
      aggregateId: "n",
      payload: {},
    });

    expect(mockPrisma.learnosEvent.createMany.mock.calls[0][0].data[0].siteId).toBeNull();
  });
});

describe("drainage", () => {
  it("ne traite que les événements en attente, du plus ancien au plus récent", async () => {
    await drainEvents();

    const args = mockPrisma.learnosEvent.findMany.mock.calls[0][0];
    expect(args.where.processedAt).toBeNull();
    expect(args.orderBy).toEqual({ occurredAt: "asc" });
  });

  it("plafonne la taille du lot demandée", async () => {
    await drainEvents(17);
    expect(mockPrisma.learnosEvent.findMany.mock.calls[0][0].take).toBe(17);
  });

  it("remet le fait aux traitements qui l'écoutent", async () => {
    mockPrisma.learnosEvent.findMany.mockResolvedValue([evenement()]);

    const r = await drainEvents();

    expect(mockIngestion).toHaveBeenCalledTimes(1);
    expect(mockJumeau).toHaveBeenCalledTimes(1);
    expect(mockIngestion.mock.calls[0][0]).toMatchObject({ id: "ev1", tenantId: "tenant1" });
    expect(r.processed).toBe(1);
  });

  // Propriété dont dépend la justesse du jumeau : il agrège les preuves que le
  // moteur vient d'écrire. Les paralléliser produirait un profil calculé sur
  // des preuves incomplètes.
  it("exécute les traitements en séquence, dans l'ordre déclaré", async () => {
    mockPrisma.learnosEvent.findMany.mockResolvedValue([evenement()]);
    const ordre: string[] = [];
    mockIngestion.mockImplementation(async () => {
      ordre.push("preuves");
    });
    mockJumeau.mockImplementation(async () => {
      ordre.push("jumeau");
    });

    await drainEvents();

    expect(ordre).toEqual(["preuves", "jumeau"]);
  });

  // Si le moteur de preuves échoue, agréger n'aurait aucun sens : le jumeau ne
  // doit pas tourner sur des preuves qui n'ont pas été écrites.
  it("n'agrège pas quand l'écriture des preuves a échoué", async () => {
    mockPrisma.learnosEvent.findMany.mockResolvedValue([evenement()]);
    mockIngestion.mockRejectedValue(new Error("écriture impossible"));

    await drainEvents();

    expect(mockJumeau).not.toHaveBeenCalled();
  });

  // Un type sans traitement enregistré est bien livré — à zéro auditeur. Le
  // payload reste en base, donc rejouable quand un traitement sera ajouté.
  it("marque traité un événement qu'aucun traitement n'écoute", async () => {
    mockPrisma.learnosEvent.findMany.mockResolvedValue([
      evenement({ eventType: "absence.recorded" }),
    ]);

    const r = await drainEvents();

    expect(mockIngestion).not.toHaveBeenCalled();
    expect(r.processed).toBe(1);
    const args = mockPrisma.learnosEvent.updateMany.mock.calls[0][0];
    expect(args.data.processedAt).toBeInstanceOf(Date);
    // Le marquage exige le tenant, pas seulement l'identifiant.
    expect(args.where).toEqual({ id: "ev1", tenantId: "tenant1" });
  });

  // Un fait dont le traitement échoue ne doit pas être marqué traité : il
  // serait perdu. Il reste en file, avec le motif, pour un nouveau passage.
  it("laisse en file un événement dont le traitement échoue", async () => {
    mockPrisma.learnosEvent.findMany.mockResolvedValue([evenement()]);
    mockIngestion.mockRejectedValue(new Error("payload incomplet"));

    const r = await drainEvents();

    expect(r.failed).toBe(1);
    expect(r.processed).toBe(0);
    const args = mockPrisma.learnosEvent.updateMany.mock.calls[0][0];
    expect(args.data.processedAt).toBeUndefined();
    expect(args.data.attempts).toBe(1);
    expect(args.data.lastError).toContain("payload incomplet");
  });

  // Un fait qui échoue systématiquement ne doit pas bloquer indéfiniment la
  // file : au-delà du seuil, il est abandonné et signalé.
  it("abandonne un événement après le seuil de tentatives", async () => {
    mockPrisma.learnosEvent.findMany.mockResolvedValue([evenement({ attempts: 4 })]);
    mockIngestion.mockRejectedValue(new Error("toujours en échec"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await drainEvents();

    expect(r.abandoned).toBe(1);
    expect(r.failed).toBe(0);
  });

  // Un événement fautif ne doit pas empêcher les suivants d'être traités.
  it("poursuit le lot malgré un échec isolé", async () => {
    mockPrisma.learnosEvent.findMany.mockResolvedValue([
      evenement({ id: "ev1" }),
      evenement({ id: "ev2" }),
    ]);
    mockIngestion
      .mockRejectedValueOnce(new Error("échec isolé"))
      .mockResolvedValueOnce(undefined);

    const r = await drainEvents();

    expect(r.failed).toBe(1);
    expect(r.processed).toBe(1);
  });

  it("rend un compte rendu au lieu de lever quand la base est injoignable", async () => {
    mockPrisma.learnosEvent.findMany.mockRejectedValue(new Error("base indisponible"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(drainEvents()).resolves.toEqual({ processed: 0, failed: 0, abandoned: 0 });
  });

  it("écarte les événements ayant épuisé leurs tentatives", async () => {
    await drainEvents();
    expect(mockPrisma.learnosEvent.findMany.mock.calls[0][0].where.attempts).toEqual({ lt: 5 });
  });
});

describe("rejeu", () => {
  // Indispensable : les faits publiés avant l'existence d'un traitement ont été
  // marqués traités. Sans rejeu, l'historique serait définitivement perdu.
  it("remet en file et remet à zéro le compteur de tentatives", async () => {
    mockPrisma.learnosEvent.updateMany.mockResolvedValue({ count: 12 });

    const n = await replayEvents({ tenantId: "tenant1", eventType: "note.recorded" });

    expect(n).toBe(12);
    const args = mockPrisma.learnosEvent.updateMany.mock.calls[0][0];
    expect(args.where.tenantId).toBe("tenant1");
    expect(args.where.eventType).toBe("note.recorded");
    expect(args.data).toEqual({ processedAt: null, attempts: 0, lastError: null });
  });

  it("reste borné au tenant demandé", async () => {
    await replayEvents({ tenantId: "tenant1" });
    expect(mockPrisma.learnosEvent.updateMany.mock.calls[0][0].where.tenantId).toBe("tenant1");
  });
});

describe("supervision", () => {
  it("distingue les événements en attente de ceux abandonnés", async () => {
    mockPrisma.learnosEvent.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);

    const etat = await eventBacklog("tenant1");

    expect(etat).toEqual({ pending: 3, abandoned: 1 });
    expect(mockPrisma.learnosEvent.count.mock.calls[0][0].where.attempts).toEqual({ lt: 5 });
    expect(mockPrisma.learnosEvent.count.mock.calls[1][0].where.attempts).toEqual({ gte: 5 });
  });
});
