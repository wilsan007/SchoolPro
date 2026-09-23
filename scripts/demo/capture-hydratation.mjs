/**
 * Capture INTÉGRALE des avertissements d'hydratation React.
 * ========================================================
 * LECTURE SEULE — visite une page et note tout, sans cliquer.
 *
 * POURQUOI CE SCRIPT À PART
 * L'audit complet tronque les messages de console à 200 caractères, pour que le
 * rapport reste lisible sur 77 écrans. Or React place l'information décisive
 * APRÈS ce seuil : « Server: … Client: … », c'est-à-dire le fragment exact qui
 * diffère entre le rendu serveur et le rendu client. Sans lui, on sait qu'il y a
 * une incohérence mais pas laquelle — donc on ne peut pas la corriger.
 *
 * USAGE : node scripts/demo/capture-hydratation.mjs /devoirs
 */

import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const EMAIL = process.env.AUDIT_EMAIL ?? "admin@cite-ambouli.dj";
const MOT_DE_PASSE = process.env.AUDIT_PASSWORD ?? "Ambouli@2026!";
const CHEMIN = process.argv[2] ?? "/devoirs";

const navigateur = await chromium.launch();
const context = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
const page = await context.newPage();
page.on("response", () => {});

const messages = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") messages.push(m.text());
});
page.on("pageerror", (e) => messages.push(`pageerror: ${e.message}\n${e.stack ?? ""}`));

// Connexion par le formulaire (même chemin que l'audit principal).
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForSelector('input[type="email"]', { timeout: 30_000 });
await page.waitForTimeout(2_000);
for (const [sel, val] of [
  ['input[type="email"]', EMAIL],
  ['input[type="password"]', MOT_DE_PASSE],
]) {
  await page.locator(sel).click({ timeout: 5_000 }).catch(() => {});
  await page.locator(sel).fill(val).catch(() => {});
}
for (let i = 0; i < 8; i++) {
  await page.click('button[type="submit"]').catch(() => {});
  try {
    await page.waitForURL(/\/(dashboard|direction|select-tenant|mon-espace)/, { timeout: 8_000 });
    break;
  } catch {
    await page.waitForTimeout(2_000);
    for (const [sel, val] of [
      ['input[type="email"]', EMAIL],
      ['input[type="password"]', MOT_DE_PASSE],
    ]) {
      await page.locator(sel).fill(val).catch(() => {});
    }
  }
}
console.log(`Session : ${new URL(page.url()).pathname}`);

messages.length = 0;
await page.goto(`${BASE}${CHEMIN}?embedded=1`, { waitUntil: "domcontentloaded", timeout: 300_000 });
await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(3_000);

const hydration = messages.filter((m) => /[Hh]ydrat/.test(m));
console.log(`\n${hydration.length} message(s) d'hydratation sur ${CHEMIN}\n${"=".repeat(70)}`);
for (const m of hydration) {
  console.log(m);
  console.log("-".repeat(70));
}

fs.mkdirSync("audit-reports", { recursive: true });
const sortie = `audit-reports/hydratation-${CHEMIN.replace(/\\//g, "_")}.txt`;
fs.writeFileSync(sortie, hydration.join("\n\n" + "=".repeat(70) + "\n\n"));
console.log(`\nÉcrit dans ${sortie}`);

await navigateur.close();