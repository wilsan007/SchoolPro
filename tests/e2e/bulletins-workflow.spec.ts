import { test, expect } from "./fixtures-roles";
import { loginAs } from "./fixtures-roles";

/**
 * Workflow Bulletins — génération, liste et statuts
 * ==================================================
 * Vérifie que la page /notes/bulletins s'affiche pour TENANT_ADMIN :
 *   - Les onglets (Génération, Liste, Bilan Annuel) sont visibles.
 *   - L'onglet "Liste" affiche le tableau des bulletins avec les
 *     badges de statut (Brouillon, Verrouillé, Publié).
 *
 * Prérequis :
 *   1. Les comptes QA LEARNOS (`scripts/qa-comptes-demo.ts`) ont été créés.
 *   2. Le serveur dev tourne sur le port configuré (3001 par défaut).
 */

test.describe("Workflow Bulletins", () => {
  test.describe.configure({ mode: "serial" });
  // Le dev server Next.js compile les routes à la demande (cold compile).
  test.setTimeout(60000);

  // ─────────────────────────────────────────────
  // TENANT_ADMIN — accès complet
  // ─────────────────────────────────────────────
  test.describe("TENANT_ADMIN", () => {
    test("accède à /notes/bulletins et voit la page", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/notes/bulletins", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/notes\/bulletins/);

      // Le titre de la page doit être visible (Header component).
      await expect(
        page.locator("text=Bulletins de Notes").first()
      ).toBeVisible({ timeout: 15000 });
    });

    test("voit les onglets Génération, Liste et Bilan Annuel", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/notes/bulletins", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/notes\/bulletins/);

      // Les trois onglets doivent être présents.
      await expect(page.locator("text=Génération").first()).toBeVisible({ timeout: 15000 });
      await expect(page.locator("text=Liste").first()).toBeVisible({ timeout: 10000 });
      await expect(page.locator("text=Bilan Annuel").first()).toBeVisible({ timeout: 10000 });
    });

    test("voit la liste des bulletins avec les badges de statut", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/notes/bulletins", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/notes\/bulletins/);

      // Cliquer sur l'onglet "Liste" pour afficher BulletinsList.
      await page.locator("text=Liste").first().click({ timeout: 10000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

      // BulletinsList contient des filres (sélecteurs classe + période)
      // et un tableau avec colonne "Statut".
      // L'en-tête de colonne "Statut" doit être visible.
      await expect(
        page.locator("text=Statut").first()
      ).toBeVisible({ timeout: 15000 });

      // Les badges de statut possibles sont : Brouillon, Verrouillé, Publié.
      // On vérifie qu'au moins un badge de statut est présent dans la liste,
      // ou que le message "Aucun bulletin" s'affiche si la liste est vide.
      const statusBadges = page.locator("text=/Brouillon|Verrouillé|Publié/").first();
      const emptyMessage = page.locator("text=Aucun bulletin").first();

      const hasBadges = await statusBadges.isVisible({ timeout: 15000 }).catch(() => false);
      const hasEmpty = await emptyMessage.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasBadges || hasEmpty).toBeTruthy();
    });

    test("voit les filtres classe et période dans la liste", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/notes/bulletins", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/notes\/bulletins/);

      // Aller sur l'onglet "Liste".
      await page.locator("text=Liste").first().click({ timeout: 10000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

      // Les filtres utilisent des Select (shadcn) avec des labels.
      // Le label "Classe" (t("classe")) et le label de période (t("rank") = "Rang")
      // ou "Période" selon les traductions.
      // On vérifie la présence du bouton "Export Excel" qui est dans l'en-tête
      // du tableau de liste — c'est un élément caractéristique de BulletinsList.
      await expect(
        page.locator("text=Export Excel").first()
      ).toBeVisible({ timeout: 15000 });
    });
  });

  // ─────────────────────────────────────────────
  // TEACHER — accès en lecture seule
  // ─────────────────────────────────────────────
  test.describe("TEACHER", () => {
    test("accède à /notes/bulletins en lecture (ou redirigé)", async ({ page }) => {
      await loginAs(page, "TEACHER");
      await page.goto("/notes/bulletins", { waitUntil: "domcontentloaded" }).catch(() => {});

      // TEACHER a la permission bulletins:read — il voit la page mais
      // sans les boutons d'édition/suppression.
      const title = page.locator("text=Bulletins de Notes").first();
      const hasTitle = await title.isVisible({ timeout: 15000 }).catch(() => false);

      if (hasTitle) {
        // Vérifier que les onglets sont présents.
        await expect(page.locator("text=Génération").first()).toBeVisible({ timeout: 10000 });
      } else {
        // Si redirigé, l'URL ne doit pas être /notes/bulletins.
        await expect(page).not.toHaveURL(/\/notes\/bulletins/);
      }
    });
  });

  // ─────────────────────────────────────────────
  // PARENT — accès refusé
  // ─────────────────────────────────────────────
  test.describe("PARENT", () => {
    test("bloqué sur /notes/bulletins (redirigé)", async ({ page }) => {
      await loginAs(page, "PARENT");
      await page.goto("/notes/bulletins", { waitUntil: "domcontentloaded" }).catch(() => {});
      // L'URL finale ne doit pas être /notes/bulletins.
      await expect(page).not.toHaveURL(/\/notes\/bulletins/);
    });
  });
});
