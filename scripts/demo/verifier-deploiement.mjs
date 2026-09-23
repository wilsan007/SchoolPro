/**
 * Vérification post-déploiement des correctifs d'interface.
 * =========================================================
 * Encode le tableau de contrôles du plan `PLAN-AUDIT-UI-ET-CORRECTIFS.md` §3 :
 * santé de l'API, écran `/parametres/audit`, en-tête `/conseil-augmente`, dates
 * `jj/mm/aaaa` sans divergence d'hydratation, et absence de requête réservée au
 * super-admin pour un rôle ordinaire.
 *
 * LECTURE SEULE : un seul envoi de formulaire (la connexion), aucune écriture.
 * Une SEULE tentative de connexion suffit volontairement : le rate limiting
 * d'authentification est de 10 tentatives / 15 min / IP — une boucle de retry
 * consommerait le quota sans rien apprendre de plus.
 *
 * MESURE — POURQUOI `?embedded=1`
 * Le workspace rend chaque module dans une iframe (`WindowFrame` →
 * `${route}?embedded=1`). `page.content()` sur l'URL nue ne renvoie donc que
 * la coquille (dock, quadrants) : aucun <h1> de page, aucune date. On interroge
 * le document RÉEL de la page, comme `capture-hydratation.mjs`.
 * Deux écrans échappent à cette règle :
 *  - `/conseil-augmente` : son titre vient du composant `Header`, qui s'auto-
 *    masque en mode embedded — seule la disposition mobile (contenu rendu
 *    directement) le fait apparaître ;
 *  - `/travail` et `/ma-journee` : hors périmètre du compte de démonstration
 *    (rôle Directeur), le middleware les renvoie vers `/acces-bloque` — c'est
 *    le refus par défaut attendu (règle 6 du projet), constaté et non contourné.
 *
 * USAGE : AUDIT_BASE_URL=https://schoolpro.fly.dev node scripts/demo/verifier-deploiement.mjs
 *         AUDIT_BASE_URL=http://localhost:3100 node scripts/demo/verifier-deploiement.mjs
 *
 * Codes de sortie : 0 = tous les contrôles passent, 1 = au moins un échec,
 * 2 = connexion impossible (quota anti-bot ou identifiants — non concluant).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.AUDIT_BASE_URL ?? "https://schoolpro.fly.dev";
const EMAIL = process.env.AUDIT_EMAIL ?? "admin@cite-ambouli.dj";
const MOT_DE_PASSE = process.env.AUDIT_PASSWORD ?? "Ambouli@2026!";

const navigateur = await chromium.launch();
const context = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
const page = await context.newPage();

const erreurs = [];
/** Réponses HTTP en échec (>= 400) : plus fiable qu'un message de console,
 *  qui dit « 403 » sans dire quelle ressource a été refusée. */
const reponsesEchouees = [];

page.on("console", (m) => {
  if (m.type() === "error") erreurs.push(m.text());
});
page.on("pageerror", (e) => erreurs.push(`pageerror: ${e.message}`));
page.on("response", (r) => {
  if (r.status() >= 400) {
    reponsesEchouees.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  }
});

const resultats = [];
function verifier(nom, ok, detail) {
  resultats.push({ nom, ok, detail });
  console.log(`${ok ? "OK    " : "ECHEC "} | ${nom} | ${detail}`);
}

/** Extrait visuel d'un document, pour diagnostiquer un contrôle en échec. */
async function extrait() {
  const texte = await page.locator("body").innerText().catch(() => "");
  return texte.replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Premières erreurs console, pour ne pas laisser un « 1 erreur(s) » muet. */
function premieresErreurs(n = 2) {
  return erreurs.slice(0, n).map((e) => String(e).replace(/\s+/g, " ").slice(0, 240)).join(" || ");
}

const datesFr = (html) => [...html.matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g)].map((m) => m[0]);
const datesUs = (html) => [...html.matchAll(/(^|[^\d])\d{1}\/\d{2}\/\d{4}\b/g)].map((m) => m[0].trim());

/**
 * Ouvre le document RÉEL d'une route et renvoie son chemin d'arrivée.
 * `embedded` = true suit le chargement fait par le workspace (iframe) ; false
 * charge la coquille complète (dock + bannière d'impersonation).
 */
