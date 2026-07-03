import { test, expect } from "./fixtures";

test.describe("Authentification", () => {
  test("login avec identifiants valides", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@lycee-djibouti.ecolpro.app");
    await page.fill('input[type="password"]', "Demo@2026!");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("text=Tableau de bord").first()).toBeVisible({ timeout: 10000 });
  });

  test("login avec identifiants invalides", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "wrong@test.com");
    await page.fill('input[type="password"]', "wrongpass");
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/\/dashboard/);
  });

  test("redirection sans connexion", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
