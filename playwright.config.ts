import { defineConfig, devices } from "@playwright/test";

/**
 * Surchargeable : plusieurs sessions de développement peuvent tourner en
 * parallèle sur des ports différents, et démarrer un second serveur Next sur le
 * même dossier fait se disputer le répertoire `.next`.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";

/**
 * Le port vient de `baseURL`, il n'est pas écrit une seconde fois.
 *
 * POURQUOI
 * --------
 * `webServer.command` lançait `pnpm run dev`, donc `next dev` sur son port par
 * défaut — 3000 — pendant que `webServer.url` attendait 3001. Playwright
 * attendait donc un serveur qui ne viendrait jamais à cette adresse. Avec
 * `reuseExistingServer`, il se rabattait sur ce qui traînait sur 3001 : lors du
 * dernier échec, une application en erreur, d'où les trois tests tombés sur
 * « Application error » au lieu du formulaire de connexion.
 */
const port = new URL(baseURL).port || "3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "html",
  timeout: 30000,
  use: {
    baseURL,
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
    // `pnpm exec next dev` et non `pnpm run dev -- -p …` : pnpm transmet le
    // `--` littéralement, et `next` le prend alors pour un répertoire de projet
    // (« Invalid project directory provided: …/-p »). On appelle donc `next`
    // directement, ce qui reste du pnpm — jamais `npx`, cf. AGENTS.md.
    //
    // Playwright lance le webServer via `/bin/sh`, dont le PATH ne contient
    // pas `pnpm` (fourni par corepack). On utilise le chemin absolu du shim
    // corepack pour garantir que le serveur démarre quel que soit l'environnement.
    command: `${process.env.HOME}/Library/pnpm/pnpm exec next dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
