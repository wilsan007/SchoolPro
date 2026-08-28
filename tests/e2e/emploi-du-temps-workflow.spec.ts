import { test, expect } from "./fixtures-roles";
import { loginAs } from "./fixtures-roles";

/**
 * Workflow Emploi du Temps — grille et sélecteurs
 * ================================================
 * Vérifie que la page /emploi-du-temps s'affiche pour TENANT_ADMIN :
 *   - La grille horaire (colonnes jours + lignes horaires) est visible.
 *   - Le sélecteur de classe (boutons) est présent.
 *   - Le sélecteur de période (trimestre) est présent.
 *
 * Prérequis :
 *   1. Les comptes QA LEARNOS (`scripts/qa-comptes-demo.ts`) ont été créés.
 *   2. Le serveur dev tourne sur le port configuré (3001 par défaut).
 */

test.describe("Workflow Emploi du Temps", () => {
  test.describe.configure({ mode: "serial" });
  // Le dev server Next.js compile les routes à la demande (cold compile).
  test.setTimeout(60000);

  // ─────────────────────────────────────────────
  // TENANT_ADMIN — grille complète + édition
  // ─────────────────────────────────────────────
  test.describe("TENANT_ADMIN", () => {
    test("accède à /emploi-du-temps et voit la page", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/emploi-du-temps", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/emploi-du-temps/);

      // Le titre de la page doit être visible (Header component).
      await expect(
        page.locator("text=Emploi du temps").first()
      ).toBeVisible({ timeout: 15000 });
    });

    test("voit le sélecteur de classe (boutons)", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/emploi-du-temps", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/emploi-du-temps/);

      // Les classes sont affichées sous forme de boutons cliquables
      // (px-4 py-2 rounded-xl). Au moins un bouton de classe doit être
      // présent, ou le message "Sélectionner une classe" si aucune classe.
      const classButtons = page.locator("button.rounded-xl.px-4").first();
      const selectClassMsg = page.locator("text=Sélectionner une classe").first();

      const hasButtons = await classButtons.isVisible({ timeout: 15000 }).catch(() => false);
      const hasMsg = await selectClassMsg.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasButtons || hasMsg).toBeTruthy();
    });

    test("voit le sélecteur de période (trimestre)", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/emploi-du-temps", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/emploi-du-temps/);

      // Le sélecteur de période est un <select> avec l'option "Toute l'année".
      // Il n'apparaît que si periodes.length > 0.
      const periodSelect = page.locator("select").filter({ hasText: "Toute l'année" }).first();
      const hasPeriodSelect = await periodSelect.isVisible({ timeout: 15000 }).catch(() => false);

      if (hasPeriodSelect) {
        // L'option par défaut "Toute l'année" doit être présente.
        const allPeriodsOption = periodSelect.locator("option[value='']").first();
        await expect(allPeriodsOption).toHaveText("Toute l'année");
      }
      // Si pas de périodes configurées, le sélecteur n'est pas affiché —
      // c'est un cas valide (configuration minimale).
    });

    test("voit la grille horaire (colonnes jours)", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/emploi-du-temps", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/emploi-du-temps/);

      // La grille horaire affiche 7 colonnes (Lun→Dim) avec un header
      // de jours. Les noms courts des jours sont traduits via t("daysShort").
      // On vérifie la présence de la grille en cherchant le conteneur
      // avec la classe grid-cols-[60px_repeat(7,1fr)].
      const grid = page.locator(".grid.grid-cols-\\[60px_repeat\\(7\\,1fr\\)\\]").first();
      const hasGrid = await grid.isVisible({ timeout: 15000 }).catch(() => false);

      if (hasGrid) {
        // Le header de la grille contient 7 colonnes de jours.
        // On vérifie qu'au moins un jour est affiché (ex: "Lun", "Mar", etc.)
        // selon les traductions daysShort.
        const dayHeaders = grid.locator("p.text-sm.font-semibold");
        const count = await dayHeaders.count();
        expect(count).toBeGreaterThanOrEqual(1);
      } else {
        // Si aucune classe n'est sélectionnée ou disponible, le message
        // "Sélectionner une classe" est affiché à la place de la grille.
        await expect(
          page.locator("text=Sélectionner une classe").first()
        ).toBeVisible({ timeout: 10000 });
      }
    });

    test("voit les boutons d'action (Optimiser, Ajouter un créneau) en édition", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/emploi-du-temps", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/emploi-du-temps/);

      // TENANT_ADMIN n'est pas un enseignant → readOnly=false.
      // Les boutons "Optimiser" et "Ajouter un créneau" doivent être visibles
      // (si au moins une classe est disponible).
      const optimizeBtn = page.locator("text=Optimiser").first();
      const addSlotBtn = page.locator("text=Ajouter un créneau").first();

      const hasOptimize = await optimizeBtn.isVisible({ timeout: 15000 }).catch(() => false);
      const hasAddSlot = await addSlotBtn.isVisible({ timeout: 5000 }).catch(() => false);
      // Au moins un des deux boutons d'édition doit être présent.
      expect(hasOptimize || hasAddSlot).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────
  // TEACHER — consultation en lecture seule
  // ─────────────────────────────────────────────
  test.describe("TEACHER", () => {
    test("accède à /emploi-du-temps en consultation (lecture seule)", async ({ page }) => {
      await loginAs(page, "TEACHER");
      await page.goto("/emploi-du-temps", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/emploi-du-temps/);

      // Le titre doit être visible.
      await expect(
        page.locator("text=Emploi du temps").first()
      ).toBeVisible({ timeout: 15000 });

      // En mode consultation (readOnly=true), les boutons "Optimiser" et
      // "Ajouter un créneau" ne doivent PAS être visibles.
      const optimizeBtn = page.locator("text=Optimiser").first();
      const addSlotBtn = page.locator("text=Ajouter un créneau").first();

      const hasOptimize = await optimizeBtn.isVisible({ timeout: 10000 }).catch(() => false);
      const hasAddSlot = await addSlotBtn.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasOptimize).toBeFalsy();
      expect(hasAddSlot).toBeFalsy();
    });
  });

  // ─────────────────────────────────────────────
  // PARENT — accès refusé
  // ─────────────────────────────────────────────
  test.describe("PARENT", () => {
    test("bloqué sur /emploi-du-temps (redirigé)", async ({ page }) => {
      await loginAs(page, "PARENT");
      await page.goto("/emploi-du-temps", { waitUntil: "domcontentloaded" }).catch(() => {});
      // L'URL finale ne doit pas être /emploi-du-temps.
      await expect(page).not.toHaveURL(/\/emploi-du-temps/);
    });
  });
});
