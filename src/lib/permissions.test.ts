/**
 * Tests d'exhaustivité et de cohérence de la matrice RBAC.
 *
 * Inspirés de GOSE 2.0 — la matrice de permissions est l'unique
 * source de vérité. Ce test valide qu'elle est complète, cohérente
 * et que les séparations de rôles sont respectées.
 */
import { describe, it, expect } from "vitest";
import {
  ROLE_PERMISSIONS,
  roleHasPermission,
  roleHasAnyPermission,
  ALL_PERMISSIONS,
  ROUTE_RULES,
  type RoleKey,
} from "@/lib/permissions";

const TOUS_LES_ROLES: RoleKey[] = [
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "PRINCIPAL",
  "SECRETARY",
  "TEACHER",
  "CLASS_TEACHER",
  "COUNSELOR",
  "NURSE",
  "ACCOUNTANT",
  "CAISSIER",
  "SUPERVISOR",
  "SUBJECT_LEAD",
  "SITE_MANAGER",
  "INSPECTOR",
  "PARENT",
  "STUDENT",
];

describe("Matrice RBAC — exhaustivité", () => {
  it("chaque rôle de l'union type a une entrée dans ROLE_PERMISSIONS", () => {
    for (const role of TOUS_LES_ROLES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
    }
  });

  it("ROLE_PERMISSIONS ne contient que les 16 rôles attendus", () => {
    const keys = Object.keys(ROLE_PERMISSIONS);
    expect(keys).toHaveLength(16);
    for (const role of TOUS_LES_ROLES) {
      expect(keys).toContain(role);
    }
  });
});

describe("Matrice RBAC — cohérence des permissions", () => {
  it("SUPER_ADMIN a le wildcard *", () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain("*");
  });

  it("TENANT_ADMIN a plus de permissions que PRINCIPAL", () => {
    const admin = ROLE_PERMISSIONS.TENANT_ADMIN.length;
    const principal = ROLE_PERMISSIONS.PRINCIPAL.length;
    expect(admin).toBeGreaterThan(principal);
  });

  it("TEACHER peut lire ET écrire des notes (notes:*)", () => {
    expect(roleHasPermission("TEACHER", "notes:read")).toBe(true);
    expect(roleHasPermission("TEACHER", "notes:write")).toBe(true);
  });

  it("PARENT ne peut pas créer d'élèves (eleves:write)", () => {
    expect(roleHasPermission("PARENT", "eleves:write")).toBe(false);
  });

  it("STUDENT ne peut pas créer de notes (notes:write)", () => {
    expect(roleHasPermission("STUDENT", "notes:write")).toBe(false);
  });

  it("NURSE a des permissions minimales", () => {
    const perms = ROLE_PERMISSIONS.NURSE;
    expect(perms).toContain("eleves:read");
    expect(perms).toContain("absences:read");
    expect(perms).not.toContain("notes:*");
    expect(perms).not.toContain("bulletins:write");
  });

  it("ACCOUNTANT a finance:* mais pas notes:write", () => {
    expect(roleHasPermission("ACCOUNTANT", "finance:write")).toBe(true);
    expect(roleHasPermission("ACCOUNTANT", "notes:write")).toBe(false);
  });

  it("CAISSIER a finance:read et finance:write mais pas finance:*", () => {
    expect(roleHasPermission("CAISSIER", "finance:read")).toBe(true);
    expect(roleHasPermission("CAISSIER", "finance:write")).toBe(true);
    expect(ROLE_PERMISSIONS.CAISSIER).not.toContain("finance:*");
  });

  it("INSPECTOR n'a que des permissions en lecture", () => {
    const perms = ROLE_PERMISSIONS.INSPECTOR;
    const hasWrite = perms.some(
      (p) => p.includes(":write") || p.includes(":*") || p.includes(":delete")
    );
    expect(hasWrite).toBe(false);
  });
});

