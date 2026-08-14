import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "html",
  timeout: 30000,
  use: {
    // Surchargeable : plusieurs sessions de développement peuvent tourner en
    // parallèle sur des ports différents, et démarrer un second serveur Next
    // sur le même dossier fait se disputer le répertoire `.next`.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm run dev",
    url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
