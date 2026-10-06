import { test as base, expect, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Fixture d'authentification partagée.
//
// Utilise le compte admin@qa-learnos.test créé par scripts/qa-comptes-demo.ts
// sur le tenant demo-learnos. Le mot de passe est Demo@2026! (E2E_PASSWORD).
// `scripts/qa-compte-ambouli.ts` pose l'équivalent sur le tenant de
// démonstration complet (E2E_EMAIL=admin-ambouli@qa-learnos.test).
const E2E_EMAIL = process.env.E2E_EMAIL ?? "admin@qa-learnos.test";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Demo@2026!";

// Motif d'URL acceptable après login : toutes les routes d'accueil possibles.
const POST_LOGIN_URL = /\/(dashboard|direction|mon-espace|ma-classe|parent|eleve|vie-scolaire|secretariat|conseiller|infirmerie|comptabilite|ma-matiere|exploitation|inspection|select-tenant|super-admin|acces-bloque)/;

/** Où la session authentifiée est mise en cache entre les tests d'un même run. */
const STATE_PATH = path.join(
  process.env.E2E_STATE_DIR ?? "test-results/.auth",
  `${E2E_EMAIL.replace(/[^a-z0-9]/gi, "-")}.json`
);

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', E2E_EMAIL);
  await page.fill('input[type="password"]', E2E_PASSWORD);
  await page.click('button[type="submit"]');
  // La base de développement peut répondre en plusieurs secondes par requête :
  // 20 s ne suffisent alors pas pour la chaîne d'authentification.
  await page.waitForURL(POST_LOGIN_URL, { timeout: Number(process.env.E2E_LOGIN_TIMEOUT ?? 20000) });
}

/**
 * Se connecte UNE fois par worker et réutilise les cookies ensuite.
 *
 * POURQUOI
 * --------
 * La fixture rejouait le formulaire de connexion à chaque test : plus de cent
 * connexions sur l'ensemble de la suite, chacune enchaînant plusieurs requêtes
 * à la base. Sur une base distante à ~1 s par requête, c'est la majeure partie
 * du temps d'exécution — et la première cause d'échecs intermittents par
 * dépassement de délai. La session est désormais capturée une fois, écrite sur
 * disque, puis rejouée par `browser.newContext({ storageState })`.
 */
async function sessionPartagee(browser: Browser): Promise<string> {
  if (fs.existsSync(STATE_PATH)) return STATE_PATH;

  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await login(page);
    await context.storageState({ path: STATE_PATH });
  } finally {
    await context.close();
  }
  return STATE_PATH;
}

export const test = base.extend<{ authedPage: Page }, { storageStatePath: string }>({
  // `utiliser` plutôt que `use` : la règle react-hooks/rules-of-hooks prend
  // le `use` de Playwright pour le hook React du même nom.
  storageStatePath: [
    async ({ browser }, utiliser) => {
      await utiliser(await sessionPartagee(browser));
    },
    { scope: "worker" },
  ],

  authedPage: async ({ browser, storageStatePath }, utiliser) => {
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();
    try {
      await utiliser(page);
    } finally {
      await context.close();
    }
  },
});

export { expect };
