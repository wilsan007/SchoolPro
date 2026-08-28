import { test, expect } from "./fixtures-roles";
import { loginAs } from "./fixtures-roles";

/**
 * Workflow Cahier-Journal — timeline pédagogique
 * ==============================================
 * Vérifie que la page /cahier-journal s'affiche pour TEACHER :
 *   - Le titre et les KPIs sont visibles.
 *   - Le sélecteur de classe (filtre) est présent.
 *   - Le sélecteur de semaine est accessible en vue Calendrier.
 *
 * Prérequis :
 *   1. Les comptes QA LEARNOS (`scripts/qa-comptes-demo.ts`) ont été créés.
 *   2. Le serveur dev tourne sur le port configuré (3001 par défaut).
 */

test.describe("Workflow Cahier-Journal", () => {
  test.describe.configure({ mode: "serial" });
  // Le dev server Next.js compile les routes à la demande (cold compile).
  test.setTimeout(60000);

  // ─────────────────────────────────────────────
  // TEACHER — timeline et sélecteurs
  // ─────────────────────────────────────────────
  test.describe("TEACHER", () => {
    test("accède à /cahier-journal et voit la page", async ({ page }) => {
      await loginAs(page, "TEACHER");
      await page.goto("/cahier-journal", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/cahier-journal/);

      // Le titre de la page doit être visible (Header component, texte hardcodé).
      await expect(page.locator("text=Cahier-Journal").first()).toBeVisible({ timeout: 15000 });

      // Le sous-titre doit être présent.
      await expect(
        page.locator("text=Journal de Progression Pédagogique").first()
      ).toBeVisible({ timeout: 10000 });
    });

    test("voit les KPIs (Total séances, Effectuées, etc.)", async ({ page }) => {
      await loginAs(page, "TEACHER");
      await page.goto("/cahier-journal", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/cahier-journal/);

      // Les KPIs sont des cartes avec des labels hardcodés.
      await expect(
        page.locator("text=Total séances").first()
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.locator("text=Effectuées").first()
      ).toBeVisible({ timeout: 10000 });
      await expect(
        page.locator("text=Taux réalisation").first()
      ).toBeVisible({ timeout: 10000 });
    });

    test("voit le sélecteur de classe (filtre)", async ({ page }) => {
      await loginAs(page, "TEACHER");
      await page.goto("/cahier-journal", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/cahier-journal/);

      // Le filtre de classe est un <select> avec l'option "Toutes les classes".
      const classSelect = page.locator("select").filter({ hasText: "Toutes les classes" }).first();
      await expect(classSelect).toBeVisible({ timeout: 15000 });

      // Vérifier que l'option par défaut est présente.
      const allClassesOption = classSelect.locator("option[value='']").first();
      await expect(allClassesOption).toHaveText("Toutes les classes");
    });

    test("voit le sélecteur de semaine en vue Calendrier", async ({ page }) => {
      await loginAs(page, "TEACHER");
      await page.goto("/cahier-journal", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/cahier-journal/);

      // La vue par défaut est "timeline". On bascule en vue "Calendrier"
      // pour révéler le sélecteur de semaine.
      // Le bouton Calendrier est le 3ème bouton de la barre de vue
      // (Timeline | Liste | Calendrier). Il contient une icône Calendar.
      const calendarBtn = page.locator("button:has(svg.lucide-calendar)").first();
      await expect(calendarBtn).toBeVisible({ timeout: 15000 });
      await calendarBtn.click({ timeout: 10000 });

      // En vue Calendrier, la navigation semaine affiche "S{num}"
      // (ex: S1, S2, ...) et des boutons précédent/suivant.
      // On vérifie la présence du label de semaine (format S + chiffre).
      const weekLabel = page.locator("text=/^S\\d+$/").first();
      await expect(weekLabel).toBeVisible({ timeout: 15000 });
    });

    test("voit les boutons de changement de vue (Timeline, Liste)", async ({ page }) => {
      await loginAs(page, "TEACHER");
      await page.goto("/cahier-journal", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/cahier-journal/);

      // Les boutons de vue sont hardcodés : "Timeline" et "Liste".
      await expect(page.locator("button:has-text('Timeline')").first()).toBeVisible({ timeout: 15000 });
      await expect(page.locator("button:has-text('Liste')").first()).toBeVisible({ timeout: 10000 });
    });
  });

  // ─────────────────────────────────────────────
  // TENANT_ADMIN — accès avec suivi du programme
  // ─────────────────────────────────────────────
  test.describe("TENANT_ADMIN", () => {
    test("accède à /cahier-journal et voit la page", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/cahier-journal", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/cahier-journal/);

      // Le titre doit être visible.
      await expect(page.locator("text=Cahier-Journal").first()).toBeVisible({ timeout: 15000 });

      // TENANT_ADMIN fait partie de ROLES_SUIVI → il voit le tableau
      // "Suivi du programme" en bas de page.
      await expect(
        page.locator("text=Suivi du programme").first()
      ).toBeVisible({ timeout: 15000 });
    });
  });

  // ─────────────────────────────────────────────
  // PARENT — accès refusé (curriculum:read requis)
  // ─────────────────────────────────────────────
  test.describe("PARENT", () => {
    test("bloqué sur /cahier-journal (redirigé)", async ({ page }) => {
      await loginAs(page, "PARENT");
      // La page requiert la permission "curriculum:read" (guardPage).
      await page.goto("/cahier-journal", { waitUntil: "domcontentloaded" }).catch(() => {});
      // L'URL finale ne doit pas être /cahier-journal.
      await expect(page).not.toHaveURL(/\/cahier-journal/);
    });
  });
});
