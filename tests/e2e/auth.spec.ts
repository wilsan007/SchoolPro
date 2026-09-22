import { test, expect } from "./fixtures";

test.describe("Authentification", () => {
  test("login avec identifiants valides", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@qa-learnos.test");
    await page.fill('input[type="password"]', "Demo@2026!");
    await page.click('button[type="submit"]');
    // Le compte admin@qa-learnos.test a plusieurs rôles dont TENANT_ADMIN.
    // La redirection peut aller vers /direction, /dashboard, /select-tenant, etc.
    await page.waitForURL(/\/(dashboard|direction|mon-espace|select-tenant|super-admin|acces-bloque)/, { timeout: 20000 });
    await expect(page).not.toHaveURL(/\/login/);
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