describe("roleHasPermission", () => {
  it("SUPER_ADMIN avec n'importe quelle permission retourne true", () => {
    expect(roleHasPermission("SUPER_ADMIN", "anything:read")).toBe(true);
    expect(roleHasPermission("SUPER_ADMIN", "finance:delete")).toBe(true);
  });

  it("TEACHER avec notes:read retourne true", () => {
    expect(roleHasPermission("TEACHER", "notes:read")).toBe(true);
  });

  it("TEACHER avec eleves:write retourne false", () => {
    expect(roleHasPermission("TEACHER", "eleves:write")).toBe(false);
  });

  it("PARENT avec bulletins:read retourne true", () => {
    expect(roleHasPermission("PARENT", "bulletins:read")).toBe(true);
  });

  it("PARENT avec bulletins:write retourne false", () => {
    expect(roleHasPermission("PARENT", "bulletins:write")).toBe(false);
  });

  it("TEACHER avec notes:* wildcard — notes:read doit matcher", () => {
    expect(roleHasPermission("TEACHER", "notes:read")).toBe(true);
  });

  it("rôle inconnu retourne false", () => {
    expect(roleHasPermission("UNKNOWN_ROLE", "notes:read")).toBe(false);
  });
});

describe("roleHasAnyPermission", () => {
  it("TEACHER avec [eleves:write, notes:read] retourne true (OU logique)", () => {
    expect(roleHasAnyPermission("TEACHER", ["eleves:write", "notes:read"])).toBe(true);
  });

  it("TEACHER avec [eleves:write, finance:*] retourne false", () => {
    expect(roleHasAnyPermission("TEACHER", ["eleves:write", "finance:*"])).toBe(false);
  });
});

describe("ALL_PERMISSIONS", () => {
  it("ne contient pas de doublons", () => {
    const unique = new Set(ALL_PERMISSIONS);
    expect(unique.size).toBe(ALL_PERMISSIONS.length);
  });

  it("ne contient pas le wildcard *", () => {
    expect(ALL_PERMISSIONS).not.toContain("*");
  });
});

describe("Séparabilité des rôles (inspiré GOSE 2.0)", () => {
  it("un STUDENT ne peut pas accéder à finance", () => {
    expect(roleHasPermission("STUDENT", "finance:read")).toBe(false);
    expect(roleHasPermission("STUDENT", "finance:*")).toBe(false);
  });

  it("un PARENT ne peut pas écrire de notes", () => {
    expect(roleHasPermission("PARENT", "notes:write")).toBe(false);
  });

  it("un NURSE ne peut pas écrire de bulletins", () => {
    expect(roleHasPermission("NURSE", "bulletins:write")).toBe(false);
  });

  it("un CAISSIER ne peut pas accéder aux paramètres", () => {
    expect(roleHasPermission("CAISSIER", "parametres:read")).toBe(false);
    expect(roleHasPermission("CAISSIER", "parametres:*")).toBe(false);
  });

  it("un TEACHER ne peut pas accéder aux admissions", () => {
    expect(roleHasPermission("TEACHER", "admissions:read")).toBe(false);
    expect(roleHasPermission("TEACHER", "admissions:write")).toBe(false);
  });
});

describe("ROUTE_RULES — routes critiques", () => {
  it("la route /notes nécessite notes:read", () => {
    const rule = ROUTE_RULES.find((r) => r.pattern.test("/notes"));
    expect(rule).toBeDefined();
    expect(rule?.permission).toBe("notes:read");
  });

  it("la route /eleves nécessite eleves:read", () => {
    const rule = ROUTE_RULES.find((r) => r.pattern.test("/eleves"));
    expect(rule).toBeDefined();
    expect(rule?.permission).toBe("eleves:read");
  });

  it("la route /direction nécessite analytics:read", () => {
    const rule = ROUTE_RULES.find((r) => r.pattern.test("/direction"));
    expect(rule).toBeDefined();
    expect(rule?.permission).toBe("analytics:read");
  });

  it("la route /parent est restreinte au rôle PARENT", () => {
    const rule = ROUTE_RULES.find((r) => r.pattern.test("/parent"));
    expect(rule).toBeDefined();
    expect(rule?.roles).toContain("PARENT");
  });

  it("la route /eleve est restreinte au rôle STUDENT", () => {
    const rule = ROUTE_RULES.find((r) => r.pattern.test("/eleve"));
    expect(rule).toBeDefined();
    expect(rule?.roles).toContain("STUDENT");
  });
});
