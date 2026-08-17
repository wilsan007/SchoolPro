import { describe, it, expect } from "vitest";
import {
  ROLE_PERMISSIONS,
  ROUTE_RULES,
  canAccessRoute,
  roleHasPermission,
  findRouteRule,
} from "./permissions";

/**
 * Tests pour le rôle CAISSIER et le flux de remise de caisse.
 *
 * Le caissier :
 *   - peut saisir les recettes (finance:read, finance:write)
 *   - peut déclarer une remise de caisse (/caisse)
 *   - peut accéder à la facturation pour encaisser (/facturation)
 *   - ne peut PAS confirmer sa propre remise (contrôle côté API)
 *   - ne peut PAS gérer les budgets, dépenses, RH, paramètres
 */

describe("rôle CAISSIER — permissions", () => {
  it("possède finance:read et finance:write", () => {
    expect(roleHasPermission("CAISSIER", "finance:read")).toBe(true);
    expect(roleHasPermission("CAISSIER", "finance:write")).toBe(true);
  });

  it("peut lire les élèves et parents (contexte encaissement)", () => {
    expect(roleHasPermission("CAISSIER", "eleves:read")).toBe(true);
    expect(roleHasPermission("CAISSIER", "parents:read")).toBe(true);
  });

  it("ne peut PAS gérer les budgets ni les dépenses (finance:delete)", () => {
    expect(roleHasPermission("CAISSIER", "finance:delete")).toBe(false);
  });

  it("ne peut PAS accéder aux RH ni aux paramètres", () => {
    expect(roleHasPermission("CAISSIER", "rh:read")).toBe(false);
    expect(roleHasPermission("CAISSIER", "parametres:read")).toBe(false);
  });

  it("ne peut PAS tout faire (pas de wildcard)", () => {
    expect(ROLE_PERMISSIONS.CAISSIER).not.toContain("*");
  });
});

describe("rôle CAISSIER — accès aux routes", () => {
  it("peut accéder à /caisse", () => {
    expect(canAccessRoute("CAISSIER", "/caisse")).toBe(true);
  });

  it("peut accéder à /facturation pour encaisser", () => {
    expect(canAccessRoute("CAISSIER", "/facturation")).toBe(true);
  });

  it("peut accéder à /comptabilite", () => {
    expect(canAccessRoute("CAISSIER", "/comptabilite")).toBe(true);
  });

  it("ne peut PAS accéder à /rh", () => {
    expect(canAccessRoute("CAISSIER", "/rh")).toBe(false);
  });

  it("ne peut PAS accéder à /parametres", () => {
    expect(canAccessRoute("CAISSIER", "/parametres")).toBe(false);
  });

  it("ne peut PAS accéder à /direction", () => {
    expect(canAccessRoute("CAISSIER", "/direction")).toBe(false);
  });
});

describe("route /caisse — règles", () => {
  it("a une règle déclarée", () => {
    expect(findRouteRule("/caisse")).not.toBeNull();
  });

  it("requiert finance:read", () => {
    const rule = findRouteRule("/caisse");
    expect(rule).not.toBeNull();
    expect(rule!.permission).toBe("finance:read");
  });

  it("est accessible à CAISSIER, ACCOUNTANT, TENANT_ADMIN, SUPER_ADMIN, PRINCIPAL", () => {
    const allowed = ["CAISSIER", "ACCOUNTANT", "TENANT_ADMIN", "SUPER_ADMIN", "PRINCIPAL"];
    for (const role of allowed) {
      expect(canAccessRoute(role as never, "/caisse")).toBe(true);
    }
  });

  it("n'est PAS accessible à TEACHER, STUDENT, PARENT, NURSE", () => {
    const denied = ["TEACHER", "STUDENT", "PARENT", "NURSE"];
    for (const role of denied) {
      expect(canAccessRoute(role as never, "/caisse")).toBe(false);
    }
  });
});

describe("route /facturation — accès caissier", () => {
  it("est accessible au caissier", () => {
    expect(canAccessRoute("CAISSIER", "/facturation")).toBe(true);
  });

  it("reste accessible au comptable et au directeur", () => {
    expect(canAccessRoute("ACCOUNTANT", "/facturation")).toBe(true);
    expect(canAccessRoute("TENANT_ADMIN", "/facturation")).toBe(true);
  });
});

describe("double validation — logique de confirmation", () => {
  // La logique de validation des montants identiques vit dans la route API
  // /api/remises-caisse/[id]/confirmer. Ces tests valident les règles de
  // permission qui protègent cette route :
  //   - CAISSIER a finance:write → peut appeler la route
  //   - mais la route vérifie ensuite que le rôle est ACCOUNTANT/TENANT_ADMIN/SUPER_ADMIN
  //   - et que le caissier ne confirme pas sa propre remise

  it("CAISSIER a finance:write (peut appeler l'API)", () => {
    expect(roleHasPermission("CAISSIER", "finance:write")).toBe(true);
  });

  it("ACCOUNTANT a finance:write (peut confirmer)", () => {
    expect(roleHasPermission("ACCOUNTANT", "finance:write")).toBe(true);
  });

  it("TENANT_ADMIN a finance:write (peut confirmer)", () => {
    expect(roleHasPermission("TENANT_ADMIN", "finance:write")).toBe(true);
  });

  it("PRINCIPAL n'a PAS finance:write (ne peut pas confirmer)", () => {
    expect(roleHasPermission("PRINCIPAL", "finance:write")).toBe(false);
  });
});
