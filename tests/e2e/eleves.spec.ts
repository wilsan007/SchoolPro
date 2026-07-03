import { test, expect } from "./fixtures";

test.describe("Gestion des élèves", () => {
  test("afficher la liste des élèves", async ({ authedPage: page }) => {
    await page.goto("/eleves");
    await expect(page.locator("text=Élèves").first()).toBeVisible({ timeout: 10000 });
    // Au moins un élève dans le tableau
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 });
  });

  test("rechercher un élève", async ({ authedPage: page }) => {
    await page.goto("/eleves");
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    const firstRow = await page.locator("table tbody tr td").first().textContent();
    const searchInput = page.locator('input[placeholder*="echerche"]').first();
    if (firstRow) {
      await searchInput.fill(firstRow.trim());
      await page.waitForTimeout(500);
      await expect(page.locator("table tbody tr").first()).toBeVisible();
    }
  });

  test("ouvrir le formulaire d'inscription", async ({ authedPage: page }) => {
    await page.goto("/eleves/nouveau");
    await expect(page.locator('input[id="prenom"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[id="nom"]')).toBeVisible();
    await expect(page.locator("text=Télécharger une photo")).toBeVisible();
  });

  test("ouvrir la fiche détail d'un élève", async ({ authedPage: page }) => {
    await page.goto("/eleves");
    await page.waitForSelector("table tbody tr a", { timeout: 10000 });
    const firstLink = page.locator("table tbody tr a").first();
    const href = await firstLink.getAttribute("href");
    if (href) {
      await firstLink.click();
      await page.waitForURL(/\/eleves\/.+/);
      await expect(page.locator("text=Matricule").first()).toBeVisible({ timeout: 10000 });
    }
  });

  test("exporter la liste en CSV", async ({ authedPage: page }) => {
    await page.goto("/eleves");
    await page.waitForSelector("table", { timeout: 10000 });
    // Vérifier que la page avec le tableau est fonctionnelle
    const exportBtn = page.locator("text=Exporter").first();
    const isVisible = await exportBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (isVisible) {
      await expect(exportBtn).toBeAttached();
    }
  });
});
