import { test, expect } from "./fixtures-roles";
import { loginAs } from "./fixtures-roles";

/**
 * Workflow Admissions — candidatures et nouvelles inscriptions
 * ============================================================
 * Vérifie que la page /admissions s'affiche correctement pour les
 * rôles autorisés (TENANT_ADMIN, ACCOUNTANT) et que les enseignants
 * (TEACHER) n'y ont pas accès.
 *
 * Prérequis :
 *   1. Les comptes QA LEARNOS (`scripts/qa-comptes-demo.ts`) ont été créés.
 *   2. Le serveur dev tourne sur le port configuré (3001 par défaut).
 */

test.describe("Workflow Admissions", () => {
  test.describe.configure({ mode: "serial" });
  // Le dev server Next.js compile les routes à la demande (cold compile).
  // Un timeout de 60s laisse le temps de compiler sans flakiness.
  test.setTimeout(60000);

  // ─────────────────────────────────────────────
  // TENANT_ADMIN — accès complet
  // ─────────────────────────────────────────────
  test.describe("TENANT_ADMIN", () => {
    test("accède à /admissions et voit la page", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/admissions", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admissions/);

      // Le titre de la page doit être visible (Header component).
      await expect(page.locator("text=Admissions").first()).toBeVisible({ timeout: 15000 });

      // Le bouton "Nouvelle candidature" doit être présent.
      await expect(
        page.locator("text=Nouvelle candidature").first()
      ).toBeVisible({ timeout: 15000 });
    });

    test("voit le banner \"Tous les sites\" si applicable", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/admissions", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admissions/);

      // Le banner d'avertissement "Tous les sites sélectionné" n'apparaît
      // que si l'admin a "Tous les sites" sélectionné (allSitesSelected).
      // On vérifie sa présence de manière non bloquante : s'il est visible,
      // on valide son contenu ; s'il ne l'est pas, la page reste fonctionnelle.
      const banner = page.locator("text=Tous les sites sélectionné").first();
      const isVisible = await banner.isVisible({ timeout: 5000 }).catch(() => false);
      if (isVisible) {
        // Le sous-texte d'instruction doit aussi être présent.
        await expect(
          page.locator("text=sélectionner un site spécifique").first()
        ).toBeVisible({ timeout: 10000 });
      }
    });

    test("voit le pipeline des candidatures (statuts)", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/admissions", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admissions/);

      // Le pipeline visuel affiche les statuts : Soumise, En examen, Admis, Inscrit.
      // On vérifie qu'au moins un des libellés de statut est présent.
      const pipeline = page.locator("text=/Soumise|En examen|Admis|Inscrit/").first();
      await expect(pipeline).toBeVisible({ timeout: 15000 });
    });
  });

  // ─────────────────────────────────────────────
  // ACCOUNTANT — accès en lecture/écriture
  // ─────────────────────────────────────────────
  test.describe("ACCOUNTANT", () => {
    test("accède à /admissions et voit la page", async ({ page }) => {
      await loginAs(page, "ACCOUNTANT");
      await page.goto("/admissions", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admissions/);

      // Le titre doit être visible.
      await expect(page.locator("text=Admissions").first()).toBeVisible({ timeout: 15000 });
    });
  });

  // ─────────────────────────────────────────────
  // TEACHER — accès refusé
  // ─────────────────────────────────────────────
  test.describe("TEACHER", () => {
    test("bloqué sur /admissions (redirigé)", async ({ page }) => {
      await loginAs(page, "TEACHER");
      // Le middleware redirige avant le chargement complet → ERR_ABORTED possible.
      await page.goto("/admissions", { waitUntil: "domcontentloaded" }).catch(() => {});
      // L'URL finale ne doit pas être /admissions.
      await expect(page).not.toHaveURL(/\/admissions/);
    });
  });
});
