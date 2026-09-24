/**
 * Verrouillage du journal d'idempotence des tâches planifiées.
 * ============================================================
 *
 * Contexte : en production (`RLS_MODE=enforce`), l'`upsert` de ce journal
 * s'exécutait hors de tout contexte RLS. Il échouait donc à chaque passage,
 * et son `catch` — prévu pour la seule violation d'unicité — en concluait
 * « déjà exécutée, sauter ». Les tâches gardées par `idempotenceSec` ne
 * tournaient plus, tout en renvoyant `job succeeded`.
 *
 * Les tests ci-dessous protègent les deux propriétés qui empêchent ce retour :
 *
 *  1. **Le journal s'écrit sous contexte système.** Une tâche planifiée est
 *     hors session HTTP et balaie tous les tenants : sans
 *     `withSystemContext`, l'écriture est rejetée en mode `enforce`. Le test
 *     lit le contexte RLS *depuis l'intérieur* de l'`upsert`, seul endroit où
 *     l'on peut prouver qu'il est bien posé.
 *  2. **Une erreur technique n'est jamais confondue avec « déjà exécutée ».**
 *     Seule la violation d'unicité (`P2002`) autorise à sauter la tâche.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  dejaExecutee,
  estViolationUnicite,
  fenetreIdempotence,
  type JournalIdempotence,
} from "./cron-idempotence";
import { getRlsContext } from "./rls-context";

/** Journal factice : capture les arguments et le contexte RLS ambiant. */
function journalFactice(reaction: "ok" | "P2002" | "panne") {
  const appels: { nom: string; fenetre: Date; contexte: unknown }[] = [];
  const journal: JournalIdempotence = {
    tacheCronExecution: {
      upsert: async (args) => {
        appels.push({
          nom: args.where.nom_fenetre.nom,
          fenetre: args.where.nom_fenetre.fenetre,
          contexte: getRlsContext(),
        });
        if (reaction === "P2002") {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        if (reaction === "panne") throw new Error("connection refused");
        return { id: "trc_1" };
      },
    },
  };
  return { journal, appels };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dejaExecutee — contexte RLS", () => {
  it("écrit le journal sous contexte système (cron cross-tenant)", async () => {
    const { journal, appels } = journalFactice("ok");

    const skip = await dejaExecutee(journal, "learnos-kpi", 3600);

    expect(skip).toBe(false);
    expect(appels).toHaveLength(1);
    // Le contexte doit être posé AU MOMENT de l'upsert, pas avant ni après.
    const ctx = appels[0].contexte as {
      tenantId: string | null;
      superAdmin: boolean;
      origin?: string;
    };
    expect(ctx).toBeDefined();
    expect(ctx.superAdmin).toBe(true);
    expect(ctx.tenantId).toBeNull();
    expect(ctx.origin).toBe("system:cron:idempotence");
  });

  it("hors de tout scope, le contexte est bien absent (témoin du test précédent)", () => {
    expect(getRlsContext()).toBeUndefined();
  });
});

describe("dejaExecutee — erreurs", () => {
  it("violation d'unicité → la tâche a déjà tourné : sauter", async () => {
    const { journal } = journalFactice("P2002");
    expect(await dejaExecutee(journal, "learnos-kpi", 3600)).toBe(true);
  });

  it("panne technique → exécuter, et le dire (jamais sauter en silence)", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const { journal } = journalFactice("panne");

    const skip = await dejaExecutee(journal, "learnos-kpi", 3600);

    // C'est LA régression qui a éteint 14 tâches : `true` ici = plus rien ne tourne.
    expect(skip).toBe(false);
    expect(erreur).toHaveBeenCalledOnce();
    expect(String(erreur.mock.calls[0][0])).toContain("learnos-kpi");
  });
});

describe("fenetreIdempotence", () => {
  it("arrondit au début de la période (même fenêtre dans l'heure)", () => {
    const h6m5 = Date.UTC(2026, 8, 24, 6, 5, 0);
    const h6m59 = Date.UTC(2026, 8, 24, 6, 59, 59);
    expect(fenetreIdempotence(3600, h6m5).toISOString()).toBe(
      fenetreIdempotence(3600, h6m59).toISOString()
    );
  });

  it("change de fenêtre au franchissement de la période", () => {
    const h6 = Date.UTC(2026, 8, 24, 6, 59, 59);
    const h7 = Date.UTC(2026, 8, 24, 7, 0, 0);
    expect(fenetreIdempotence(3600, h7).getTime()).toBeGreaterThan(
      fenetreIdempotence(3600, h6).getTime()
    );
  });

  it("la fenêtre transmise à la base est bien celle arrondie", async () => {
    const { journal, appels } = journalFactice("ok");
    const t = Date.UTC(2026, 8, 24, 6, 42, 17);
    await dejaExecutee(journal, "devoirs-retard-check", 3600, t);
    expect(appels[0].fenetre.toISOString()).toBe(fenetreIdempotence(3600, t).toISOString());
    expect(appels[0].nom).toBe("devoirs-retard-check");
  });
});

describe("estViolationUnicite", () => {
  it("reconnaît le code Prisma P2002", () => {
    expect(estViolationUnicite({ code: "P2002" })).toBe(true);
  });

  it("ne confond pas les autres erreurs avec une unicité", () => {
    expect(estViolationUnicite({ code: "P1001" })).toBe(false);
    expect(estViolationUnicite(new Error("boom"))).toBe(false);
    expect(estViolationUnicite(null)).toBe(false);
    expect(estViolationUnicite(undefined)).toBe(false);
  });
});
