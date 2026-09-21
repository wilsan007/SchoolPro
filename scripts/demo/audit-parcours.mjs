/**
 * Démo Ambouli — audit de parcours : ce que voit réellement chaque rôle, à
 * chaque date de la Time Machine.
 *
 * POURQUOI UN ROBOT PLUTÔT QU'UNE REQUÊTE SQL
 * Compter des lignes en base ne dit pas si un écran est rempli. Une page peut
 * être vide alors que la donnée existe (mauvais filtre d'année, périmètre de
 * site, horizon de démonstration), et pleine alors que la table est presque
 * vide. Seule la page rendue fait foi — onglets compris, puisque l'essentiel
 * du contenu s'y trouve.
 *
 * CE QU'IL FAIT
 *   1. Se connecte avec le compte de démonstration.
 *   2. Pour chaque date de `DEMO_PRESETS` (plus la date réelle) :
 *      pour chaque rôle possédé : bascule, relève les entrées de menu
 *      réellement affichées, ouvre chacune, ouvre chaque onglet, et note ce
 *      qui s'affiche.
 *   3. Écrit un rapport JSON + un résumé lisible.
 *
 *   node scripts/demo/audit-parcours.mjs [--roles TEACHER,PARENT] [--dates mars-2026]
 *   node scripts/demo/audit-parcours.mjs --pages /mon-espace,/ma-classe
 */

import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.AUDIT_EMAIL ?? "admin@cite-ambouli.dj";
const MOT_DE_PASSE = process.env.AUDIT_PASSWORD ?? "Ambouli@2026!";

/**
 * POURQUOI ON PEUT CHANGER DE COMPTE
 *
 * La bascule de rôle n'est pas un réglage d'affichage : elle ÉCRIT le rôle
 * actif en base (`UserTenant.role`, `User.role`). Deux robots qui basculeraient
 * en même temps sur le même compte se voleraient donc leur rôle en pleine
 * navigation, et le rapport mélangerait les écrans de deux personnages.
 *
 * Pour paralléliser, on donne à chaque robot le compte d'un membre du
 * personnel qui porte DÉJÀ le rôle voulu (`--compte`), et on lui interdit de
 * basculer (`--sans-bascule`). Chacun reste alors dans son couloir.
 *
 * Les rôles sans compte dédié — dont ceux qui tiennent à un lien relationnel,
 * comme l'enseignant de la démonstration ou son enfant — restent servis par le
 * compte de démonstration, en série, par un seul robot.
 */
const SORTIE = process.env.AUDIT_OUT ?? "audit-reports/demo-parcours.json";

const DATES = [
  { id: "octobre-2025", date: "2025-10-15T10:00:00.000Z" },
  { id: "janvier-2026", date: "2026-01-15T10:00:00.000Z" },
  { id: "mars-2026", date: "2026-03-15T10:00:00.000Z" },
  { id: "juin-2026", date: "2026-06-15T10:00:00.000Z" },
  { id: "aout-2026", date: "2026-08-16T10:00:00.000Z" },
  { id: "octobre-2026", date: "2026-10-15T10:00:00.000Z" },
  { id: "reel", date: null },
];

const ROLES = [
  "TENANT_ADMIN", "PRINCIPAL", "TEACHER", "CLASS_TEACHER", "SUBJECT_LEAD",
  "PARENT", "STUDENT", "SUPERVISOR", "SECRETARY", "COUNSELOR", "NURSE",
  "ACCOUNTANT", "SITE_MANAGER", "INSPECTOR",
];

/** Formules d'écran vide, en français — la langue de la démonstration. */
const MARQUEURS_VIDE = [
  "aucun", "aucune", "rien à afficher", "pas de donnée", "pas encore",
  "vide pour l'instant", "0 résultat", "non disponible", "à venir",
];
const MARQUEURS_ERREUR = [
  "application error", "une erreur est survenue", "internal server error",
  "something went wrong", "erreur de chargement", "digest:",
];

