import { test, expect } from "./fixtures-roles";
import { loginAs } from "./fixtures-roles";

/**
 * Workflow Réinscription — campagne et portail parent
 * ====================================================
 * Vérifie que la page /parametres/reinscription s'affiche pour
 * TENANT_ADMIN (wizard de campagne) et que /parent/reinscription
 * s'affiche pour PARENT (portail de réponse).
 *
 * Prérequis :
 *   1. Les comptes QA LEARNOS (`scripts/qa-comptes-demo.ts`) ont été créés.
 *   2. Le serveur dev tourne sur le port configuré (3001 par défaut).
 */

test.describe("Workflow Réinscription", () => {
  test.describe.configure({ mode: "serial" });
  // Le dev server Next.js compile les routes à la demande (cold compile).
  test.setTimeout(60000);

  // ─────────────────────────────────────────────
  // TENANT_ADMIN — wizard de campagne
  // ─────────────────────────────────────────────
  test.describe("TENANT_ADMIN", () => {
    test("accède à /parametres/reinscription et voit le wizard", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/parametres/reinscription", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/parametres\/reinscription/);

      // Le titre de la page doit être visible (Header component).
      await expect(
        page.locator("text=Campagne de réinscription").first()
      ).toBeVisible({ timeout: 15000 });

      // Le wizard affiche soit le formulaire de création ("Nouvelle campagne"),
      // soit le stepper visuel d'une campagne active (6 étapes avec progression).
      // On vérifie qu'au moins un des deux éléments est présent.
      const newCampaign = page.locator("text=Nouvelle campagne").first();
      const progression = page.locator("text=Progression").first();
      const hasWizard = await Promise.all([
        newCampaign.isVisible({ timeout: 10000 }).catch(() => false),
        progression.isVisible({ timeout: 10000 }).catch(() => false),
      ]);
      expect(hasWizard.some(Boolean)).toBeTruthy();
    });

    test("voit le stepper 6 étapes si une campagne est active", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");
      await page.goto("/parametres/reinscription", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/parametres\/reinscription/);

      // Si une campagne active existe, le stepper visuel affiche 6 étapes
      // (Préparation, Clôture, Promotion, Invitations, Frais, Activation).
      // Chaque étape est un bouton circulaire (w-10 h-10 rounded-full).
      // On vérifie de manière non bloquante : s'il n'y a pas de campagne
      // active, le formulaire "Nouvelle campagne" est affiché à la place.
      const stepperButtons = page.locator("button .h-5.w-5, button svg.h-5.w-5").first();
      const hasStepper = await stepperButtons.isVisible({ timeout: 10000 }).catch(() => false);

      if (hasStepper) {
        // La barre de progression doit être présente.
        await expect(
          page.locator("text=Progression").first()
        ).toBeVisible({ timeout: 10000 });
      } else {
        // Pas de campagne active → formulaire de création visible.
        await expect(
          page.locator("text=Nouvelle campagne").first()
        ).toBeVisible({ timeout: 10000 });
      }
    });
  });

  // ─────────────────────────────────────────────
  // PARENT — portail de réinscription
  // ─────────────────────────────────────────────
  test.describe("PARENT", () => {
    test("accède à /parent/reinscription et voit la page", async ({ page }) => {
      await loginAs(page, "PARENT");
      // La route /parent/reinscription utilise useSearchParams (Suspense).
      // Sans paramètre ?id=..., la page affiche "invitation introuvable".
      await page.goto("/parent/reinscription", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/parent\/reinscription/);

      // La page doit se charger sans erreur. Sans invitation (?id=...),
      // elle affiche un message d'absence d'invitation ou un loader.
      // On attend que le contenu soit rendu (soit le message, soit le formulaire).
      const invitationNotFound = page.locator("text=invitation").first();
      const loader = page.locator(".animate-spin").first();
      const card = page.locator("[class*='card'], [class*='Card']").first();

      // Au moins un de ces éléments doit être visible.
      const hasContent = await Promise.all([
        invitationNotFound.isVisible({ timeout: 15000 }).catch(() => false),
        loader.isVisible({ timeout: 5000 }).catch(() => false),
        card.isVisible({ timeout: 5000 }).catch(() => false),
      ]);
      expect(hasContent.some(Boolean)).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────
  // TEACHER — accès refusé au paramétrage
  // ─────────────────────────────────────────────
  test.describe("TEACHER", () => {
    test("bloqué sur /parametres/reinscription (redirigé)", async ({ page }) => {
      await loginAs(page, "TEACHER");
      // Le middleware/guard redirige avant le chargement complet.
      await page.goto("/parametres/reinscription", { waitUntil: "domcontentloaded" }).catch(() => {});
      // L'URL finale ne doit pas être /parametres/reinscription.
      await expect(page).not.toHaveURL(/\/parametres\/reinscription/);
    });
  });
});
