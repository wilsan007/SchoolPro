import { describe, it, expect } from "vitest";
import { canAccessRoute, ROLE_PERMISSIONS } from "./permissions";

const ROLES = Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[];

const ROUTES = [
  "/dashboard", "/direction", "/mon-espace", "/ma-classe",
  "/parent", "/eleve", "/eleves", "/parents", "/notes",
  "/notes/bulletins", "/evaluations", "/examens", "/curriculum",
  "/recommandations", "/cours", "/emploi-du-temps",
  "/absences", "/vie-scolaire", "/orientation", "/admissions",
  "/facturation", "/rh", "/inventaire", "/alumni", "/messages",
  "/communication", "/rapports", "/analytics", "/parametres",
  "/super-admin", "/infirmerie", "/secretariat", "/comptabilite", "/conseiller",
];

describe("matrice canAccessRoute — audit 15 rôles", () => {
  it("compte les routes accessibles par rôle", () => {
    const counts: Record<string, number> = {};
    for (const role of ROLES) {
      counts[role] = ROUTES.filter(r => canAccessRoute(role, r)).length;
    }
    // Log pour inspection — ne casse pas si les counts changent
    expect(Object.keys(counts).length).toBe(15);
  });

  it("PARENT/STUDENT n'accèdent pas aux routes du personnel fermées", () => {
    const staffRoutes = ["/notes", "/absences", "/cours", "/emploi-du-temps"];
    for (const route of staffRoutes) {
      expect(canAccessRoute("PARENT", route)).toBe(false);
      expect(canAccessRoute("STUDENT", route)).toBe(false);
    }
  });

  it("PARENT/STUDENT n'accèdent pas à la console /notes/bulletins (route imprimable /bulletin uniquement)", () => {
    expect(canAccessRoute("PARENT", "/notes/bulletins")).toBe(false);
    expect(canAccessRoute("STUDENT", "/notes/bulletins")).toBe(false);
    // La route imprimable reste ouverte et est scopée côté API.
    expect(canAccessRoute("PARENT", "/bulletin/eleve-1/trimestre-1")).toBe(true);
    expect(canAccessRoute("STUDENT", "/bulletin/eleve-1/trimestre-1")).toBe(true);
  });

  it("NURSE accède à /infirmerie", () => {
    expect(canAccessRoute("NURSE", "/infirmerie")).toBe(true);
  });

  it("SECRETARY accède à /secretariat", () => {
    expect(canAccessRoute("SECRETARY", "/secretariat")).toBe(true);
  });

  it("ACCOUNTANT accède à /comptabilite", () => {
    expect(canAccessRoute("ACCOUNTANT", "/comptabilite")).toBe(true);
  });

  it("COUNSELOR accède à /conseiller", () => {
    expect(canAccessRoute("COUNSELOR", "/conseiller")).toBe(true);
  });

  it("SUPERVISOR accède à /vie-scolaire et /absences", () => {
    expect(canAccessRoute("SUPERVISOR", "/vie-scolaire")).toBe(true);
    expect(canAccessRoute("SUPERVISOR", "/absences")).toBe(true);
  });

  it("SUBJECT_LEAD accède à /ma-classe, /curriculum, /recommandations", () => {
    expect(canAccessRoute("SUBJECT_LEAD", "/ma-classe")).toBe(true);
    expect(canAccessRoute("SUBJECT_LEAD", "/curriculum")).toBe(true);
    expect(canAccessRoute("SUBJECT_LEAD", "/recommandations")).toBe(true);
  });

  it("PARENT/STUDENT n'accèdent pas aux nouveaux écrans du personnel", () => {
    for (const route of ["/infirmerie", "/secretariat", "/comptabilite", "/conseiller"]) {
      expect(canAccessRoute("PARENT", route)).toBe(false);
      expect(canAccessRoute("STUDENT", route)).toBe(false);
    }
  });

  it("la direction accède aux nouveaux écrans", () => {
    for (const route of ["/infirmerie", "/secretariat", "/comptabilite", "/conseiller"]) {
      expect(canAccessRoute("SUPER_ADMIN", route)).toBe(true);
      expect(canAccessRoute("TENANT_ADMIN", route)).toBe(true);
      expect(canAccessRoute("PRINCIPAL", route)).toBe(true);
    }
  });
});

describe("SUPERVISOR — périmètre vie scolaire", () => {
  const interdits = ["/notes", "/cours", "/facturation", "/rh"];
  it.each(interdits)("SUPERVISOR n'accède pas à %s", (route) => {
    expect(canAccessRoute("SUPERVISOR", route)).toBe(false);
  });

  const autorises = ["/eleves", "/vie-scolaire", "/absences", "/messages"];
  it.each(autorises)("SUPERVISOR accède à %s", (route) => {
    expect(canAccessRoute("SUPERVISOR", route)).toBe(true);
  });
});

describe("SUBJECT_LEAD — périmètre pédagogique par matière", () => {
  // `/notes` est restreint aux enseignants et à la direction ; SUBJECT_LEAD
  // est un coordinateur de matière, pas un saisisseur de notes.
  const autorises = ["/curriculum", "/evaluations", "/examens"];
  it.each(autorises)("SUBJECT_LEAD accède à %s", (route) => {
    expect(canAccessRoute("SUBJECT_LEAD", route)).toBe(true);
  });

  const interdits = ["/facturation", "/rh", "/admissions", "/infirmerie", "/notes"];
  it.each(interdits)("SUBJECT_LEAD n'accède pas à %s", (route) => {
    expect(canAccessRoute("SUBJECT_LEAD", route)).toBe(false);
  });
});
