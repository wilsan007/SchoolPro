import { test, expect } from "./fixtures-roles";
import { loginAs } from "./fixtures-roles";

/**
 * Redirection post-login par rôle
 * ============================================================
 * Vérifie que chaque rôle est aiguillé vers sa route d'accueil
 * définie dans `src/lib/accueil-par-role.ts` après connexion.
 *
 * SOURCE DE VÉRITÉ : `ACCUEIL_PAR_ROLE` dans `accueil-par-role.ts`.
 *
 * Prérequis :
 *   1. Le seed E2E (`prisma/seed-e2e.ts`) a été appliqué.
 *   2. Le serveur dev tourne sur le port configuré (3001 par défaut).
 */

const ACCUEIL: Record<string, string> = {
  SUPER_ADMIN: "/super-admin",
  TENANT_ADMIN: "/direction",
  PRINCIPAL: "/direction",
  TEACHER: "/mon-espace",
  CLASS_TEACHER: "/ma-classe",
  PARENT: "/parent",
  STUDENT: "/eleve",
  SUPERVISOR: "/vie-scolaire",
  SECRETARY: "/secretariat",
  COUNSELOR: "/conseiller",
  NURSE: "/infirmerie",
  ACCOUNTANT: "/comptabilite",
  // /ma-matiere est le nouvel écran du coordinateur de matière,
  // en cours de création. Tant que accueil-par-role.ts renvoie null
  // pour SUBJECT_LEAD, ce test échouera — c'est l'objectif : il
  // verrouille l'invariant jusqu'à ce que l'écran soit livré.
  SUBJECT_LEAD: "/ma-matiere",
};

test.describe("Redirection post-login par rôle", () => {
  test.describe.configure({ mode: "serial" });

  for (const [role, expectedRoute] of Object.entries(ACCUEIL)) {
    test(`${role} arrive sur ${expectedRoute}`, async ({ page }) => {
      await loginAs(page, role);
      await expect(page).toHaveURL(new RegExp(expectedRoute));
    });
  }
});
