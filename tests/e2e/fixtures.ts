import { test as base, expect, type Page } from "@playwright/test";

// Shared auth fixture — logs in once per test file and reuses the session
async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', "admin@lycee-djibouti.ecolpro.app");
  await page.fill('input[type="password"]', "Demo@2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await login(page);
    await use(page);
  },
});

export { expect };
