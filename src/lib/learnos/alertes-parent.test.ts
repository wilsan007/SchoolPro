import { describe, expect, it } from "vitest";
import {
  cleSemaine,
  deciderEnvoi,
  empreinteDe,
  PREFERENCES_PAR_DEFAUT,
} from "@/lib/learnos/alertes-parent";

/**
 * La politique d'envoi est le cœur du dispositif : le risque principal n'est
 * pas de manquer une alerte, c'est d'en envoyer trop et de faire couper le
 * canal par la famille.
 */
describe("décision d'envoi", () => {
  const prefs = (p: Partial<typeof PREFERENCES_PAR_DEFAUT> = {}) => ({
    ...PREFERENCES_PAR_DEFAUT,
    ...p,
  });

  it("respecte la désinscription, quelle que soit la gravité", () => {
    // Même une urgence ne passe pas : le consentement n'est pas négociable.
    const d = deciderEnvoi("URGENT", prefs({ alertesActives: false }), 0);
    expect(d).toEqual({ envoyer: false, motif: "desinscrit" });
  });

  it("écarte ce qui est sous le seuil choisi par la famille", () => {
    const d = deciderEnvoi("INFO", prefs({ niveauMinimal: "ATTENTION" }), 0);
    expect(d.motif).toBe("sousLeSeuil");
  });

  it("laisse passer ce qui atteint le seuil", () => {
    expect(deciderEnvoi("ATTENTION", prefs({ niveauMinimal: "ATTENTION" }), 0).envoyer).toBe(true);
    expect(deciderEnvoi("URGENT", prefs({ niveauMinimal: "ATTENTION" }), 0).envoyer).toBe(true);
  });

  it("s'arrête au plafond hebdomadaire même quand tout est légitime", () => {
    const d = deciderEnvoi("URGENT", prefs({ plafondHebdomadaire: 3 }), 3);
    expect(d).toEqual({ envoyer: false, motif: "plafondAtteint" });
  });

  it("compte le plafond strictement en dessous", () => {
    expect(deciderEnvoi("INFO", prefs({ plafondHebdomadaire: 3 }), 2).envoyer).toBe(true);
  });

  it("applique la désinscription avant le seuil et le plafond", () => {
    // L'ordre compte pour le motif journalisé : on doit pouvoir répondre
    // « vous vous étiez désinscrit », pas « le plafond était atteint ».
    const d = deciderEnvoi("INFO", prefs({ alertesActives: false, plafondHebdomadaire: 0 }), 9);
    expect(d.motif).toBe("desinscrit");
  });

  it("envoie par défaut pour une famille qui n'a rien réglé", () => {
    expect(deciderEnvoi("ATTENTION", PREFERENCES_PAR_DEFAUT, 0).envoyer).toBe(true);
  });
});

describe("idempotence", () => {
  it("produit la même empreinte pour le même fait", () => {
    // Le cron passe plusieurs fois : sans cela, la même absence produirait un
    // message par passage.
    expect(empreinteDe("absences|e1|p1|2026-S7")).toBe(empreinteDe("absences|e1|p1|2026-S7"));
  });

  it("distingue deux élèves et deux parents", () => {
    expect(empreinteDe("absences|e1|p1|2026-S7")).not.toBe(empreinteDe("absences|e2|p1|2026-S7"));
    expect(empreinteDe("absences|e1|p1|2026-S7")).not.toBe(empreinteDe("absences|e1|p2|2026-S7"));
  });
});

describe("clé de semaine ISO", () => {
  it("regroupe les jours d'une même semaine", () => {
    // Lundi 9 et dimanche 15 février 2026 sont la même semaine ISO.
    expect(cleSemaine(new Date("2026-02-09T08:00:00Z"))).toBe(
      cleSemaine(new Date("2026-02-15T23:00:00Z"))
    );
  });

  it("sépare deux semaines consécutives", () => {
    // Trois absences cette semaine et trois la suivante sont deux faits
    // distincts, qui méritent deux messages.
    expect(cleSemaine(new Date("2026-02-15T12:00:00Z"))).not.toBe(
      cleSemaine(new Date("2026-02-16T12:00:00Z"))
    );
  });

  it("ne confond pas deux années au passage du 1er janvier", () => {
    expect(cleSemaine(new Date("2026-01-05T12:00:00Z"))).toBe("2026-S2");
  });
});
