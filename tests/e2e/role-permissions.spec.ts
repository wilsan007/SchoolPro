import { test, expect } from "./fixtures-roles";
import { loginAs } from "./fixtures-roles";

/**
 * Permissions par rôle — routes autorisées et bloquées
 * ============================================================
 * Vérifie que le middleware (`src/middleware.ts`) et `guardPage`
 * appliquent correctement `ROUTE_RULES` (`src/lib/permissions.ts`).
 *
 * Quand une route est bloquée pour un rôle, l'utilisateur est
 * redirigé vers `/acces-bloque` (ou sa route d'accueil). On vérifie
 * donc que l'URL finale n'est **pas** la route demandée.
 *
 * Prérequis :
 *   1. Le seed E2E a été appliqué.
 *   2. Le serveur dev tourne sur le port configuré.
 */

test.describe("Permissions par rôle — routes critiques", () => {
  test.describe.configure({ mode: "serial" });

  // ─────────────────────────────────────────────
  // PARENT
  // ─────────────────────────────────────────────
  test.describe("PARENT", () => {
    test("accède à /parent (autorisé)", async ({ page }) => {
      await loginAs(page, "PARENT");
      await page.goto("/parent");
      await expect(page).toHaveURL(/\/parent/);
    });

    test("bloqué sur /notes (redirigé)", async ({ page }) => {
      await loginAs(page, "PARENT");
      await page.goto("/notes");
      await expect(page).not.toHaveURL(/\/notes$/);
    });
  });

  // ─────────────────────────────────────────────
  // STUDENT
  // ─────────────────────────────────────────────
  test.describe("STUDENT", () => {
    test("accède à /eleve (autorisé)", async ({ page }) => {
      await loginAs(page, "STUDENT");
      await page.goto("/eleve");
      await expect(page).toHaveURL(/\/eleve/);
    });

    test("bloqué sur /absences (redirigé)", async ({ page }) => {
      await loginAs(page, "STUDENT");
      await page.goto("/absences");
      await expect(page).not.toHaveURL(/\/absences/);
    });
  });

  // ─────────────────────────────────────────────
  // NURSE
  // ─────────────────────────────────────────────
  test.describe("NURSE", () => {
    test("accède à /infirmerie (autorisé)", async ({ page }) => {
      await loginAs(page, "NURSE");
      await page.goto("/infirmerie");
      await expect(page).toHaveURL(/\/infirmerie/);
    });

    test("bloqué sur /notes (redirigé)", async ({ page }) => {
      await loginAs(page, "NURSE");
      await page.goto("/notes");
      await expect(page).not.toHaveURL(/\/notes/);
    });
  });

  // ─────────────────────────────────────────────
  // SUPERVISOR
  // ─────────────────────────────────────────────
  test.describe("SUPERVISOR", () => {
    test("accède à /vie-scolaire (autorisé)", async ({ page }) => {
      await loginAs(page, "SUPERVISOR");
      await page.goto("/vie-scolaire");
      await expect(page).toHaveURL(/\/vie-scolaire/);
    });

    test("bloqué sur /direction (redirigé)", async ({ page }) => {
      await loginAs(page, "SUPERVISOR");
      await page.goto("/direction");
      await expect(page).not.toHaveURL(/\/direction/);
    });
  });

  // ─────────────────────────────────────────────
  // SUBJECT_LEAD
  // ─────────────────────────────────────────────
  test.describe("SUBJECT_LEAD", () => {
    test("accède à /ma-matiere (autorisé)", async ({ page }) => {
      await loginAs(page, "SUBJECT_LEAD");
      await page.goto("/ma-matiere");
      await expect(page).toHaveURL(/\/ma-matiere/);
    });
  });

  // ─────────────────────────────────────────────
  // SECRETARY
  // ─────────────────────────────────────────────
  test.describe("SECRETARY", () => {
    test("accède à /secretariat (autorisé)", async ({ page }) => {
      await loginAs(page, "SECRETARY");
      await page.goto("/secretariat");
      await expect(page).toHaveURL(/\/secretariat/);
    });
  });

  // ─────────────────────────────────────────────
  // COUNSELOR
  // ─────────────────────────────────────────────
  test.describe("COUNSELOR", () => {
    test("accède à /conseiller (autorisé)", async ({ page }) => {
      await loginAs(page, "COUNSELOR");
      await page.goto("/conseiller");
      await expect(page).toHaveURL(/\/conseiller/);
    });
  });

  // ─────────────────────────────────────────────
  // ACCOUNTANT
  // ─────────────────────────────────────────────
  test.describe("ACCOUNTANT", () => {
    test("accède à /comptabilite (autorisé)", async ({ page }) => {
      await loginAs(page, "ACCOUNTANT");
      await page.goto("/comptabilite");
      await expect(page).toHaveURL(/\/comptabilite/);
    });
  });

  // ─────────────────────────────────────────────
  // TEACHER
  // ─────────────────────────────────────────────
  test.describe("TEACHER", () => {
    test("accède à /mon-espace (autorisé)", async ({ page }) => {
      await loginAs(page, "TEACHER");
      await page.goto("/mon-espace");
      await expect(page).toHaveURL(/\/mon-espace/);
    });
  });

  // ─────────────────────────────────────────────
  // CLASS_TEACHER
  // ─────────────────────────────────────────────
  test.describe("CLASS_TEACHER", () => {
    test("accède à /ma-classe (autorisé)", async ({ page }) => {
      await loginAs(page, "CLASS_TEACHER");
      await page.goto("/ma-classe");
      await expect(page).toHaveURL(/\/ma-classe/);
    });
  });

  // ─────────────────────────────────────────────
  // TENANT_ADMIN
  // ─────────────────────────────────────────────
  test.describe("TENANT_ADMIN", () => {
    test("accède à /direction (autorisé)", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/direction");
      await expect(page).toHaveURL(/\/direction/);
    });
  });

  // ─────────────────────────────────────────────
  // PRINCIPAL
  // ─────────────────────────────────────────────
  test.describe("PRINCIPAL", () => {
    test("accède à /direction (autorisé)", async ({ page }) => {
      await loginAs(page, "PRINCIPAL");
      await page.goto("/direction");
      await expect(page).toHaveURL(/\/direction/);
    });
  });

  // ─────────────────────────────────────────────
  // SUPER_ADMIN
  // ─────────────────────────────────────────────
  test.describe("SUPER_ADMIN", () => {
    test("accède à /super-admin (autorisé)", async ({ page }) => {
      await loginAs(page, "SUPER_ADMIN");
      await page.goto("/super-admin");
      await expect(page).toHaveURL(/\/super-admin/);
    });
  });
});
