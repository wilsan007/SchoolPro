import { test, expect } from "./fixtures-roles";
import { loginAs } from "./fixtures-roles";

/**
 * Routes fermées aux familles
 * ============================================================
 * Les quatre routes ci-dessous sont les consoles du *personnel* :
 *
 *   - /notes            → saisie des notes (personnel)
 *   - /absences         → appel et justification (personnel)
 *   - /cours            → création et publication des cours (personnel)
 *   - /emploi-du-temps  → éditeur de grille horaire (personnel)
 *
 * Bien que PARENT et STUDENT possèdent les permissions en lecture
 * (`notes:read`, `absences:read`, `cours:read`, `emploi-du-temps:read`)
 * pour consulter les données de *leurs* enfants depuis leur espace
 * dédié, la liste `roles` dans `ROUTE_RULES` leur interdit ces écrans.
 *
 * Les familles consultent ces données via :
 *   - /parent, /eleve           → espace personnel
 *   - /mon-emploi               → emploi du temps en lecture
 *   - /bulletin/{eleve}/{periode} → bulletin imprimable
 *
 * Ce fichier verrouille l'invariant : aucune des quatre routes
 * ne doit être accessible à PARENT ou STUDENT.
 *
 * Prérequis :
 *   1. Le seed E2E a été appliqué.
 *   2. Le serveur dev tourne sur le port configuré.
 */

const FAMILY_ROLES = ["PARENT", "STUDENT"] as const;

const BLOCKED_ROUTES = [
  "/notes",
  "/absences",
  "/cours",
  "/emploi-du-temps",
] as const;

test.describe("Routes fermées aux familles (PARENT, STUDENT)", () => {
  test.describe.configure({ mode: "serial" });

  for (const role of FAMILY_ROLES) {
    test.describe(`${role} ne peut pas ouvrir les consoles du personnel`, () => {
      for (const route of BLOCKED_ROUTES) {
        test(`${role} bloqué sur ${route}`, async ({ page }) => {
          await loginAs(page, role);
          await page.goto(route);
          // La route demandée ne doit pas être l'URL finale :
          // l'utilisateur est redirigé vers /acces-bloque ou son accueil.
          await expect(page).not.toHaveURL(new RegExp(`${route}$`));
        });
      }
    });
  }
});
