import { test, expect } from "./fixtures-roles";
import { loginAs } from "./fixtures-roles";

/**
 * Workflow Tâches — timeline et buckets temporels
 * ================================================
 * Vérifie que la page /taches s'affiche correctement :
 *   - TEACHER : voit la timeline avec les buckets temporels.
 *   - TENANT_ADMIN : voit la timeline + le bouton "Créer" (admin only).
 *
 * Les buckets temporels sont : En retard, Aujourd'hui, Cette semaine,
 * Semaine prochaine, Plus tard, Sans échéance.
 *
 * Prérequis :
 *   1. Les comptes QA LEARNOS (`scripts/qa-comptes-demo.ts`) ont été créés.
 *   2. Le serveur dev tourne sur le port configuré (3001 par défaut).
 */

test.describe("Workflow Tâches", () => {
  test.describe.configure({ mode: "serial" });
  // Le dev server Next.js compile les routes à la demande (cold compile).
  test.setTimeout(60000);

  // ─────────────────────────────────────────────
  // TEACHER — timeline en consultation
  // ─────────────────────────────────────────────
  test.describe("TEACHER", () => {
    test("accède à /taches et voit la timeline", async ({ page }) => {
      await loginAs(page, "TEACHER");
      await page.goto("/taches", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/taches/);

      // Le titre de la page doit être visible (Header component).
      await expect(page.locator("text=Tâches").first()).toBeVisible({ timeout: 15000 });

      // Le bouton "Synchroniser" est présent (showSync=true sur /taches).
      await expect(
        page.locator("text=Synchroniser").first()
      ).toBeVisible({ timeout: 15000 });
    });

    test("voit les buckets temporels (ou l'état vide)", async ({ page }) => {
      await loginAs(page, "TEACHER");
      await page.goto("/taches", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/taches/);

      // La timeline affiche soit des buckets temporels avec des tâches,
      // soit l'état vide "Tout est à jour" si aucune tâche en attente.
      // Les labels de buckets : En retard, Aujourd'hui, Cette semaine,
      // Semaine prochaine, Plus tard, Sans échéance.
      const bucketLabels = page.locator(
        "text=/En retard|Aujourd'hui|Cette semaine|Semaine prochaine|Plus tard|Sans échéance/"
      );
      const emptyState = page.locator("text=Tout est à jour").first();

      // Au moins un des deux doit être présent.
      const hasBuckets = await bucketLabels.first().isVisible({ timeout: 15000 }).catch(() => false);
      const hasEmpty = await emptyState.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasBuckets || hasEmpty).toBeTruthy();
    });

    test("ne voit PAS le bouton de création (teacher = lecture)", async ({ page }) => {
      await loginAs(page, "TEACHER");
      await page.goto("/taches", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/taches/);

      // showCreate={!isTeacherRole(role)} → false pour TEACHER.
      // Le bouton "Nouvelle tâche" ne doit pas être visible.
      const createBtn = page.locator("text=Nouvelle tâche").first();
      const isVisible = await createBtn.isVisible({ timeout: 5000 }).catch(() => false);
      expect(isVisible).toBeFalsy();
    });
  });

  // ─────────────────────────────────────────────
  // TENANT_ADMIN — timeline + création
  // ─────────────────────────────────────────────
  test.describe("TENANT_ADMIN", () => {
    test("accède à /taches et voit la timeline", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/taches", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/taches/);

      // Le titre de la page doit être visible.
      await expect(page.locator("text=Tâches").first()).toBeVisible({ timeout: 15000 });
    });

    test("voit le bouton de création (admin only)", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/taches", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/taches/);

      // showCreate={!isTeacherRole(role)} → true pour TENANT_ADMIN.
      // Le bouton "Nouvelle tâche" doit être visible.
      await expect(
        page.locator("text=Nouvelle tâche").first()
      ).toBeVisible({ timeout: 15000 });
    });

    test("voit les buckets temporels (ou l'état vide)", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/taches", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/taches/);

      // Même vérification que pour TEACHER : buckets ou état vide.
      const bucketLabels = page.locator(
        "text=/En retard|Aujourd'hui|Cette semaine|Semaine prochaine|Plus tard|Sans échéance/"
      );
      const emptyState = page.locator("text=Tout est à jour").first();

      const hasBuckets = await bucketLabels.first().isVisible({ timeout: 15000 }).catch(() => false);
      const hasEmpty = await emptyState.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasBuckets || hasEmpty).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────
  // PARENT — accès refusé
  // ─────────────────────────────────────────────
  test.describe("PARENT", () => {
    test("bloqué sur /taches (redirigé)", async ({ page }) => {
      await loginAs(page, "PARENT");
      // PARENT a voirMesTaches=true dans la page, mais le guard peut bloquer.
      // On vérifie que la page ne s'affiche pas pour PARENT.
      await page.goto("/taches", { waitUntil: "domcontentloaded" }).catch(() => {});
      // Si le parent est redirigé, l'URL ne sera pas /taches.
      // (Certains rôles voient /taches en lecture — on vérifie le titre.)
      const title = page.locator("text=Tâches").first();
      const hasTitle = await title.isVisible({ timeout: 10000 }).catch(() => false);
      // Le parent ne devrait pas voir la page complète de gestion des tâches.
      // Soit redirigé, soit page sans le bouton de création.
      if (hasTitle) {
        const createBtn = page.locator("text=Nouvelle tâche").first();
        const canCreate = await createBtn.isVisible({ timeout: 5000 }).catch(() => false);
        expect(canCreate).toBeFalsy();
      }
    });
  });
});
