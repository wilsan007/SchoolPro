import { test, expect, contenu } from "./fixtures";

/**
 * Les assertions portent sur `contenu(page)` et non sur `page` : le tableau de
 * bord rend ses écrans dans l'iframe du workspace, où les locators de la page
 * ne vont pas. Posés sur la page, ils ne trouvaient plus rien et ces tests
 * échouaient alors que l'écran fonctionnait.
 */
test.describe("Absences — Appel numérique", () => {
  test("accéder à la page d'appel", async ({ authedPage: page }) => {
    await page.goto("/absences/appel");
    const vue = await contenu(page);
    await expect(vue.locator("text=Classes").first()).toBeVisible({ timeout: 30000 });
    await expect(vue.locator("text=Créneau").first()).toBeVisible();
  });

  test("sélectionner une classe affiche les élèves", async ({ authedPage: page }) => {
    await page.goto("/absences/appel");
    const vue = await contenu(page);
    await vue.locator("text=Classes").first().waitFor({ timeout: 30000 });
    // Première classe de la liste : son bouton se termine par son effectif.
    await vue.locator("button", { hasText: /[0-9]+$/ }).first().click();
    await expect(vue.locator("text=Tous présents")).toBeVisible({ timeout: 30000 });
    await expect(vue.locator("text=Valider l'appel")).toBeVisible();
  });

  test("appel par créneau : les créneaux du jour sont proposés", async ({ authedPage: page }) => {
    await page.goto("/absences/appel");
    const vue = await contenu(page);
    await vue.locator("text=Créneau").first().waitFor({ timeout: 30000 });
    await expect(vue.locator("text=Journée entière")).toBeVisible();
    await expect(vue.locator("text=Jour de l'appel")).toBeVisible();
  });

  test("marquer tous présents", async ({ authedPage: page }) => {
    await page.goto("/absences/appel");
    const vue = await contenu(page);
    await vue.locator("text=Classes").first().waitFor({ timeout: 30000 });
    await vue.locator("button", { hasText: /[0-9]+$/ }).first().click();
    await vue.locator("text=Tous présents").waitFor({ timeout: 30000 });
    await vue.locator("text=Tous présents").click();
    await expect(vue.locator("text=Valider l'appel")).toBeEnabled();
  });

  test("page liste des absences", async ({ authedPage: page }) => {
    await page.goto("/absences");
    const vue = await contenu(page);
    // Le lien vers l'appel est propre à cet écran — « Absences » apparaît aussi
    // dans la coquille, hors de la frame. Délai large : en développement, la
    // première visite compile la page avant de la rendre.
    await expect(vue.locator("text=Faire l'appel").first()).toBeVisible({ timeout: 90000 });
  });
});
