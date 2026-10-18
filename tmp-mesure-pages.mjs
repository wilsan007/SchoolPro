// Chronométrage de chaque écran du tableau de bord et de chacun de ses onglets.
// Usage : node tmp-mesure-pages.mjs  (serveur sur http://localhost:3000)
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.AUDIT_EMAIL ?? "admin@cite-ambouli.dj";
const MDP = process.env.AUDIT_PASSWORD ?? "Ambouli@2026!";
const SORTIE = "audit-reports/temps-chargement.json";
const POST_LOGIN =
  /\/(dashboard|direction|mon-espace|ma-classe|parent|eleve|vie-scolaire|secretariat|conseiller|infirmerie|comptabilite|ma-matiere|exploitation|inspection|select-tenant|super-admin|acces-bloque)/;

function routes() {
  const racine = path.join(process.cwd(), "src/app/(dashboard)");
  const out = [];
  const explorer = (dir, pre) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith("[") || e.name.startsWith("(")) continue;
      const r = `${pre}/${e.name}`;
      if (fs.existsSync(path.join(dir, e.name, "page.tsx"))) out.push(r);
      explorer(path.join(dir, e.name), r);
    }
  };
  explorer(racine, "");
  return out.filter((r) => !r.startsWith("/test-") && r !== "/acces-bloque").sort();
}

/** Compte les requêtes en vol pour détecter la fin d'activité réseau après un clic. */
function suivreReseau(page) {
  const enVol = new Set();
  let dernierMouvement = Date.now();
  const bouge = () => (dernierMouvement = Date.now());
  page.on("request", (r) => { enVol.add(r); bouge(); });
  page.on("requestfinished", (r) => { enVol.delete(r); bouge(); });
  page.on("requestfailed", (r) => { enVol.delete(r); bouge(); });
  return {
    reset: () => { enVol.clear(); bouge(); },
    async calme(t0, quietMs = 500, maxMs = 30_000) {
      while (Date.now() - t0 < maxMs) {
        const vol = [...enVol].filter((r) => !/\/_next\/webpack-hmr|turnstile|challenges\.cloudflare/.test(r.url()));
        if (vol.length === 0 && Date.now() - dernierMouvement >= quietMs) return dernierMouvement - t0;
        await page.waitForTimeout(50);
      }
      return null;
    },
  };
}

async function connecter(page) {
  // Faux widget Turnstile : le serveur local tourne avec la clé de test
  // Cloudflare « always passes », qui accepte le jeton factice officiel.
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile={render:(el,o)=>{setTimeout(()=>o.callback&&o.callback("XXXX.DUMMY.TOKEN.XXXX"),50);return "w1"},reset(){},remove(){},getResponse:()=>"XXXX.DUMMY.TOKEN.XXXX",execute(){}};`,
    }),
  );
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForSelector('input[type="email"]', { timeout: 30_000 });
  await page.waitForTimeout(2000);
  for (let i = 1; i <= 8; i++) {
    for (const [s, v] of [['input[type="email"]', EMAIL], ['input[type="password"]', MDP]]) {
      await page.locator(s).click().catch(() => {});
      await page.locator(s).fill(v).catch(() => {});
    }
    await page.click('button[type="submit"]').catch(() => {});
    try {
      await page.waitForURL(POST_LOGIN, { timeout: 15_000 });
      return;
    } catch {}
  }
  throw new Error("connexion impossible");
}

async function mesurerPage(page, reseau, href) {
  reseau.reset();
  const t0 = Date.now();
  let statut = null, erreur = null;
  try {
    const rep = await page.goto(`${BASE}${href}?embedded=1`, { waitUntil: "load", timeout: 120_000 });
    statut = rep?.status() ?? null;
  } catch (e) {
    erreur = String(e).split("\n")[0].slice(0, 120);
  }
  const tLoad = Date.now() - t0;
  const pret = await reseau.calme(t0, 500, 60_000);
  const nav = await page
    .evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return n ? { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null;
    })
    .catch(() => null);
  const urlFinale = new URL(page.url()).pathname;
  return { href, statut, urlFinale, bloque: urlFinale.startsWith("/acces-bloque") || urlFinale.startsWith("/login"), ttfb: nav?.ttfb ?? null, dcl: nav?.dcl ?? null, load: nav?.load ?? tLoad, pret, erreur };
}

async function mesurerOnglets(page, reseau) {
  const res = [];
  const n = await page.locator('[role="tab"]').count();
  for (let i = 0; i < n; i++) {
    const tab = page.locator('[role="tab"]').nth(i);
    const libelle = ((await tab.textContent().catch(() => "")) ?? "").trim().replace(/\s+/g, " ").slice(0, 40) || `#${i}`;
    if ((await tab.getAttribute("aria-selected").catch(() => null)) === "true" && i === 0) {
      res.push({ libelle, ms: 0, note: "actif par défaut" });
      continue;
    }
    reseau.reset();
    const t0 = Date.now();
    try {
      await tab.click({ timeout: 8_000 });
    } catch (e) {
      res.push({ libelle, ms: null, note: "clic impossible" });
      continue;
    }
    const ms = await reseau.calme(t0, 400, 30_000);
    res.push({ libelle, ms: ms === null ? null : Math.max(ms, Date.now() - t0 - 400) });
  }
  return res;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const reseau = suivreReseau(page);

console.log(`Connexion ${EMAIL} sur ${BASE}…`);
await connecter(page);
await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
const sw = await page.evaluate(async (b) => (await fetch(`${b}/api/switch-role`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "TENANT_ADMIN" }) })).status, BASE);
console.log(`Bascule TENANT_ADMIN : HTTP ${sw}`);

const liste = routes();
console.log(`${liste.length} écrans à mesurer\n`);
const resultats = [];
for (const href of liste) {
  const froid = await mesurerPage(page, reseau, href);
  const onglets = froid.bloque || froid.erreur ? [] : await mesurerOnglets(page, reseau);
  const chaud = await mesurerPage(page, reseau, href);
  resultats.push({ ...froid, chaud: { ttfb: chaud.ttfb, load: chaud.load, pret: chaud.pret }, onglets });
  const f = (v) => (v == null ? "   —  " : `${(v / 1000).toFixed(2)}s`.padStart(6));
  console.log(
    `${href.padEnd(32)} ${String(froid.statut ?? "ERR").padEnd(4)} froid ttfb ${f(froid.ttfb)} prêt ${f(froid.pret)} | chaud ttfb ${f(chaud.ttfb)} prêt ${f(chaud.pret)}` +
      (froid.bloque ? `  → ${froid.urlFinale}` : "") + (froid.erreur ? `  ✗ ${froid.erreur}` : "") +
      (onglets.length ? `\n${onglets.map((o) => `    └ onglet ${o.libelle.padEnd(40)} ${o.ms == null ? o.note ?? "—" : f(o.ms)}${o.note && o.ms != null ? " (" + o.note + ")" : ""}`).join("\n")}` : ""),
  );
}
fs.mkdirSync("audit-reports", { recursive: true });
fs.writeFileSync(SORTIE, JSON.stringify({ base: BASE, date: new Date().toISOString(), resultats }, null, 2));
console.log(`\nRapport : ${SORTIE}`);
await browser.close();
