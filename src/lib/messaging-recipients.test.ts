import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Contrôle des destinataires à la création d'une conversation.
 *
 * La création insérait les `participantIds` reçus du client sans le moindre
 * contrôle — ni tenant, ni site, ni rôle. Seule la liste *affichée* était
 * filtrée. Ces tests vérifient que la règle de l'annuaire est bien rejouée
 * côté serveur, et surtout qu'elle refuse par défaut.
 */

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findMany: vi.fn() },
    parent: { findFirst: vi.fn() },
    eleve: { findMany: vi.fn() },
    classe: { findMany: vi.fn(), findFirst: vi.fn() },
    enseignant: { findFirst: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { rejectUnreachableRecipients } from "@/lib/messaging-scope";
import type { Role } from "@prisma/client";

const acteur = (role: Role, overrides: Record<string, unknown> = {}) => ({
  id: "moi",
  tenantId: "tenant-a",
  role,
  siteId: "site-1",
  siteIds: ["site-1"],
  tenantHasSites: true,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rejectUnreachableRecipients", () => {
  it("accepte les destinataires que l'annuaire renvoie", async () => {
    // L'annuaire confirme les deux identifiants demandés.
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "u1" },
      { id: "u2" },
    ] as never);

    const refuses = await rejectUnreachableRecipients(
      acteur("TENANT_ADMIN"),
      "DIRECT",
      ["u1", "u2"]
    );

    expect(refuses).toEqual([]);
  });

  it("refuse un destinataire absent de l'annuaire — c'était la faille", async () => {
    // `u-autre-tenant` ne ressort pas de la requête bornée au périmètre :
    // il doit être rejeté, pas inséré en silence.
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "u1" }] as never);

    const refuses = await rejectUnreachableRecipients(
      acteur("TENANT_ADMIN"),
      "DIRECT",
      ["u1", "u-autre-tenant"]
    );

    expect(refuses).toEqual(["u-autre-tenant"]);
  });

  it("refuse tout quand le rôle n'autorise aucun destinataire individuel", async () => {
    // Pour une conversation de classe, l'administration cible par audience :
    // aucune liste de personnes n'est recevable.
    const refuses = await rejectUnreachableRecipients(
      acteur("PRINCIPAL"),
      "CLASS_ANNOUNCEMENT",
      ["u1"]
    );

    expect(refuses).toEqual(["u1"]);
    // Rien ne doit même être interrogé : la règle tranche avant la base.
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("refuse tout compte sans périmètre de site exploitable", async () => {
    // Fail-closed : un compte multi-sites sans site attribué ne joint personne,
    // plutôt que l'annuaire entier du tenant.
    const refuses = await rejectUnreachableRecipients(
      acteur("SECRETARY", { siteId: null, siteIds: [] }),
      "DIRECT",
      ["u1", "u2"]
    );

    expect(refuses).toEqual(["u1", "u2"]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("refuse les parents d'une classe où l'émetteur n'a pas d'enfant", async () => {
    vi.mocked(prisma.parent.findFirst).mockResolvedValue({ id: "p1" } as never);
    // L'émetteur a un enfant en classe-1 uniquement.
    vi.mocked(prisma.eleve.findMany).mockResolvedValue([
      { classeId: "classe-1" },
    ] as never);
    // L'annuaire, borné à classe-1, ne renvoie que ce parent-là.
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "parent-classe-1" }] as never);

    const refuses = await rejectUnreachableRecipients(
      acteur("PARENT"),
      "FREE",
      ["parent-classe-1", "parent-classe-9"]
    );

    expect(refuses).toEqual(["parent-classe-9"]);
  });

  it("refuse un parent sans fiche, plutôt que d'ouvrir l'annuaire", async () => {
    vi.mocked(prisma.parent.findFirst).mockResolvedValue(null as never);

    const refuses = await rejectUnreachableRecipients(
      acteur("PARENT"),
      "FREE",
      ["u1"]
    );

    expect(refuses).toEqual(["u1"]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("ignore l'émetteur lui-même, toujours participant de sa conversation", async () => {
    const refuses = await rejectUnreachableRecipients(
      acteur("TENANT_ADMIN"),
      "DIRECT",
      ["moi"]
    );

    expect(refuses).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
