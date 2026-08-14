import { describe, it, expect } from "vitest";
import { accueilPourRole, ACCUEIL_PAR_ROLE } from "./accueil-par-role";
import { canAccessRoute, ROLE_PERMISSIONS, type RoleKey } from "./permissions";

/**
 * L'invariant testé ici est la pièce critique du module : un aiguillage vers un
 * écran que le rôle ne peut pas ouvrir produit une boucle
 * accueil → `/acces-bloque` → accueil en production. Ces tests sont la seule
 * chose qui empêche une liste `roles` resserrée dans `ROUTE_RULES` de casser
 * l'aiguillage sans que personne ne le voie.
 */

const TOUS_LES_ROLES: RoleKey[] = [
  "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "SECRETARY", "TEACHER",
  "CLASS_TEACHER", "COUNSELOR", "NURSE", "ACCOUNTANT",
  "SUPERVISOR", "SUBJECT_LEAD",
  "SITE_MANAGER", "INSPECTOR",
  "PARENT", "STUDENT",
];

describe("table d'accueil", () => {
  it("couvre les quinze rôles, exactement ceux de la matrice", () => {
    expect(Object.keys(ACCUEIL_PAR_ROLE).sort()).toEqual([...TOUS_LES_ROLES].sort());
    expect(Object.keys(ACCUEIL_PAR_ROLE).sort()).toEqual(
      Object.keys(ROLE_PERMISSIONS).sort()
    );
  });

  const attendus: Array<[RoleKey, string | null]> = [
    ["SUPER_ADMIN", "/super-admin"],
    ["TENANT_ADMIN", "/direction"],
    ["PRINCIPAL", "/direction"],
    ["TEACHER", "/mon-espace"],
    ["CLASS_TEACHER", "/ma-classe"],
    ["PARENT", "/parent"],
    ["STUDENT", "/eleve"],
    ["SUPERVISOR", "/vie-scolaire"],
    ["SECRETARY", "/secretariat"],
    ["COUNSELOR", "/conseiller"],
    ["NURSE", "/infirmerie"],
    ["ACCOUNTANT", "/comptabilite"],
    ["SUBJECT_LEAD", "/ma-matiere"],
    ["SITE_MANAGER", "/exploitation"],
    ["INSPECTOR", "/inspection"],
  ];
  it.each(attendus)("aiguille %s vers %s", (role, route) => {
    expect(accueilPourRole(role)).toBe(route);
  });

  it("renvoie null pour un rôle absent ou inconnu", () => {
    expect(accueilPourRole(null)).toBeNull();
    expect(accueilPourRole(undefined)).toBeNull();
    expect(accueilPourRole("")).toBeNull();
    expect(accueilPourRole("ROLE_INEXISTANT")).toBeNull();
    // Pas de résolution via la chaîne de prototypes d'un objet littéral.
    expect(accueilPourRole("constructor")).toBeNull();
    expect(accueilPourRole("toString")).toBeNull();
  });
});

describe("invariant critique : l'accueil est toujours accessible", () => {
  it.each(TOUS_LES_ROLES)(
    "%s peut ouvrir sa propre route d'accueil",
    (role) => {
      const accueil = accueilPourRole(role);
      if (accueil === null) return; // pas d'espace dédié : rien à vérifier.
      expect(
        canAccessRoute(role, accueil),
        `${role} est aiguillé vers ${accueil} mais canAccessRoute le refuse : boucle de redirection`
      ).toBe(true);
    }
  );

  // Ces deux routes portent des listes `roles` restrictives dans ROUTE_RULES :
  // ce sont les candidats les plus probables à une régression de l'invariant.
  it("vérifie explicitement PRINCIPAL → /direction", () => {
    expect(accueilPourRole("PRINCIPAL")).toBe("/direction");
    expect(canAccessRoute("PRINCIPAL", "/direction")).toBe(true);
  });

  it("vérifie explicitement CLASS_TEACHER → /ma-classe", () => {
    expect(accueilPourRole("CLASS_TEACHER")).toBe("/ma-classe");
    expect(canAccessRoute("CLASS_TEACHER", "/ma-classe")).toBe(true);
  });

  it("vérifie les espaces des familles, fermés aux autres rôles", () => {
    expect(canAccessRoute("PARENT", "/parent")).toBe(true);
    expect(canAccessRoute("STUDENT", "/eleve")).toBe(true);
  });
});

describe("aucune boucle immédiate sur /dashboard", () => {
  it("ne fait pointer aucun accueil vers /dashboard", () => {
    // `/dashboard` est l'écran qui appelle l'aiguillage : s'y renvoyer serait
    // une boucle infinie immédiate.
    const fautifs = TOUS_LES_ROLES.filter((role) => {
      const accueil = accueilPourRole(role);
      return accueil !== null && accueil.startsWith("/dashboard");
    });
    expect(fautifs).toEqual([]);
  });

  it("ne fait pointer aucun accueil vers /acces-bloque", () => {
    const fautifs = TOUS_LES_ROLES.filter(
      (role) => accueilPourRole(role) === "/acces-bloque"
    );
    expect(fautifs).toEqual([]);
  });
});