function arg(nom) {
  const i = process.argv.indexOf(`--${nom}`);
  return i > -1 ? process.argv[i + 1] : null;
}

const filtreRoles = arg("roles")?.split(",");
const filtreDates = arg("dates")?.split(",");
const filtrePages = arg("pages")?.split(",");
const compte = arg("compte") ?? EMAIL;
const motDePasse = arg("motdepasse") ?? MOT_DE_PASSE;
const sansBascule = process.argv.includes("--sans-bascule");

/** Les écrans à visiter, recensés une fois pour toutes. */
const ROUTES = routesDuTableauDeBord();

async function connecter(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const csrf = await page.evaluate(async (base) => {
    const r = await fetch(`${base}/api/auth/csrf`);
    return (await r.json()).csrfToken;
  }, BASE);

  const ok = await page.evaluate(
    async ({ base, csrfToken, email, password }) => {
      const body = new URLSearchParams({ csrfToken, email, password, redirect: "false", callbackUrl: `${base}/dashboard` });
      const r = await fetch(`${base}/api/auth/callback/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      return r.status;
    },
    { base: BASE, csrfToken: csrf, email: compte, password: motDePasse },
  );

  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const url = page.url();
  if (url.includes("/login")) throw new Error(`Connexion refusée (statut ${ok}) — ${url}`);
  await page.close();
}

async function poserDate(page, date) {
  return page.evaluate(
    async ({ base, date }) => {
      const r = await fetch(`${base}/api/demo-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      return { statut: r.status, corps: await r.text() };
    },
    { base: BASE, date },
  );
}

async function basculerRole(page, role) {
  // La bascule passe par un `fetch` exécuté DANS la page : si la page est en
  // train de naviguer, le contexte d'exécution disparaît sous les pieds de
  // l'appel. On se pose donc d'abord sur un écran stable.
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(300);
  return page.evaluate(
    async ({ base, role }) => {
      const r = await fetch(`${base}/api/switch-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      return { statut: r.status, corps: (await r.text()).slice(0, 200) };
    },
    { base: BASE, role },
  );
}

/**
 * Toutes les routes du tableau de bord, lues sur le disque.
 *
 * L'interface est un bureau à fenêtres : le menu est un dock qui ouvre des
 * iframes, il n'expose donc pas de `<a href>` à relever. La liste des écrans
 * vient donc de l'arborescence `src/app/(dashboard)`, et c'est le serveur qui
 * dira, par une redirection vers `/acces-bloque`, ce que le rôle n'a pas le
 * droit d'ouvrir.
 */
function routesDuTableauDeBord() {
  const racine = path.join(process.cwd(), "src/app/(dashboard)");
  const routes = [];
  const explorer = (dossier, prefixe) => {
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
      if (!entree.isDirectory()) continue;
      // Segments dynamiques : sans identifiant réel, la visite ne prouve rien.
      if (entree.name.startsWith("[") || entree.name.startsWith("(")) continue;
      const chemin = `${prefixe}/${entree.name}`;
      if (fs.existsSync(path.join(dossier, entree.name, "page.tsx"))) routes.push(chemin);
      explorer(path.join(dossier, entree.name), chemin);
    }
  };
  explorer(racine, "");
  // Écrans de mise au point, hors démonstration.
  return routes.filter((r) => !r.startsWith("/test-") && r !== "/acces-bloque").sort();
}

async function mesurer(page) {
  return page.evaluate(
    ({ vides, erreurs }) => {
      const main = document.querySelector("main") ?? document.body;
      const texte = (main.innerText || "").replace(/\s+/g, " ").trim();
      const bas = texte.toLowerCase();
      return {
        taille: texte.length,
        vide: vides.filter((m) => bas.includes(m)),
        erreur: erreurs.filter((m) => bas.includes(m)),
        // Éléments porteurs de données : lignes de tableau, cartes, listes.
        lignes: main.querySelectorAll("tbody tr").length,
        cartes: main.querySelectorAll('[class*="card"], [data-slot="card"]').length,
        extrait: texte.slice(0, 260),
      };
    },
    { vides: MARQUEURS_VIDE, erreurs: MARQUEURS_ERREUR },
  );
}

async function onglets(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"]')).map((t, i) => ({
      index: i,
      libelle: (t.textContent || "").trim().slice(0, 40),
    })),
  );
}

async function visiter(page, href) {
  const resultat = { href, statut: null, urlFinale: null, onglets: [] };
  try {
    // `?embedded=1` rend la page sans la coquille du bureau : c'est ainsi que
    // l'application l'affiche dans ses fenêtres, et cela évite d'auditer une
    // iframe depuis l'extérieur.
    const reponse = await page.goto(`${BASE}${href}?embedded=1`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    resultat.statut = reponse?.status() ?? null;
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(600);
    resultat.urlFinale = new URL(page.url()).pathname;
    Object.assign(resultat, await mesurer(page));

    const listeOnglets = await onglets(page);
    for (const o of listeOnglets) {
      try {
        const cible = page.locator('[role="tab"]').nth(o.index);
        await cible.click({ timeout: 5_000 });
        await page.waitForTimeout(900);
        resultat.onglets.push({ ...o, ...(await mesurer(page)) });
      } catch (e) {
        resultat.onglets.push({ ...o, erreurClic: String(e).slice(0, 120) });
      }
    }
  } catch (e) {
    resultat.exception = String(e).slice(0, 200);
  }
  return resultat;
}

function ecrireRapport(rapport) {
  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, JSON.stringify(rapport, null, 1));
}

async function main() {
  const navigateur = await chromium.launch();
  const context = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  await connecter(context);

  const page = await context.newPage();
  // Les appels `fetch` relatifs partent de l'origine de la page : sur
  // `about:blank`, ils échouent avant même d'atteindre le serveur.
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const rapport = { base: BASE, compte, sansBascule, debut: new Date().toISOString(), parcours: [] };

  console.log(`${ROUTES.length} écrans recensés`);
  const dates = DATES.filter((d) => !filtreDates || filtreDates.includes(d.id));
  const roles = ROLES.filter((r) => !filtreRoles || filtreRoles.includes(r));

  for (const d of dates) {
    await poserDate(page, d.date);
    for (const role of roles) {
      let bascule;
      if (sansBascule) {
        // Le compte porte déjà le rôle : rien à basculer, donc rien à écrire.
        bascule = { statut: 200, corps: "compte dédié" };
      } else try {
        bascule = await basculerRole(page, role);
      } catch (e) {
        // Une seule reprise : au-delà, c'est le serveur qui ne répond plus et
        // insister ne ferait qu'allonger un rapport déjà faux.
        await page.waitForTimeout(2000);
        bascule = await basculerRole(page, role).catch((err) => ({ statut: 0, corps: String(err).slice(0, 200) }));
      }
      const entree = { date: d.id, role, bascule: bascule.statut, pages: [] };

      if (bascule.statut !== 200) {
        entree.erreurBascule = bascule.corps;
        rapport.parcours.push(entree);
        console.log(`✗ ${d.id} / ${role} — bascule refusée (${bascule.statut})`);
        continue;
      }

      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      entree.accueil = new URL(page.url()).pathname;

      const cibles = filtrePages ?? ROUTES;
      for (const href of cibles) {
        const r = await visiter(page, href);
        entree.pages.push(r);
        const drapeau = r.exception || r.erreur?.length ? "✗" : r.vide?.length && r.lignes === 0 ? "○" : "•";
        console.log(`${drapeau} ${d.id} / ${role} ${href} — ${r.taille ?? 0} car., ${r.lignes ?? 0} lignes, ${r.onglets.length} onglet(s)`);
      }
      rapport.parcours.push(entree);
      // Écriture après chaque rôle : une heure de parcours ne doit pas être
      // perdue parce que la dernière bascule a échoué.
      ecrireRapport(rapport);
    }
  }

  rapport.fin = new Date().toISOString();
  ecrireRapport(rapport);
  console.log(`\nRapport écrit : ${SORTIE}`);
  await navigateur.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
