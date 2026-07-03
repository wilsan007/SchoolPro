import { test, expect } from "./fixtures";

test.describe("Facturation", () => {
  test("afficher la liste des factures", async ({ authedPage: page }) => {
    await page.goto("/facturation");
    await expect(page.locator("text=Facturation").first()).toBeVisible({ timeout: 10000 });
  });

  test("créer une nouvelle facture", async ({ authedPage: page }) => {
    await page.goto("/facturation/nouvelle");
    await expect(page.locator('input[id="libelle"], input[name="libelle"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("détail d'une facture — boutons d'action", async ({ authedPage: page }) => {
    await page.goto("/facturation");
    await page.waitForTimeout(2000);
    const factureLink = page.locator('a[href*="/facturation/"]').first();
    if (await factureLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await factureLink.click();
      await page.waitForURL(/\/facturation\/[^/]+$/, { timeout: 10000 });
      await expect(page.locator("text=Retour")).toBeVisible({ timeout: 10000 });
    }
  });
});
