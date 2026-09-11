import { test, expect } from "./fixtures-roles";
import { loginAs } from "./fixtures-roles";

/**
 * EcolPro — ISO-5 : Matrice d'isolation cross-tenant (E2E)
 * ============================================================
 *
 * Vérifie que les routes API refusent l'accès aux données d'un autre
 * tenant. Un utilisateur authentifié sur le tenant A ne doit pas
 * pouvoir accéder aux ressources du tenant B via manipulation d'URL
 * ou d'identifiants (IDOR — Insecure Direct Object Reference).
 *
 * PRINCIPE : on tente d'accéder à des routes API avec des IDs qui
 * n'existent pas dans le tenant courant. La réponse attendue est :
 *   - 404 (ressource introuvable dans ce tenant)
 *   - 403 (accès interdit)
 *   - Jamais 200 avec des données d'un autre tenant
 *
 * Prérequis :
 *   1. Le seed E2E a été appliqué (comptes QA LEARNOS).
 *   2. Le serveur dev tourne sur le port configuré.
 */

const ORIGIN =
  process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3001";

test.describe("ISO-5 — Isolation cross-tenant (E2E)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120000);

  // ─────────────────────────────────────────────
  // TEACHER — accès aux données pédagogiques
  // ─────────────────────────────────────────────
  test.describe("TEACHER — isolation pédagogique", () => {
    test("un ID d'élève inexistant retourne 404, pas 200", async ({ page }) => {
      await loginAs(page, "TEACHER");

      const res = await page.request.get(
        `${ORIGIN}/api/eleves/00000000-0000-0000-0000-000000000000`,
        { failOnStatusCode: false }
      );

      // 404 = l'élève n'existe pas dans ce tenant (correct)
      // 403 = l'utilisateur n'a pas le droit (acceptable)
      // 200 = FUITE : l'élève existe mais appartient à un autre tenant
      expect([404, 403]).toContain(res.status());
      expect(res.status()).not.toBe(200);
    });

    test("un ID de note inexistant retourne 404 ou 403", async ({ page }) => {
      await loginAs(page, "TEACHER");

      const res = await page.request.get(
        `${ORIGIN}/api/notes/00000000-0000-0000-0000-000000000000`,
        { failOnStatusCode: false }
      );

      // 404 = la note n'existe pas dans ce tenant (correct)
      // 403 = l'utilisateur n'a pas le droit (acceptable)
      // 405 = la route n'a pas de handler GET (acceptable — pas de fuite)
      // 200 = FUITE : la note existe mais appartient à un autre tenant
      expect([404, 403, 405]).toContain(res.status());
      expect(res.status()).not.toBe(200);
    });

    test("un ID d'évaluation inexistant retourne 404", async ({ page }) => {
      await loginAs(page, "TEACHER");

      const res = await page.request.get(
        `${ORIGIN}/api/evaluations/00000000-0000-0000-0000-000000000000`,
        { failOnStatusCode: false }
      );

      expect([404, 403]).toContain(res.status());
      expect(res.status()).not.toBe(200);
    });
  });

  // ─────────────────────────────────────────────
  // ACCOUNTANT — accès aux données financières
  // ─────────────────────────────────────────────
  test.describe("ACCOUNTANT — isolation financière", () => {
    test("un ID de facture inexistant retourne 404", async ({ page }) => {
      await loginAs(page, "ACCOUNTANT");

      const res = await page.request.get(
        `${ORIGIN}/api/factures/00000000-0000-0000-0000-000000000000`,
        { failOnStatusCode: false }
      );

      expect([404, 403]).toContain(res.status());
      expect(res.status()).not.toBe(200);
    });

    test("un ID de paiement inexistant retourne 404", async ({ page }) => {
      await loginAs(page, "ACCOUNTANT");

      const res = await page.request.get(
        `${ORIGIN}/api/paiements/00000000-0000-0000-0000-000000000000`,
        { failOnStatusCode: false }
      );

      expect([404, 403]).toContain(res.status());
      expect(res.status()).not.toBe(200);
    });

    test("un ID de dépense inexistant retourne 404", async ({ page }) => {
      await loginAs(page, "ACCOUNTANT");

      const res = await page.request.get(
        `${ORIGIN}/api/depenses/00000000-0000-0000-0000-000000000000`,
        { failOnStatusCode: false }
      );

      expect([404, 403]).toContain(res.status());
      expect(res.status()).not.toBe(200);
    });
  });

  // ─────────────────────────────────────────────
  // TENANT_ADMIN — accès aux données administratives
  // ─────────────────────────────────────────────
  test.describe("TENANT_ADMIN — isolation administrative", () => {
    test("un ID de site inexistant retourne 404", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");

      const res = await page.request.get(
        `${ORIGIN}/api/sites/00000000-0000-0000-0000-000000000000`,
        { failOnStatusCode: false }
      );

      expect([404, 403]).toContain(res.status());
      expect(res.status()).not.toBe(200);
    });

    test("un ID de classe inexistant retourne 404", async ({ page }) => {
      await loginAs(page, "TENANT_ADMIN");

      const res = await page.request.get(
        `${ORIGIN}/api/classes/00000000-0000-0000-0000-000000000000`,
        { failOnStatusCode: false }
      );

      expect([404, 403]).toContain(res.status());
      expect(res.status()).not.toBe(200);
    });
  });

  // ─────────────────────────────────────────────
  // PARENT — isolation familiale
  // ─────────────────────────────────────────────
  test.describe("PARENT — isolation familiale", () => {
    test("un ID d'élève inexistant retourne 404", async ({ page }) => {
      await loginAs(page, "PARENT");

      const res = await page.request.get(
        `${ORIGIN}/api/eleves/00000000-0000-0000-0000-000000000000`,
        { failOnStatusCode: false }
      );

      expect([404, 403]).toContain(res.status());
      expect(res.status()).not.toBe(200);
    });

    test("un ID de bulletin inexistant retourne 404", async ({ page }) => {
      await loginAs(page, "PARENT");

      const res = await page.request.get(
        `${ORIGIN}/api/bulletins/00000000-0000-0000-0000-000000000000`,
        { failOnStatusCode: false }
      );

      expect([404, 403]).toContain(res.status());
      expect(res.status()).not.toBe(200);
    });
  });

  // ─────────────────────────────────────────────
  // SUPERVISOR — isolation vie scolaire
  // ─────────────────────────────────────────────
  test.describe("SUPERVISOR — isolation vie scolaire", () => {
    test("un ID d'absence inexistant retourne 404", async ({ page }) => {
      await loginAs(page, "SUPERVISOR");

      const res = await page.request.get(
        `${ORIGIN}/api/absences/00000000-0000-0000-0000-000000000000`,
        { failOnStatusCode: false }
      );

      expect([404, 403]).toContain(res.status());
      expect(res.status()).not.toBe(200);
    });

    test("un ID d'incident inexistant retourne 404", async ({ page }) => {
      await loginAs(page, "SUPERVISOR");

      const res = await page.request.get(
        `${ORIGIN}/api/vie-scolaire/incidents/00000000-0000-0000-0000-000000000000`,
        { failOnStatusCode: false }
      );

      expect([404, 403]).toContain(res.status());
      expect(res.status()).not.toBe(200);
    });
  });

  // ─────────────────────────────────────────────
  // SECRETARY — isolation secrétariat
  // ─────────────────────────────────────────────
  test.describe("SECRETARY — isolation secrétariat", () => {
    test("un ID d'inscription inexistant retourne 404", async ({ page }) => {
      await loginAs(page, "SECRETARY");

      const res = await page.request.get(
        `${ORIGIN}/api/inscriptions/00000000-0000-0000-0000-000000000000`,
        { failOnStatusCode: false }
      );

      expect([404, 403]).toContain(res.status());
      expect(res.status()).not.toBe(200);
    });

    test("un ID d'admission inexistant retourne 404", async ({ page }) => {
      await loginAs(page, "SECRETARY");

      const res = await page.request.get(
        `${ORIGIN}/api/admissions/00000000-0000-0000-0000-000000000000`,
        { failOnStatusCode: false }
      );

      expect([404, 403]).toContain(res.status());
      expect(res.status()).not.toBe(200);
    });
  });

  // ─────────────────────────────────────────────
  // Routes sans authentification
  // ─────────────────────────────────────────────
  test.describe("Routes API sans authentification", () => {
    test("GET /api/eleves sans session retourne 401", async ({ page }) => {
      await page.context().clearCookies();

      const res = await page.request.get(`${ORIGIN}/api/eleves`, {
        failOnStatusCode: false,
      });

      expect(res.status()).toBe(401);
    });

    test("GET /api/factures sans session retourne 401", async ({ page }) => {
      await page.context().clearCookies();

      const res = await page.request.get(`${ORIGIN}/api/factures`, {
        failOnStatusCode: false,
      });

      expect(res.status()).toBe(401);
    });

    test("GET /api/bulletins sans session retourne 401", async ({ page }) => {
      await page.context().clearCookies();

      const res = await page.request.get(`${ORIGIN}/api/bulletins`, {
        failOnStatusCode: false,
      });

      expect(res.status()).toBe(401);
    });
  });
});
