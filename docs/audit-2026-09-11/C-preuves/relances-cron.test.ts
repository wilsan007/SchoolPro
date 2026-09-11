/**
 * PREUVE — relances-auto appelée 12 fois dans l'heure (cron toutes les 5 min + filtre sur l heure).
 */
import { describe, it, expect, vi } from "vitest";
const relances: { niveau: number }[] = [];
const emails: string[] = [];
vi.mock("@/lib/demo-now", () => ({ getDemoNow: async () => new Date("2026-09-11T08:00:00Z") }));
vi.mock("@/lib/annee-scolaire", () => ({ anneeActiveId: async () => "annee-1" }));
vi.mock("@/lib/audit", () => ({ auditFire: () => {} }));
vi.mock("@/lib/notifications/email", () => ({ sendEmail: async (_to: string[], sujet: string) => { emails.push(sujet); } }));
vi.mock("@/lib/prisma", () => ({ default: {
  tenant: { findMany: async () => [{ id: "t1", name: "École" }] },
  facture: { findMany: async () => [{ id: "f1", numero: "FAC-1", montant: 50000, devise: "DJF", echeance: new Date("2026-08-01"),
    eleve: { prenom: "Amina", nom: "D.", parents: [{ parent: { user: { email: "parent@ex.dj" }, email: null } }] },
    paiements: [], relances: [...relances] }] },
  relance: { create: async ({ data }: { data: { niveau: number } }) => { relances.push({ niveau: data.niveau }); return { id: "r" + relances.length }; } },
}}));
describe("relances-auto sous le cron toutes les 5 min", () => {
  it("un parent ne doit recevoir qu'UNE relance par jour", async () => {
    const { envoyerRelancesAutomatiques } = await import("@/lib/relances-auto");
    for (let passage = 0; passage < 12; passage++) await envoyerRelancesAutomatiques(); // 08:00 → 08:55
    console.log("courriels envoyés en 1 h :", emails.length, "→", emails.slice(0, 4).join(" | "), "…");
    expect(emails.length).toBe(1);
  });
});
