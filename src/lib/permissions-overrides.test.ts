/**
 * Dérogations par utilisateur (`user_permission`) — sémantique.
 * ============================================================
 *
 * Le tableau « Permissions utilisateur » écrivait en base depuis toujours, mais
 * `roleHasPermission` / `canAccessRoute` / `guardPage` / `authorize` ne lisaient
 * que la matrice des rôles : un `deny` n'avait aucun effet. Ces tests fixent la
 * sémantique qui rend désormais la table opérante.
 *
 * Règles verrouillées :
 *  - `deny` l'emporte toujours, y compris sur un `grant` de même portée et sur
 *    le wildcard `*` du SUPER_ADMIN ;
 *  - `grant` n'ajoute que ce que le rôle n'a pas ;
 *  - un joker (`module:*`) dans une dérogation couvre le module ;
 *  - sans dérogation, le comportement est **strictement** celui d'avant.
 */
import { describe, it, expect } from "vitest";
import { canAccessRoute, roleHasPermission, roleHasAnyPermission } from "./permissions";

describe("Dérogations — sans override, comportement inchangé", () => {
  it("un objet vide ne modifie rien", () => {
    expect(roleHasPermission("TEACHER", "notes:read", {})).toBe(true);
    expect(roleHasPermission("TEACHER", "eleves:write", {})).toBe(false);
    expect(roleHasPermission("TEACHER", "notes:read", { grants: [], denies: [] })).toBe(true);
  });

  it("`undefined` équivaut à aucune dérogation", () => {
    expect(roleHasPermission("NURSE", "finance:read", undefined)).toBe(false);
    expect(canAccessRoute("TEACHER", "/notes", undefined)).toBe(true);
  });
});

describe("Dérogations — révocation (`deny`)", () => {
  it("retire une permission que le rôle détient", () => {
    expect(roleHasPermission("TEACHER", "notes:write")).toBe(true);
    expect(roleHasPermission("TEACHER", "notes:write", { denies: ["notes:write"] })).toBe(false);
  });

  it("l'emporte sur un octroi de même portée", () => {
    expect(
      roleHasPermission("TEACHER", "eleves:write", {
        grants: ["eleves:write"],
        denies: ["eleves:write"],
      })
    ).toBe(false);
  });

  it("l'emporte sur le wildcard `*` du SUPER_ADMIN", () => {
    expect(roleHasPermission("SUPER_ADMIN", "finance:read")).toBe(true);
    expect(
      roleHasPermission("SUPER_ADMIN", "finance:read", { denies: ["finance:read"] })
    ).toBe(false);
  });

  it("un joker `module:*` dans les denies couvre tout le module", () => {
    expect(roleHasPermission("TENANT_ADMIN", "notes:write", { denies: ["notes:*"] })).toBe(false);
    expect(roleHasPermission("TENANT_ADMIN", "notes:delete", { denies: ["notes:*"] })).toBe(false);
    // …et ne déborde pas sur un autre module.
    expect(roleHasPermission("TENANT_ADMIN", "eleves:read", { denies: ["notes:*"] })).toBe(true);
  });

  it("ferme la route correspondante", () => {
    expect(canAccessRoute("TEACHER", "/notes")).toBe(true);
    expect(canAccessRoute("TEACHER", "/notes", { denies: ["notes:read"] })).toBe(false);
  });

  it("ferme aussi la sortie des règles `roles` (double critère)", () => {
    // `/parametres` est gouverné par `parametres:read` ; ACCOUNTANT la détient.
    expect(canAccessRoute("ACCOUNTANT", "/parametres")).toBe(true);
    expect(canAccessRoute("ACCOUNTANT", "/parametres", { denies: ["parametres:read"] })).toBe(false);
  });
});

describe("Dérogations — octroi (`grant`)", () => {
  it("accorde une permission que le rôle ne porte pas", () => {
    expect(roleHasPermission("TEACHER", "finance:read")).toBe(false);
    expect(roleHasPermission("TEACHER", "finance:read", { grants: ["finance:read"] })).toBe(true);
  });

  it("ouvre la route correspondante", () => {
    // `/rh` n'a pas de liste `roles` : `rh:read` suffit à l'ouvrir.
    expect(canAccessRoute("TEACHER", "/rh")).toBe(false);
    expect(canAccessRoute("TEACHER", "/rh", { grants: ["rh:read"] })).toBe(true);
  });

  it("n'outrepasse jamais la liste `roles` d'une route (écran personnel)", () => {
    // `/parent` exige `notes:read` ET le rôle PARENT. Un TEACHER à qui l'on
    // accorde `notes:read` ne doit pas hériter de l'espace d'un parent.
    expect(canAccessRoute("TEACHER", "/parent", { grants: ["notes:read"] })).toBe(false);
  });

  it("un joker `module:*` couvre le module accordé", () => {
    expect(roleHasPermission("TEACHER", "finance:write", { grants: ["finance:*"] })).toBe(true);
    expect(roleHasPermission("TEACHER", "inventaire:read", { grants: ["finance:*"] })).toBe(false);
  });
});

describe("Dérogations — OU logique", () => {
  it("roleHasAnyPermission reste un OU, dérogations appliquées par permission", () => {
    // Le deny sur `eleves:write` n'empêche pas `notes:read` de satisfaire le OU.
    expect(
      roleHasAnyPermission("TEACHER", ["eleves:write", "notes:read"], {
        denies: ["eleves:write"],
      })
    ).toBe(true);
    // Si toutes les permissions demandées sont refusées, le OU échoue.
    expect(
      roleHasAnyPermission("TEACHER", ["eleves:write", "finance:read"], {
        denies: ["eleves:write"],
      })
    ).toBe(false);
  });
});
