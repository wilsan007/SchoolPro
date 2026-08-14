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
 *   1. Les comptes QA LEARNOS (`scripts/qa-comptes-demo.ts`) ont été créés.
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
  SUBJECT_LEAD: "/ma-matiere",
  SITE_MANAGER: "/exploitation",
  INSPECTOR: "/inspection",
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