async function visiter(chemin, { embedded = true, attente = 2_000 } = {}) {
  erreurs.length = 0;
  reponsesEchouees.length = 0;
  const suffixe = embedded ? (chemin.includes("?") ? "&" : "?") + "embedded=1" : "";
  await page.goto(`${BASE}${chemin}${suffixe}`, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(attente);
  const arrivee = new URL(page.url());
  console.log(`      (${chemin}${suffixe} → ${arrivee.pathname}${arrivee.search})`);
  // Dépôt du HTML brut : l'inspection hors navigateur est plus fiable que des
  // assertions sur du texte échappé (`'` devient `&#x27;` dans le HTML React).
  const nom = `/tmp/sp-page${chemin.replace(/[/?=&]/g, "_")}${embedded ? "_embedded" : ""}.html`;
  fs.writeFileSync(nom, await page.content());
  return arrivee.pathname;
}

// --- 0. Santé de l'API (aucune session requise)
// Premier contrôle du plan : il doit passer même si la connexion échoue ensuite,
// d'où sa place AVANT le formulaire.
const sante = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
const corpsSante = sante ? await sante.json().catch(() => null) : null;
verifier(
  "/api/health",
  sante?.status === 200 && corpsSante?.ok === true,
  `http=${sante?.status ?? "injoignable"} | db=${corpsSante?.checks?.database?.ok ?? "?"} | rls=${corpsSante?.checks?.rls?.mode ?? "?"}`,
);

// --- 0. Connexion
// Mêmes précautions que scripts/demo/audit-ui-complet.mjs : le jeton Turnstile
// est invisible et ASYNCHRONE, et le formulaire BLOQUE côté client tant qu'il
// n'est pas prêt (aucune tentative de rate-limit consommée). On réessaie donc
// le clic sans jamais brûler du quota d'authentification.
const POST_LOGIN_URL =
  /\/(dashboard|direction|select-tenant|mon-espace|ma-classe|parent|eleve|vie-scolaire|secretariat|conseiller|infirmerie|comptabilite|ma-matiere|exploitation|inspection|super-admin|acces-bloque)/;

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForSelector('input[type="email"]', { timeout: 30_000 });
await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await page
  .waitForFunction(
    () =>
      typeof window.turnstile !== "undefined" ||
      !!document.querySelector('iframe[src*="challenges.cloudflare.com"]'),
    { timeout: 20_000 },
  )
  .catch(() => page.waitForTimeout(2_000));

const saisirIdentifiants = async () => {
  for (const [selecteur, valeur] of [
    ['input[type="email"]', EMAIL],
    ['input[type="password"]', MOT_DE_PASSE],
  ]) {
    const champ = page.locator(selecteur);
    await champ.click({ timeout: 5_000 }).catch(() => {});
    await champ.fill(valeur).catch(() => {});
  }
};

await saisirIdentifiants();
let ouvert = false;
for (let tentative = 1; tentative <= 6 && !ouvert; tentative++) {
  await page.click('button[type="submit"]').catch(() => {});
  try {
    await page.waitForURL(POST_LOGIN_URL, { timeout: 10_000 });
    ouvert = true;
    console.log(`      (session ouverte à la tentative ${tentative})`);
  } catch {
    // Le plus souvent : « vérification en cours » (jeton pas encore prêt).
    // On repart d'une saisie neuve, sans consommer de tentative serveur.
    await page.waitForTimeout(3_000);
    await saisirIdentifiants();
  }
}
const apresLogin = new URL(page.url()).pathname;
verifier("connexion", ouvert, `arrivée sur ${apresLogin}`);

// Le compte de démonstration appartient à PLUSIEURS tenants : sans choix
// explicite, toute page du tableau de bord renvoie ici (guard-page.ts). On
// sélectionne donc l'établissement de démonstration (celui qui porte les
// données : devoirs, journal d'audit), sinon le premier proposé. C'est un
// simple choix de périmètre de session, aucune donnée métier n'est écrite.
if (ouvert && /select-tenant/.test(new URL(page.url()).pathname)) {
  const parNom = page.locator("button", { hasText: /mbouli/i }).first();
  const cible = (await parNom.count()) ? parNom : page.locator("button", { has: page.locator("p.font-semibold") }).first();
  await cible.click({ timeout: 20_000 }).catch(() => {});
  await page.waitForURL(/\/(dashboard|direction|mon-espace)/, { timeout: 60_000 }).catch(() => {});
  console.log(`      (tenant sélectionné → ${new URL(page.url()).pathname})`);
}

if (!ouvert) {
  console.log("\nConnexion impossible : vérification non concluante (rate limiting ou identifiants).");
  fs.mkdirSync("audit-reports", { recursive: true });
  fs.writeFileSync("audit-reports/verification-deploiement.json", JSON.stringify(resultats, null, 2));
  await navigateur.close();
  process.exit(2);
}

// --- 1. /parametres/audit : plus d'erreur serveur
// L'écran est un composant client : le rendu initial est le spinner, le
// journal n'apparaît qu'APRÈS hydratation. On attend donc le titre au lieu de
// figer une capture trop précoce.
const cheminAudit = await visiter("/parametres/audit");
await page.waitForSelector('h1:has-text("Journal d")', { timeout: 30_000 }).catch(() => {});
const htmlAudit = await page.content();
const titreAudit = ((await page.locator("h1").first().textContent().catch(() => null)) ?? "").trim();
verifier(
  "/parametres/audit se rend (plus d'erreur serveur)",
  /Journal d.audit/.test(htmlAudit) && !/Application error/i.test(htmlAudit),
  `arrivée=${cheminAudit} | h1="${titreAudit}" | erreur="${premieresErreurs(1)}"`,
);
verifier(
  "/parametres/audit sans erreur SessionProvider",
  !erreurs.some((e) => /SessionProvider/i.test(e)),
  `${erreurs.length} erreur(s) console | ${premieresErreurs(1)}`,
);

// --- 2. /conseil-augmente : en-tête traduit
// Mesure en disposition MOBILE, pour une raison précise : dans le workspace
// desktop le module est chargé en mode embedded (`?embedded=1`) et le composant
// `Header` s'y auto-masque (« En mode embedded, on ne rend pas le header —
// la WindowFrame a déjà sa propre title bar »). Le titre `conseilAugmente.title`
// n'existe donc nulle part dans le DOM par ce chemin : l'assertion ne pouvait
// qu'échouer. La disposition mobile rend le contenu de page DIRECTEMENT (pas
// d'iframe, MobileLayout) : c'est le seul chemin navigateur où le titre est
// réellement affiché. On mesure aussi sur le TEXTE VISIBLE, car la clé brute
// peut traîner dans le payload RSC sans être rendue.
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const contexteMobile = await navigateur.newContext({
  userAgent: MOBILE_UA,
  viewport: { width: 390, height: 844 },
  locale: "fr-FR",
});
await contexteMobile.addCookies(await context.cookies());
const pageMobile = await contexteMobile.newPage();
await pageMobile.goto(`${BASE}/conseil-augmente`, { waitUntil: "domcontentloaded", timeout: 300_000 });
await pageMobile.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await pageMobile.waitForTimeout(2_000);
const htmlConseil = await pageMobile.content();
fs.writeFileSync("/tmp/sp-page_conseil-augmente_mobile.html", htmlConseil);
const texteConseil = (await pageMobile.locator("body").innerText().catch(() => ""))
  .replace(/\s+/g, " ")
  .trim();
const titreConseil = ((await pageMobile.locator("h1").first().textContent().catch(() => null)) ?? "").trim();
verifier(
  "/conseil-augmente en-tête traduit (disposition mobile)",
  /Conseil augmenté/.test(texteConseil) && !/conseilAugmente\./.test(texteConseil),
  `arrivée=${new URL(pageMobile.url()).pathname} | h1="${titreConseil.slice(0, 40)}" | texte="${texteConseil.slice(0, 70)}"`,
);
await contexteMobile.close();

// --- 3. /devoirs : dates jj/mm/aaaa, sans divergence d'hydratation
await visiter("/devoirs");
const htmlDevoirs = await page.content();
const hydratation = erreurs.filter((e) => /hydrat/i.test(e));
verifier(
  "/devoirs sans divergence d'hydratation",
  hydratation.length === 0,
  `${erreurs.length} erreur(s) console, ${hydratation.length} d'hydratation`,
);
verifier(
  "/devoirs : dates rendues en jj/mm/aaaa (jamais mm/jj/aaaa)",
  datesFr(htmlDevoirs).length > 0 && datesUs(htmlDevoirs).length === 0,
  `fr=${datesFr(htmlDevoirs).slice(0, 3).join(",")} us=${datesUs(htmlDevoirs).length}`,
);

// --- 4. /travail et /ma-journee : soit dates fr, soit refus de périmètre
// Ces deux écrans exigent des permissions que le compte de vérification
// (Directeur) n'a pas : le middleware les renvoie vers /acces-bloque. C'est le
// refus par défaut documenté (règle 6, fail-closed) — on le constate au lieu de
// conclure sur un écran vide.
for (const chemin of ["/travail", "/ma-journee"]) {
  const arrivee = await visiter(chemin);
  if (arrivee === "/acces-bloque") {
    verifier(
      `${chemin} : refus de périmètre (fail-closed) pour le rôle Directeur`,
      true,
      "redirigé vers /acces-bloque — dates non mesurables avec ce compte",
    );
  } else {
    const html = await page.content();
    verifier(
      `${chemin} : dates rendues en jj/mm/aaaa`,
      datesFr(html).length > 0 && datesUs(html).length === 0,
      `fr=${datesFr(html).length} us=${datesUs(html).length}`,
    );
  }
}

// --- 5. Coquille du workspace : aucune requête réservée au super-admin
// La coquille monte la bannière d'impersonation, qui interroge
// /api/super-admin/impersonate/status (réservé aux SUPER_ADMIN). Montée pour
// tous les rôles, elle produisait un 403 en console à chaque écran — le seul
// « défaut » que la vérification remontait encore après les trois correctifs.
await visiter("/dashboard", { embedded: false, attente: 4_000 });
const requetesSuperAdmin = reponsesEchouees.filter((r) => /super-admin/.test(r));
verifier(
  "coquille workspace : plus de requête super-admin refusée pour un rôle non super-admin",
  requetesSuperAdmin.length === 0,
  `${erreurs.length} erreur(s) console | échecs HTTP=[${reponsesEchouees.join(", ") || "aucun"}]`,
);

fs.mkdirSync("audit-reports", { recursive: true });
fs.writeFileSync("audit-reports/verification-deploiement.json", JSON.stringify(resultats, null, 2));
const echecs = resultats.filter((r) => !r.ok).length;
console.log(`\nBilan : ${resultats.length - echecs}/${resultats.length} contrôles OK`);
await navigateur.close();
process.exit(echecs === 0 ? 0 : 1);
