// Chronométrage du changement de rôle.
import { chromium } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

await page.goto("http://localhost:3000/login", { timeout: 300000 });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/(dashboard|direction|mon-espace)/, { timeout: 300000 });
await page.waitForTimeout(5000);

const reqs = [];
const debuts = new Map();
page.on("request", (r) => debuts.set(r, Date.now()));
page.on("requestfinished", (r) => {
  const t0 = debuts.get(r);
  if (t0 === undefined) return;
  reqs.push({ url: r.url().replace("http://localhost:3000", "").slice(0, 70), method: r.method(), ms: Date.now() - t0, debut: t0 });
});

// Ouvrir le menu de rôle (barre du haut, hors iframe).
await page.getByRole("button", { name: /^(Directeur|Enseignant|Parent)$/i }).first().click();
await page.waitForTimeout(1000);
const textes = await page.getByRole("button").allTextContents();
console.log("menu:", textes.filter(Boolean).slice(0, 30).join(" | "));

const actif = (await page.getByRole("button", { name: /^(Directeur|Enseignant|Parent)$/i }).first().textContent())?.trim();
console.log("role actif:", actif);
const vise = actif === "Directeur" ? /^Enseignant$/i : /^Directeur$/i;
const cible = page.getByRole("button", { name: vise }).first();
if (await cible.count() === 0) { console.log("aucun role cible visible"); await browser.close(); process.exit(0); }

const t0 = Date.now();
await cible.click();
await page.waitForTimeout(25000);
console.log("duree ressentie jusqu'a stabilisation (plafonnee a 25s):", ((Date.now() - t0) / 1000).toFixed(1), "s — url:", page.url());
console.log("requetes de document/RSC, dans l'ordre :");
for (const r of reqs.filter((x) => !x.url.startsWith("/_next/static") && !x.url.startsWith("/__nextjs")).sort((a, b) => a.debut - b.debut))
  console.log(`  +${String(((r.debut - t0) / 1000).toFixed(1)).padStart(5)}s  ${String(r.ms).padStart(6)} ms  ${r.method} ${r.url}`);
await page.screenshot({ path: "tmp-roles.png" });
await browser.close();
