import { describe, it, expect } from "vitest";
import { CHATBOT_DIRECTION_ACTIF } from "@/lib/learnos/chatbot-direction";
import { canAccessRoute } from "@/lib/permissions";
import type { Role } from "@prisma/client";

/**
 * Le chatbot d'analyse de la direction est temporairement désactivé.
 * Cette suite garantit que :
 *   1. Le feature flag global est bien `false` (invisibilité totale).
 *   2. La matrice de permissions reste intacte pour une réactivation propre :
 *      la règle `/chatbot-direction` continue de restreindre l'accès aux rôles
 *      autorisés, et refuse les autres rôles. Ainsi, quand le flag repassera
 *      à `true`, l'autorisation sera déjà correcte.
 *   3. Aucun rôle non autorisé ne profite de la désactivation pour accéder
 *      à la route.
 */
describe("CHATBOT_DIRECTION_ACTIF", () => {
  it("est false pendant la phase de masquage", () => {
    expect(CHATBOT_DIRECTION_ACTIF).toBe(false);
  });
});

describe("matrice de permissions /chatbot-direction (préservée)", () => {
  const rolesAutorises: Role[] = ["SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL"];

  it("autorise les rôles de direction", () => {
    for (const role of rolesAutorises) {
      expect(canAccessRoute(role, "/chatbot-direction")).toBe(true);
    }
  });

  it("refuse les rôles non directionnels", () => {
    const rolesRefuses: Role[] = [
      "TEACHER",
      "CLASS_TEACHER",
      "SUBJECT_LEAD",
      "PARENT",
      "STUDENT",
      "SECRETARY",
      "COUNSELOR",
      "NURSE",
      "ACCOUNTANT",
      "CAISSIER",
      "SUPERVISOR",
      "SITE_MANAGER",
      "INSPECTOR",
    ];
    for (const role of rolesRefuses) {
      expect(canAccessRoute(role, "/chatbot-direction")).toBe(false);
    }
  });

  it("refuse les sous-chemins à tous les rôles non directionnels", () => {
    expect(canAccessRoute("TEACHER", "/chatbot-direction/historique")).toBe(false);
    expect(canAccessRoute("PARENT", "/chatbot-direction/export")).toBe(false);
  });
});
