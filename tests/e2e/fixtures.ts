import { test as base, expect, type Page } from "@playwright/test";

// Shared auth fixture — logs in once per test file and reuses the session.
//
// Utilise le compte admin@qa-learnos.test créé par scripts/qa-comptes-demo.ts
// sur le tenant demo-learnos. Le mot de passe est Demo@2026! (E2E_PASSWORD).
const E2E_EMAIL = process.env.E2E_EMAIL ?? "admin@qa-learnos.test";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Demo@2026!";

// Motif d'URL acceptable après login : toutes les routes d'accueil possibles.
const POST_LOGIN_URL = /\/(dashboard|direction|mon-espace|ma-classe|parent|eleve|vie-scolaire|secretariat|conseiller|infirmerie|comptabilite|ma-matiere|exploitation|inspection|select-tenant|super-admin|acces-bloque)/;

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', E2E_EMAIL);
  await page.fill('input[type="password"]', E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(POST_LOGIN_URL, { timeout: 20000 });
}

export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await login(page);
    await use(page);
  },
});

export { expect };
