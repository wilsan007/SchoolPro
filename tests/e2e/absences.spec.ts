import { test, expect } from "./fixtures";

test.describe("Absences — Appel numérique", () => {
  test("accéder à la page d'appel", async ({ authedPage: page }) => {
    await page.goto("/absences/appel");
    await expect(page.locator("text=Faire l'appel").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Classes").first()).toBeVisible();
  });

  test("sélectionner une classe affiche les élèves", async ({ authedPage: page }) => {
    await page.goto("/absences/appel");
    await page.waitForSelector("button", { timeout: 10000 });
    // Cliquer sur la première classe
    const firstClass = page.locator("button", { hasText: /[0-9]+$/ }).first();
    await firstClass.click();
    // Vérifier que des élèves s'affichent
    await expect(page.locator("text=Présent").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Tous présents")).toBeVisible();
    await expect(page.locator("text=Valider l'appel")).toBeVisible();
  });

  test("marquer tous présents", async ({ authedPage: page }) => {
    await page.goto("/absences/appel");
    await page.waitForSelector("button", { timeout: 10000 });
    const firstClass = page.locator("button", { hasText: /[0-9]+$/ }).first();
    await firstClass.click();
    await page.waitForSelector("text=Tous présents", { timeout: 10000 });
    await page.click("text=Tous présents");
    // Le bouton valider doit être activé
    await expect(page.locator("text=Valider l'appel")).toBeEnabled();
  });

  test("page liste des absences", async ({ authedPage: page }) => {
    await page.goto("/absences");
    await expect(page.locator("text=Absences").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Faire l'appel")).toBeVisible();
  });
});
