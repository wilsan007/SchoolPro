import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DecalageDetectePayload } from "@/lib/learnos/events";

vi.mock("@/lib/prisma", () => ({
  default: {
    notification: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    chapitre: {
      findFirst: vi.fn(),
    },
    classe: {
      findFirst: vi.fn(),
    },
  },
}));

import prisma from "@/lib/prisma";
import { onDecalageDetecte } from "./decalage-detecte";

const mockPrisma = prisma as unknown as {
  notification: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  chapitre: { findFirst: ReturnType<typeof vi.fn> };
  classe: { findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.notification.findFirst.mockResolvedValue(null);
  mockPrisma.notification.create.mockResolvedValue({});
  mockPrisma.chapitre.findFirst.mockResolvedValue({
    nom: "Chapitre 1",
    matiere: { nom: "Mathématiques" },
  });
  mockPrisma.classe.findFirst.mockResolvedValue({ nom: "Terminale A" });
});

function event(aggregateId = "plan-1-s5"): {
  id: string;
  tenantId: string;
  siteId: string;
  eventType: "decalage.detecte";
  aggregateType: string;
  aggregateId: string;
  payload: DecalageDetectePayload;
  occurredAt: Date;
} {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "decalage.detecte" as const,
    aggregateType: "planification",
    aggregateId,
    payload: {
      classeId: "classe-1",
      matiereId: "matiere-1",
      chapitreId: "chapitre-1",
      semainePrevue: 3,
      semaineActuelle: 5,
      niveauDecalage: "DECALAGE",
    },
    occurredAt: new Date(),
  };
}

describe("onDecalageDetecte", () => {
  it("crée une notification IN_APP pour la direction", async () => {
    await onDecalageDetecte(event());

    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.notification.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe("tenant-1");
    expect(data.canal).toBe("IN_APP");
    expect(data.cible).toBe("DIRECTION");
    expect(data.titre).toContain("plan-1-s5");
    expect(data.contenu).toContain("Mathématiques");
    expect(data.contenu).toContain("Chapitre 1");
    expect(data.contenu).toContain("Terminale A");
  });

  it("n'écrit pas de doublon si la notification existe déjà (idempotence)", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue({ id: "existing-notif" });

    await onDecalageDetecte(event());

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it("fonctionne même si classeId est null", async () => {
    const ev = event();
    ev.payload.classeId = null;

    await onDecalageDetecte(ev);

    expect(mockPrisma.classe.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.notification.create.mock.calls[0][0].data;
    expect(data.contenu).toContain("—");
  });
});
