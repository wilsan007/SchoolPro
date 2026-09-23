/**
 * Audit UI complet — écrans, boutons, modales, onglets.
 * ============================================================
 * POURQUOI CE SCRIPT
 * Un écran peut répondre 200 et être inutilisable : bouton sans gestionnaire,
 * modale qui ne s'ouvre pas, action primaire désactivée en boucle, onglet qui
 * vide la page. Une requête SQL ou un `curl` ne le voit pas ; seul le DOM
 * rendu, cliqué, fait foi.
 *
 * CE QU'IL FAIT, PAR ÉCRAN
 *   1. Ouvre l'écran et relève ses constantes vitales (statut, texte, lignes,
 *      marqueurs d'erreur, erreurs console).
 *   2. Inventorie TOUS les contrôles : boutons, liens, champs, onglets.
 *      Signale ceux qui sont morts : nom accessible vide, `href="#"`.
 *   3. Ouvre CHAQUE modale (`aria-haspopup="dialog"` et boutons d'ouverture
 *      reconnus), relève son titre, ses champs, ses boutons, puis la referme
 *      — par la croix ET par Échap, et vérifie qu'elle se referme vraiment.
 *   4. Clique CHAQUE onglet et vérifie que la page reste saine.
 *
 * CE QU'IL NE FAIT JAMAIS — LECTURE SEULE
 * Le script tourne contre la production : il n'enregistre rien, ne supprime
 * rien, ne soumet aucun formulaire. Les actions d'écriture (`Enregistrer`,
 * `Supprimer`, `Confirmer`, `Générer`, `Valider`…) sont RECENSÉES mais jamais
 * déclenchées. Les seuls clics émis sont ceux qui ouvrent et ferment une
 * modale, changent d'onglet, ou déplient une catégorie du dock : tous sans
 * effet de bord persistant.
 *
 * USAGE
 *   node scripts/demo/audit-ui-complet.mjs
 *   node scripts/demo/audit-ui-complet.mjs --base https://schoolpro.fly.dev
 *   node scripts/demo/audit-ui-complet.mjs --pages /conseiller,/notes
 *   node scripts/demo/audit-ui-complet.mjs --sans-dock
 *
 * SORTIE
 *   audit-reports/ui-complet.json   (rapport machine)
 *   console                          (résumé lisible, ✗ = à corriger)
 */

import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function arg(nom) {
  const i = process.argv.indexOf(`--${nom}`);
  return i > -1 ? process.argv[i + 1] : null;
}

const BASE = arg("base") ?? process.env.AUDIT_BASE_URL ?? "http://localhost:3000";
/**
 * Compte de démonstration par défaut.
 *
 * C'est celui de `scripts/demo/audit-parcours.mjs` : `admin@cite-ambouli.dj`
 * appartient au tenant `cite-scolaire-ambouli`, le SEUL peuplé de la base
 * (3 697 élèves, 132 classes, 5,1 M de notes). Auditer le tenant QA
 * `demo-learnos` ne montrerait que des écrans vides — donc aucun tableau,
 * aucune modale, aucun bouton d'action : l'audit ne prouverait rien.
 */
const EMAIL = arg("email") ?? process.env.AUDIT_EMAIL ?? "admin@cite-ambouli.dj";
const MOT_DE_PASSE = arg("motdepasse") ?? process.env.AUDIT_PASSWORD ?? "Ambouli@2026!";
const SORTIE = process.env.AUDIT_OUT ?? "audit-reports/ui-complet.json";

const filtrePages = arg("pages")?.split(",");
const sansDock = process.argv.includes("--sans-dock");
/**
 * Code du second facteur, à passer à la main quand le compte l'exige.
 * On ne le lit PAS depuis l'environnement : un code TOTP vit 30 secondes, un
 * secret partagé dans un fichier donnerait une fausse sensation de confort.
 */
const codeTotp = arg("totp");
/**
 * Rôle à incarner pendant l'audit.
 *
 * Le compte de démonstration est un `COUNSELOR` : auditer tous les écrans avec
 * ce rôle ne ferait que constater les refus d'accès — 81 redirections vers
 * `/acces-bloque`, et aucun écran réellement inspecté. On bascule donc vers
 * `TENANT_ADMIN`, qui ouvre l'ensemble du tenant, via l'API `/api/switch-role`
 * (celle qu'utilise déjà `scripts/demo/audit-parcours.mjs`).
 *
 * Passer `--role ""` (ou `--sans-role`) conserve le rôle du compte, ce qui sert
 * à vérifier le cloisonnement : les écrans refusés doivent alors être nombreux.
 */
const roleVise = process.argv.includes("--sans-role") ? null : (arg("role") ?? "TENANT_ADMIN");

/**
 * Mode pré-chauffage : compile les écrans en parallèle puis s'arrête.
 * Cf. `prechauffer()` — utile uniquement contre un serveur de développement.
 */
const modePrechauffage = process.argv.includes("--prechauffer");

/**
 * Plafond de boutons cliqués par écran.
 *
 * Un écran comme `/notes` expose 48 boutons, dont une trentaine de pastilles de
 * filtre interchangeables. Les cliquer tous coûte ~1,5 s chacun pour un verdict
 * identique. Le plafond garde l'audit complet praticable ; les boutons non
 * cliqués restent recensés dans le rapport avec la mention « au-delà du
 * plafond », pour que l'absence de verdict soit explicite et non silencieuse.
 */
const maxBoutons = Number(arg("max-boutons") ?? 25);
/** Budget d'écrans, pour les sessions d'itération. 0 = tous. */
const limite = Number(arg("limite") ?? 0);

/**
 * Navigateur visible (`--visible`).
 *
 * POURQUOI CE MODE EXISTE — Cloudflare Turnstile est déployé en production, et
 * il fait exactement son travail : un Chromium `headless` ne passe pas le défi,
 * le widget reste sans jeton, et l'authentification échoue. Un navigateur
 * visible, lui, obtient son jeton normalement. Sans cette option, la seule
 * cible auditables restait un serveur de développement — or c'est bien la
 * production qu'on veut vérifier.
 *
 * Le mode visible ouvre une fenêtre sur la machine : c'est le prix à payer pour
 * franchir l'anti-bot sans le contourner.
 */
const navigateurVisible = process.argv.includes("--visible");

/**
 * Connexion manuelle (`--connexion-manuelle`).
 *
 * POURQUOI — Cloudflare Turnstile protège la production, et c'est une bonne
 * chose : il empêche précisément ce qu'un navigateur piloté cherche à faire.
 * Plutôt que de tenter de le contourner (falsifier un jeton, bricoler le
 * domaine), on laisse l'humain devant l'écran : l'utilisateur saisit ses
 * identifiants et résout le défi s'il y en a un, puis l'audit reprend la
 * session déjà ouverte et déroule ses 77 écrans sans jamais se reconnecter.
 *
 * Le navigateur reste donc VISIBLE, et le script attend le passage sur une URL
 * post-connexion (10 minutes au maximum) avant de commencer.
 */
const connexionManuelle = process.argv.includes("--connexion-manuelle");

/**
 * Délai maximal de chargement d'un écran, en millisecondes.
 *
 * POURQUOI C'EST RÉGLABLE — `next dev` compile chaque route à sa première
 * visite, et certaines pages de ce projet dépassent les deux minutes de
 * compilation (5 000 modules, plusieurs API lourdes). Le plafond par défaut
 * convient à un serveur déjà chaud ; contre un serveur de développement froid,
 * le passer à 300 000 évite de déclarer « en panne » une page qui compile.
 */
const timeoutChargement = Number(arg("timeout-chargement") ?? 120_000);

/** Formules d'erreur serveur, relevées dans le texte rendu. */
const MARQUEURS_ERREUR = [
  "application error",
  "une erreur est survenue",
  "internal server error",
  "something went wrong",
  "erreur de chargement",
  "digest:",
];

/**
 * Libellés de fermeture, acceptés comme issue d'une modale.
 * Sert à trouver le bouton qui referme une surface, et à qualifier l'issue
 * d'un test de fermeture.
 */
const MOTIF_FERMETURE = /^(fermer|annuler|retour|plus tard|non|quitter)/i;

/**
 * Contournement d'un bug Playwright/Chromium : sans écoute réseau active, les
 * `fetch` exécutés dans la page contre un serveur standalone échouent avec
 * « Failed to fetch » (socket keep-alive fermée côté serveur et réutilisée).
 * Activer l'écoute `response` force Playwright à piloter le réseau via CDP.
 */
function instrumenterReseau(page) {
  page.on("response", () => {});
  page.on("requestfailed", () => {});
}

/**
 * Trace d'étape horodatée.
 *
 * POURQUOI : un audit complet dure des dizaines de minutes. Sans repère
 * temporel, impossible de distinguer « c'est long » de « c'est bloqué » — le
 * premier symptôme d'un serveur qui ne répond plus étant précisément un silence
 * prolongé. Chaque étape est donc datée, et la durée écoulée affichée.
 */
const T0 = Date.now();
function etape(message) {
  const ecoule = ((Date.now() - T0) / 1000).toFixed(1).padStart(6);
  console.log(`[${ecoule}s] ${message}`);
}

/** Rejoue une évaluation si la navigation a détruit le contexte d'exécution. */
async function evaluerAvecReprise(page, fn, donnees, tentatives = 4) {
  let derniere;
  for (let i = 0; i < tentatives; i++) {
    try {
      return await page.evaluate(fn, donnees);
    } catch (e) {
      derniere = e;
      etape(`évaluation à reprendre (${i + 1}/${tentatives}) : ${String(e).split("\n")[0].slice(0, 90)}`);
      await page.waitForTimeout(1500 * (i + 1));
    }
  }
  throw derniere;
}

/**
 * Motif d'URL acceptable après connexion : toutes les routes d'accueil
 * possibles, reprises de `tests/e2e/fixtures.ts` — l'application redirige vers
 * un espace différent selon le rôle (secrétariat, infirmerie, direction…), et
 * c'est le routeur qui décide.
 */
const POST_LOGIN_URL =
  /\/(dashboard|direction|mon-espace|ma-classe|parent|eleve|vie-scolaire|secretariat|conseiller|infirmerie|comptabilite|ma-matiere|exploitation|inspection|select-tenant|super-admin|acces-bloque)/;

/**
 * Ouvre une session en pilotant LE VRAI FORMULAIRE de connexion.
 *
 * POURQUOI PAS UN POST DIRECT — c'est le piège de ce projet, et il a coûté
 * deux tentatives :
 * `POST /api/auth/callback/credentials` sans jeton Turnstile est REJETÉ en
 * production (HTTP 302 → `/login?error=CredentialsSignin&code=erreur_turnstile`),
 * parce que `TURNSTILE_SECRET` est déployé sur Fly. Le jeton est produit par le
 * widget Cloudflare, qui n'existe que dans le navigateur — un `fetch` nu ne
 * peut donc pas s'authentifier contre la production. Le formulaire, lui,
 * fonctionne partout (`tests/e2e/fixtures.ts` emprunte le même chemin).
 */
async function connecter(context, codeTotp) {
  const page = await context.newPage();
  instrumenterReseau(page);

  // ─── Connexion manuelle : l'humain franchit l'anti-bot ───────────────────
  if (connexionManuelle) {
    await page
      .goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 })
      .catch(() => {});
    console.log(
      "\n  ┌────────────────────────────────────────────────────────────────┐\n" +
        "  │  CONNEXION MANUELLE                                            │\n" +
        "  │                                                                │\n" +
        "  │  Le navigateur est ouvert sur la page de connexion.            │\n" +
        "  │  Saisissez vos identifiants, puis validez.                     │\n" +
        "  │  L'audit démarre tout seul dès que la session est ouverte.     │\n" +
        "  │                                                                │\n" +
        "  │  Compte prévu pour l'audit :                                   │\n" +
        `  │    ${EMAIL}\n` +
        "  │    (n'importe quel compte administrateur convient)             │\n" +
        "  │                                                                │\n" +
        "  │  Durée maximale d'attente : 10 minutes.                        │\n" +
        "  └────────────────────────────────────────────────────────────────┘\n",
    );
    try {
      // Attente longue : la saisie et un éventuel défi anti-bot prennent du
      // temps humain. On surveille l'URL plutôt que le formulaire, car c'est
      // le routeur qui décide de l'écran d'accueil selon le rôle.
      await page.waitForURL(POST_LOGIN_URL, { timeout: 600_000 });
    } catch {
      throw new Error(
        `Aucune connexion détectée après 10 minutes (URL restée sur ${new URL(page.url()).pathname}).`,
      );
    }
    etape(`session ouverte manuellement → ${new URL(page.url()).pathname}`);
    await page.close();
    return;
  }

  etape(`ouverture de ${BASE}/login`);
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } catch (e) {
    throw new Error(`Page de connexion injoignable : ${String(e).split("\n")[0].slice(0, 160)}`);
  }
  etape("page chargée, attente de stabilisation");
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  try {
    await page.waitForSelector('input[type="email"]', { timeout: 30_000 });
  } catch {
    throw new Error(
      "Formulaire de connexion introuvable — l'application a-t-elle redirigé vers un autre écran ?",
    );
  }
  etape("formulaire prêt, attente de l'hydratation React");

  /**
   * Attendre que React ait attaché ses gestionnaires avant de saisir.
   *
   * POURQUOI — un remplissage trop précoce est silencieusement perdu :
   * `fill` pose bien la valeur dans le DOM, mais si l'hydratation n'a pas eu
   * lieu, le `onChange` n'existe pas encore et l'état du formulaire reste vide.
   * La soumission répond alors « Email invalide » alors que le champ est rempli
   * — un échec incompréhensible, qui ne dépend ni du compte ni du mot de passe.
   *
   * Le signal retenu est le widget Turnstile : il n'est monté qu'après
   * hydratation (le composant rend `null` au premier passage serveur). À défaut
   * de sitekey, on se contente d'une attente courte.
   */
  await page
    .waitForFunction(
      () => typeof window.turnstile !== "undefined" || !!document.querySelector('iframe[src*="challenges.cloudflare.com"]'),
      { timeout: 20_000 },
    )
    .catch(() => page.waitForTimeout(2_000));

  /** Remplit les deux champs, en cliquant d'abord pour que React voie la saisie. */
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
  etape("identifiants saisis");

  // Le défi Turnstile est invisible mais ASYNCHRONE. Un premier clic peut
  // tomber avant que le jeton soit prêt : le formulaire affiche alors
  // « vérification en cours » et s'arrête sans erreur. On réessaie donc
  // jusqu'à ce que la navigation parte réellement — en RE-SAISISSANT à chaque
  // tour, car une tentative rejetée par la validation vide l'état du formulaire.
  let derniereErreur = "";
  for (let tentative = 1; tentative <= 8; tentative++) {
    await page.click('button[type="submit"]').catch(() => {});
    try {
      await page.waitForURL(POST_LOGIN_URL, { timeout: 8_000 });
      etape(`session ouverte (tentative ${tentative}) → ${new URL(page.url()).pathname}`);
      await page.close();
      return;
    } catch {
      // Second facteur réclamé : sans code, l'audit ne peut pas se poursuivre.
      if (await page.locator("#totp").count()) {
        if (!codeTotp) {
          throw new Error(
            "Second facteur requis pour ce compte — relancer avec --totp <code> " +
              "(le code TOTP change toutes les 30 s).",
          );
        }
        await page.fill("#totp", codeTotp);
        etape("code TOTP soumis");
        continue;
      }
      const message = await page
        .locator("[data-sonner-toast], [role='status'], .text-destructive")
        .first()
        .textContent()
        .catch(() => "");
      derniereErreur = (message || "").trim() || derniereErreur;
      await page.waitForTimeout(2_000);
      await saisirIdentifiants();
    }
  }

  throw new Error(
    `Connexion refusée après 8 tentatives pour ${EMAIL} sur ${BASE}` +
      (derniereErreur ? ` — message affiché : « ${derniereErreur.slice(0, 160)} »` : ""),
  );
}

/**
 * Toutes les routes du tableau de bord, lues sur le disque.
 *
 * Le menu est un dock qui ouvre des iframes : il n'expose pas d'`<a href>` à
 * relever. La liste des écrans vient donc de l'arborescence
 * `src/app/(dashboard)`, et c'est le serveur qui dira, par une redirection vers
 * `/acces-bloque`, ce que le rôle n'a pas le droit d'ouvrir.
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

/**
 * Bascule le rôle actif, puis vérifie la bascule par une navigation.
 *
 * Le POST seul ne suffit pas comme preuve : le cookie de session doit avoir été
 * re-encodé pour que la bascule prenne effet. On rouvre donc `/dashboard` et on
 * relève le rôle tel que le serveur le voit — c'est le seul contrôle fiable.
 */
async function basculerRole(page, role) {
  // Se poser d'abord sur un écran stable : un `fetch` lancé pendant une
  // navigation voit son contexte d'exécution disparaître sous ses pieds.
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  const statut = await evaluerAvecReprise(
    page,
    async ({ base, role }) => {
      const r = await fetch(`${base}/api/switch-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      return r.status;
    },
    { base: BASE, role },
  );
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1200);
  etape(`rôle basculé vers ${role} (HTTP ${statut})`);
}

/**
 * Renvoie le tableau de bord à un état propre : la racine du bureau, sans
 * fenêtre ouverte. Les écrans audités s'ouvrent ensuite par URL directe, ce qui
 * évite qu'un onglet laissé ouvert par l'écran précédent ne fausse le suivant.
 */
async function retourAuBureau(page) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
}

/**
 * GARDE-FOU RÉSEAU — la garantie « lecture seule », posée au niveau du réseau.
 *
 * POURQUOI CE CHOIX
 * Une liste de libellés interdits (« Enregistrer », « Supprimer »…) ne peut pas
 * être exhaustive : « Importer Excel » ouvre bel et bien une modale, mais un
 * audit qui refuse de le cliquer ne verra jamais cette modale. À l'inverse,
 * cliquer tout à l'aveugle sur une base de production est inacceptable.
 *
 * Le blocage des méthodes non-GET tranche les deux problèmes d'un coup :
 *   • toute écriture est interceptée AVANT d'atteindre le serveur, y compris
 *     celles déclenchées par un Server Action que le HTML ne laisse pas voir ;
 *   • cliquer devient sans conséquence, donc chaque bouton peut être testé et
 *     chaque modale découverte.
 *
 * Ce que le blocage interrompt, en revanche, c'est une modale qui chargerait ses
 * données par POST. Le rapport le signale (`requetesBloquees`) pour qu'on ne
 * confonde pas « modale cassée » et « modale qu'on a empêché d'aller au bout ».
 */
async function bloquerEcritures(page) {
  await page.route("**/*", (route) => {
    const methode = route.request().method();
    if (methode === "GET" || methode === "HEAD" || methode === "OPTIONS") {
      route.continue();
    } else {
      route.abort("blockedbyclient");
    }
  });
}

/** Retire le garde-fou — utilisé avant les appels d'authentification. */
async function retirerBlocage(page) {
  await page.unroute("**/*");
}

/**
 * Pré-chauffage : visite chaque écran en parallèle, sans aucune analyse.
 *
 * POURQUOI CE MODE EXISTE
 * Sur un serveur de développement, Next.js compile une route à sa PREMIÈRE
 * requête — une quarantaine de secondes pour les écrans lourds. Payer ce coût
 * séquentiellement pendant l'audit ajoute près d'une heure à la campagne, sans
 * rien apprendre : ce temps ne mesure pas l'application, il mesure le compilateur.
 *
 * En visitant les écrans par paquets, on compile en parallèle ; l'audit qui suit
 * ne voit plus que des pages déjà compilées. Le mode est inutile contre un
 * serveur de production, où les routes sont pré-compilées par le build.
 */
async function prechauffer(context, routes, paralleles = 4) {
  console.log(`Préchauffage de ${routes.length} écrans (${paralleles} en parallèle)\n`);
  const files = Array.from({ length: paralleles }, () => null);
  let suivant = 0;

  const travailler = async (index) => {
    const page = await context.newPage();
    instrumenterReseau(page);
    while (suivant < routes.length) {
      const href = routes[suivant++];
      const t0 = Date.now();
      await page
        .goto(`${BASE}${href}?embedded=1`, { waitUntil: "domcontentloaded", timeout: 180_000 })
        .catch(() => {});
      console.log(`  ✓ ${href.padEnd(28)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    await page.close();
  };

  await Promise.all(files.map((_, i) => travailler(i)));
  console.log("\nPréchauffage terminé — relancer l'audit sans ce mode.\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// SONDES DOM — exécutées dans la page, donc autonomes (aucune closure).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nom accessible approximatif : `aria-label`, sinon `title`, sinon le texte.
 * C'est l'ordre de résolution de la spécification ACCNAME pour un bouton sans
 * contenu textuel visible (icône + `<span class="sr-only">`).
 */
const SONDE_NOM = (el) =>
  (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

const SONDE_VISIBLE = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
};

/** Inventaire des contrôles d'un écran. */
const RELEVER_CONTROLES = () => {
  const nom = (el) =>
    (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };

  const racine = document.querySelector("main") ?? document.body;
  const selecteurBouton = 'button, [role="button"], input[type="submit"], input[type="button"]';

  return {
    boutons: Array.from(racine.querySelectorAll(selecteurBouton))
      .filter(visible)
      .map((el) => ({
        nom: nom(el),
        desactive: el.disabled === true || el.getAttribute("aria-disabled") === "true",
        ouvreModale: el.getAttribute("aria-haspopup") === "dialog",
        type: el.getAttribute("type") || null,
      })),
    liens: Array.from(racine.querySelectorAll("a[href]"))
      .filter(visible)
      .map((el) => ({
        nom: nom(el),
        href: el.getAttribute("href"),
        interdit: el.getAttribute("aria-disabled") === "true",
        nouvelOnglet: el.getAttribute("target") === "_blank",
      })),
    champs: Array.from(racine.querySelectorAll("input, textarea, select"))
      .filter(visible)
      .map((el) => ({
        nom: el.getAttribute("aria-label") || el.getAttribute("name") || el.id || "",
        type:
          el.tagName.toLowerCase() === "input"
            ? el.getAttribute("type") || "text"
            : el.tagName.toLowerCase(),
        requis: el.required === true || el.getAttribute("aria-required") === "true",
        desactive: el.disabled === true,
      })),
    onglets: Array.from(document.querySelectorAll('[role="tab"]')).map((el, index) => ({
      index,
      libelle: nom(el),
      selectionne: el.getAttribute("aria-selected") === "true",
    })),
  };
};

/** Contenu de la modale ouverte au premier plan.
 *
 * ⚠️ Signature `(racine, selecteur)` : Playwright appelle une fonction passée à
 * `locator.evaluate` avec L'ÉLÉMENT en premier argument, la valeur transmise en
 * second. Une signature `(selecteur)` recevait donc le nœud DOM et le passait à
 * `querySelectorAll`, d'où l'erreur « [object HTMLDivElement] is not a valid
 * selector ».
 */
const RELEVER_MODALE = (racine, selecteur) => {
  const nom = (el) =>
    (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };

  const dialogues = Array.from(document.querySelectorAll(selecteur));
  // `racine` est déjà la modale au premier plan : la reprendre évite un
  // désaccord si le DOM a changé entre la localisation et l'évaluation.
  const d = racine ?? dialogues[dialogues.length - 1];
  if (!d) return { erreur: "aucune modale ouverte" };

  const boutons = Array.from(d.querySelectorAll('button, [role="button"]'))
    .filter(visible)
    .map((el, i) => ({
      i,
      nom: nom(el),
      desactive: el.disabled === true,
      iconeX: !!el.querySelector('svg[class*="lucide-x"]'),
      type: el.getAttribute("type") || null,
    }));

  const champs = Array.from(d.querySelectorAll("input, textarea, select"))
    .filter(visible)
    .map((el) => ({
      nom: el.getAttribute("aria-label") || el.getAttribute("name") || el.id || "",
      type:
        el.tagName.toLowerCase() === "input"
          ? el.getAttribute("type") || "text"
          : el.tagName.toLowerCase(),
      requis: el.required === true || el.getAttribute("aria-required") === "true",
    }));

  return {
    nbDialogues: dialogues.length,
    // Une modale maison (`fixed inset-0` sans `role="dialog"`) est un défaut
    // d'accessibilité en soi : le lecteur d'écran ne l'annonce pas comme telle
    // et le focus clavier peut s'échapper derrière. On le relève.
    sansRole: !d.hasAttribute("role"),
    titre: nom(d.querySelector('[role="heading"], h1, h2, h3') ?? d).slice(0, 120),
    boutons,
    champs,
    onglets: Array.from(d.querySelectorAll('[role="tab"]')).map((el) => nom(el)),
    texte: (d.innerText || "").replace(/\s+/g, " ").trim().slice(0, 300),
  };
};

/** Texte, volume et marqueurs d'erreur de la page, hors chrome du bureau. */
const RELEVER_PAGE = (marqueurs) => {
  const main = document.querySelector("main") ?? document.body;
  const texte = (main.innerText || "").replace(/\s+/g, " ").trim();
  const bas = texte.toLowerCase();
  return {
    taille: texte.length,
    lignes: main.querySelectorAll("tbody tr").length,
    extrait: texte.slice(0, 220),
    titre: (document.querySelector("h1")?.textContent || "").trim().slice(0, 120),
    // Un écran vide n'est pas une erreur : c'est un état à documenter.
    vide: !/[0-9]/.test(texte) && texte.length < 400,
    erreurs: marqueurs.filter((m) => bas.includes(m)),
  };
};

/**
 * Marque les calques DÉJÀ présents avant le clic.
 *
 * POURQUOI CE MARQUAGE
 * Le projet contient des modales « maison » — des `div` en `position: fixed`
 * couvrant l'écran, sans `role="dialog"` (voir la note de l'audit du
 * 2026-09-11 : une vingtaine). Les chercher par `role` les manquerait toutes.
 * Les chercher par géométrie seule remonterait aussi le dock, le menu latéral
 * et les superpositions permanentes du bureau à fenêtres.
 *
 * La soustraction « calques présents avant / calques présents après » tranche :
 * ce qui apparaît entre les deux EST ce que le clic a ouvert. Rien à deviner sur
 * le framework, la convention de nommage ou la structure du composant.
 */
const MARQUER_CALQUES_EXISTANTS = () => {
  const vw = innerWidth;
  const vh = innerHeight;
  let n = 0;
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "absolute") continue;
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.1) continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.4 || r.height < vh * 0.3) continue;
    el.setAttribute("data-audit-avant", "1");
    n++;
  }
  return n;
};

/**
 * Marque la modale ouverte par le clic et renvoie sa description.
 *
 * Ordre de préférence : un vrai dialogue accessible d'abord (Radix, `<dialog>`),
 * un calque apparu depuis le marquage ensuite. C'est ce marquage temporaire
 * (`data-audit-modal`) qui sert ensuite de sélecteur stable : l'élément peut
 * n'avoir ni `role`, ni `id`, ni classe distinctive.
 */
const TROUVER_NOUVELLE_MODALE = () => {
  document.querySelectorAll("[data-audit-modal]").forEach((e) => e.removeAttribute("data-audit-modal"));

  const accessible = Array.from(
    document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]'),
  ).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (accessible.length) {
    const d = accessible[accessible.length - 1];
    d.setAttribute("data-audit-modal", "1");
    return { origine: "role-dialog", classe: String(d.className).slice(0, 100) };
  }

  // Surfaces Radix positionnées (Popover, Select, Dropdown) : plus petites qu'une
  // modale, donc invisibles pour le filtre géométrique ci-dessous, mais bien
  // réelles — et elles bloquent les clics tant qu'elles sont ouvertes.
  const radix = Array.from(
    document.querySelectorAll('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]'),
  ).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (radix.length) {
    const d = radix[radix.length - 1];
    d.setAttribute("data-audit-modal", "1");
    return {
      origine: "surface-radix",
      classe: String(d.className).slice(0, 100),
      role: d.getAttribute("role"),
    };
  }

  const vw = innerWidth;
  const vh = innerHeight;
  const nouveaux = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.hasAttribute("data-audit-avant")) continue;
    // Un calque enfant d'un calque préexistant appartient au chrome du bureau.
    if (el.parentElement && el.parentElement.closest("[data-audit-avant]")) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "absolute") continue;
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.1) continue;
    if (el.closest("nav, aside, header, footer")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.4 || r.height < vh * 0.3) continue;
    if (!el.querySelector("button, input, textarea, select, [role='button']")) continue;
    nouveaux.push(el);
  }
  const cible = nouveaux[nouveaux.length - 1];
  if (!cible) {
    document.querySelectorAll("[data-audit-avant]").forEach((e) => e.removeAttribute("data-audit-avant"));
    return null;
  }
  cible.setAttribute("data-audit-modal", "1");
  return { origine: "calque-maison", classe: String(cible.className).slice(0, 100) };
};

/** Nettoie les marquages temporaires d'un écran. */
const NETTOYER_MARQUAGES = () => {
  for (const el of document.querySelectorAll("[data-audit-modal], [data-audit-avant]")) {
    el.removeAttribute("data-audit-modal");
    el.removeAttribute("data-audit-avant");
  }
};

/**
 * Actions TERMINALES : celles qui, dans la quasi-totalité des interfaces,
 * confirment une opération irréversible ou envoient quelque chose.
 *
 * Même avec le garde-fou réseau, on ne les clique pas : un bouton « Payer » ou
 * « Envoyer » peut produire un effet hors HTTP (impression, e-mail mis en file,
 * impression PDF) qu'aucun blocage de requête n'arrêterait. Le garde-fou est la
 * ceinture ; cette liste est les bretelles.
 */
const MOTIF_TERMINAL =
  /^(enregistrer|sauvegarder|supprimer|effacer|valider|confirmer|envoyer|soumettre|publier|payer|encaisser|réinitialiser|clôturer|archiver|désactiver|activer|notifier|générer|terminer|exporter)/i;

/**
 * Inventaire de TOUS les boutons de l'écran, avec leur état.
 *
 * Le dock et le menu latéral sont exclus : les cliquer quitterait l'écran
 * audité. On s'en tient au contenu, `main` s'il existe.
 */
const INVENTORIER_BOUTONS = (motifTerminal) => {
  const terminal = new RegExp(motifTerminal, "i");
  const nom = (el) =>
    (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 70);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };

  const racine = document.querySelector("main") ?? document.body;
  return Array.from(
    racine.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]'),
  )
    .filter(visible)
    .map((el) => ({
      nom: nom(el),
      desactive: el.disabled === true || el.getAttribute("aria-disabled") === "true",
      terminal: terminal.test(nom(el)),
      /**
       * Bouton de sélection déjà retenu.
       *
       * Un filtre actif (« Toutes les classes », « Campus Ambouli ») recliqué
       * ne change rien à l'écran — c'est le comportement ATTENDU, pas un bouton
       * mort. Sans ce drapeau, l'audit signalerait comme « sans effet » tous les
       * filtres par défaut, qui sont précisément ceux qui sont déjà appliqués.
       */
      actif:
        el.getAttribute("aria-pressed") === "true" ||
        el.getAttribute("aria-selected") === "true" ||
        el.getAttribute("data-state") === "on" ||
        /(?:^|\s)(bg-primary|bg-navy|text-white)(?:\s|$)/.test(String(el.className)),
    }))
    // Sans libellé, aucun sélecteur n'est possible pour le retrouver au moment
    // du clic : le bouton est recensé comme « sans nom » par les contrôles,
    // mais pas testé ici.
    .filter((b) => b.nom);
};

/**
 * Empreinte du contenu visible, hors chrome du bureau.
 *
 * POURQUOI UNE EMPREINTE, ET PAS SEULEMENT UNE MODALE
 * Beaucoup de boutons agissent sans ouvrir de surface ni changer d'URL : un
 * filtre réduit la liste, un niveau déplie ses classes, un accordéon révèle du
 * texte. Sans cette empreinte, le rapport les déclarerait « sans effet » — un
 * faux positif sur des boutons parfaitement fonctionnels.
 *
 * Le condensé est volontairement fruste (longueur + début + fin) : il doit
 * détecter qu'un contenu a changé, pas dire comment.
 */
const EMPREINTE_ECRAN = () => {
  const main = document.querySelector("main") ?? document.body;
  const texte = (main.innerText || "").replace(/\s+/g, " ").trim();
  return `${texte.length}|${texte.slice(0, 160)}|${texte.slice(-160)}`;
};

/**
 * Marque le bouton à cliquer, identifié par son libellé.
 *
 * POURQUOI UN MARQUAGE REFait À CHAQUE BOUTON
 * Un marquage posé une fois pour toutes ne survit pas au premier clic : React
 * re-rend l'écran et retire les attributs qu'il ne connaît pas. Le bouton
 * suivant pointait alors vers un nœud détaché du DOM, et Playwright attendait
 * indéfiniment — c'est l'origine des `locator.click: Timeout` en cascade.
 * On réinventorie donc l'écran juste avant chaque clic, et on marque l'élément
 * frais avec un attribut dédié (`data-audit-cible`).
 *
 * @returns le libellé effectivement marqué, ou `null` si le bouton a disparu.
 */
const MARQUER_BOUTON_PAR_NOM = ({ nom, motifTerminal, rang }) => {
  document.querySelectorAll("[data-audit-cible]").forEach((e) => e.removeAttribute("data-audit-cible"));

  const terminal = new RegExp(motifTerminal, "i");
  const lireNom = (el) =>
    (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 70);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };

  const racine = document.querySelector("main") ?? document.body;
  // Même filtre que l'inventaire : l'ordre et le contenu restent comparables.
  const candidats = Array.from(
    racine.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]'),
  )
    .filter(visible)
    .filter((el) => lireNom(el) === nom)
    .filter((el) => !terminal.test(lireNom(el)));

  const cible = candidats[rang ?? 0];
  if (!cible) return null;
  cible.setAttribute("data-audit-cible", "1");
  return lireNom(cible);
};

/** Retire les marquages de boutons posés pour l'audit. */
const NETTOYER_BOUTONS = () => {
  document.querySelectorAll("[data-audit-btn], [data-audit-cible]").forEach((e) => {
    e.removeAttribute("data-audit-btn");
    e.removeAttribute("data-audit-cible");
  });
};

/**
 * Vérifie UN bouton : que fait-il vraiment quand on le clique ?
 *
 * C'est le cœur de la demande — « tous les boutons sont là et donnent la bonne
 * réponse ». Un bouton peut être présent et mort : gestionnaire absent, cible
 * inexistante, action silencieusement désactivée. Seul le clic le révèle.
 *
 * Quatre issues possibles, distinguées par ce qui change à l'écran :
 *   • `modale`      — une surface s'ouvre : on l'inspecte et on la referme ;
 *   • `navigation`  — l'URL change : on revient en arrière ;
 *   • `sansEffet`   — rien ne change : à signaler, c'est peut-être un bouton mort ;
 *   • `erreur`      — exception au clic.
 */
async function auditerBouton(page, nom, rang = 0) {
  const res = { declencheur: nom, rang, ouverte: false };
  const urlAvant = page.url();
  /** Sélecteur stable, (re)posé juste avant le clic. */
  const cible = () => page.locator('[data-audit-cible="1"]');

  /** Remarque l'élément frais, puis clique. Renvoie false s'il a disparu. */
  const marquerEtCliquer = async () => {
    const marque = await page.evaluate(MARQUER_BOUTON_PAR_NOM, {
      nom,
      motifTerminal: MOTIF_TERMINAL.source,
      rang,
    });
    if (!marque) {
      // Le bouton a disparu depuis l'inventaire initial. Ce n'est PAS un défaut :
      // sur `/absences`, cliquer « Collège(24) » masque les classes de lycée et
      // fait donc disparaître « Lycée(26) ». Le distinguer d'un vrai échec évite
      // de noyer le rapport sous les faux positifs.
      throw new ErreurBoutonDisparu("bouton absent de l'écran au moment du test");
    }
    try {
      await cible().scrollIntoViewIfNeeded().catch(() => {});
      await cible().click({ timeout: 8_000 });
    } catch (e) {
      // Repli : certains boutons sont clippés dans un conteneur à défilement
      // horizontal, et Playwright ne peut pas les amener dans la zone visible.
      // Un clic DOM (`.click()`) déclenche le gestionnaire React de la même
      // façon qu'un clic réel, sans exiger les contrôles d'actionnabilité.
      const fait = await page
        .evaluate(() => {
          const el = document.querySelector('[data-audit-cible="1"]');
          if (!el) return false;
          el.click();
          return true;
        })
        .catch(() => false);
      if (!fait) throw e;
      res.clicDom = true;
    }
  };

  try {
    await page.evaluate(MARQUER_CALQUES_EXISTANTS);
    const empreinteAvant = await page.evaluate(EMPREINTE_ECRAN).catch(() => "");
    await marquerEtCliquer();
    await page.waitForTimeout(700);

    const trouvaille = await page.evaluate(TROUVER_NOUVELLE_MODALE);

    if (!trouvaille) {
      // Le clic n'a ouvert aucune surface. Reste à savoir s'il a changé le
      // contenu (filtre, dépliage, tri), navigué, ou s'il n'a réellement rien
      // fait — en laissant au rendu le temps d'aboutir.
      const { url: urlApres } = await attendreEffet(page, urlAvant, empreinteAvant);
      if (urlApres !== urlAvant) {
        res.navigation = urlApres;
        await page.goBack({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(500);
      } else {
        const empreinteApres = await page.evaluate(EMPREINTE_ECRAN).catch(() => empreinteAvant);
        if (empreinteApres !== empreinteAvant) {
          res.effetContenu = true;
        } else {
          res.sansEffet = true;
        }
      }
      return res;
    }

    res.ouverte = true;
    res.origine = trouvaille.origine;
    res.contenu = await page
      .locator(SELECTEUR_MODALE)
      .last()
      .evaluate(RELEVER_MODALE, SELECTEUR_MODALE);
    res.contenu.actions = res.contenu.boutons.map((b) => ({
      nom: b.nom,
      nature: MOTIF_TERMINAL.test(b.nom)
        ? "terminale (non cliquée)"
        : MOTIF_FERMETURE.test(b.nom)
          ? "fermeture"
          : "autre (non cliquée)",
    }));

    try {
      await fermerModale(page, true);
      res.fermeeParCroix = true;
    } catch (e) {
      res.fermeeParCroix = false;
      res.erreurCroix = String(e).split("\n")[0].slice(0, 160);
      await fermerTout(page);
    }

    if (res.fermeeParCroix) {
      try {
        await page.evaluate(MARQUER_CALQUES_EXISTANTS);
        await marquerEtCliquer();
        await page.waitForTimeout(700);
        await page.evaluate(TROUVER_NOUVELLE_MODALE);
        await page.locator(SELECTEUR_MODALE).last().waitFor({ state: "visible", timeout: 8_000 });
        await fermerModale(page, false);
        res.fermeeParEchap = true;
      } catch (e) {
        res.fermeeParEchap = false;
        res.erreurEchap = String(e).split("\n")[0].slice(0, 160);
        await fermerTout(page);
      }
    }
  } catch (e) {
    // Une disparition n'est pas un échec du bouton : elle doit remonter à la
    // campagne, qui la recense à part. Sans ce relais, elle serait enregistrée
    // comme « erreur au clic » — 124 faux positifs sur une seule campagne.
    if (e instanceof ErreurBoutonDisparu || /ErreurBoutonDisparu/.test(String(e))) throw e;
    res.erreur = String(e).split("\n")[0].slice(0, 200);
    await fermerTout(page);
  } finally {
    await page.evaluate(NETTOYER_MARQUAGES).catch(() => {});
    // `recharger: true` — dernier recours si une modale ne se ferme par aucun
    // moyen : sans cela, son voile bloquerait tous les boutons suivants.
    await fermerTout(page, { recharger: true });
  }

  // Deux boutons peuvent porter le même libellé (pagination, filtres répétés) :
  // réauditer le second donnerait un verdict identique. On ne conserve que le
  // premier, le rapport mentionnant le doublon.
  return res;
}

/**
 * Détermine si un libellé apparaît plusieurs fois à l'écran.
 *
 * Sert à distinguer « un bouton sans effet » de « la 2e occurrence d'un bouton
 * dont la 1re a un effet » : sans cela, un filtre répété serait signalé comme
 * cassé alors qu'il fonctionne.
 */
const COMPTER_OCCURRENCES = (nom) => {
  const lireNom = (el) =>
    (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 70);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const racine = document.querySelector("main") ?? document.body;
  return Array.from(racine.querySelectorAll("button, [role='button']"))
    .filter(visible)
    .filter((el) => lireNom(el) === nom).length;
};

/**
 * Borne une promesse dans le temps.
 *
 * POURQUOI CE GARDE-TEMPS
 * Un clic peut bloquer la page sans jamais échouer : `window.print()` gèle le
 * moteur de rendu en mode headless, une navigation vers un téléchargement ne se
 * termine pas, un `confirm()` natif attend une réponse. Dans ces cas, aucun des
 * `timeout` de Playwright ne se déclenche — l'audit s'arrête et ne dit rien.
 * Envelopper chaque test de bouton rend ce scénario impossible : l'audit
 * rapporte « délai dépassé » et poursuit.
 */
async function avecDelai(promesse, ms, etiquette) {
  let minuteur;
  try {
    return await Promise.race([
      promesse,
      new Promise((_, rejeter) => {
        minuteur = setTimeout(() => rejeter(new Error(`délai de ${ms} ms dépassé (${etiquette})`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(minuteur);
  }
}

/** Échappe un libellé pour l'insérer dans une expression régulière. */
function echapper(texte) {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Attend qu'un clic produise un effet, en sondant plutôt qu'en dormant.
 *
 * POURQUOI SONDER
 * Une navigation client (App Router) n'est pas synchrone : elle part après le
 * clic et le rendu suit. Accorder une durée fixe donnait des verdicts
 * incohérents — sur `/notes`, des boutons identiques étaient classés tantôt
 * « navigation », tantôt « sans effet » selon que le rendu avait eu le temps
 * d'aboutir. Le sondage supprime cette loterie : on conclut « sans effet »
 * seulement après avoir réellement constaté l'absence de changement.
 */
async function attendreEffet(page, urlAvant, empreinteAvant, budgetMs = 3_000) {
  const echeance = Date.now() + budgetMs;
  let url = urlAvant;
  let empreinte = empreinteAvant;

  while (Date.now() < echeance) {
    url = page.url();
    if (url !== urlAvant) return { url, empreinte };
    empreinte = await page.evaluate(EMPREINTE_ECRAN).catch(() => empreinte);
    if (empreinte !== empreinteAvant) return { url, empreinte };
    await page.waitForTimeout(250);
  }
  return { url, empreinte };
}

/**
 * Ramène l'écran à un état utilisable après un test de bouton.
 *
 * POURQUOI CE NETTOYAGE EST INDISPENSABLE
 * Une modale qui ne se ferme pas laisse son voile en place : plus rien n'est
 * cliquable derrière, et TOUS les boutons suivants échouent en `click timeout`.
 * Le rapport accuserait alors des boutons sains — un faux positif en cascade.
 * On essaie donc successivement : la croix, un libellé de fermeture, Échap, puis
 * un rechargement. Ce dernier recours est sûr : sous garde-fou réseau, un
 * rechargement est un GET, donc sans effet sur les données.
 */
async function fermerTout(page, { recharger = false } = {}) {
  for (let i = 0; i < 3; i++) {
    const nb = await page.locator(SELECTEUR_MODALE).count().catch(() => 0);
    if (nb === 0) return;

    const modale = page.locator(SELECTEUR_MODALE).last();
    const croix = modale.locator('button:has(svg[class*="lucide-x"])');
    const libelle = modale.getByRole("button", { name: /^(fermer|annuler|retour|plus tard|quitter|non)/i });
    if (await croix.count().catch(() => 0)) {
      await croix.first().click({ timeout: 3_000 }).catch(() => {});
    } else if (await libelle.count().catch(() => 0)) {
      await libelle.first().click({ timeout: 3_000 }).catch(() => {});
    }
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);
  }

  // Toujours ouverte : l'écran est inutilisable. On repart de zéro plutôt que
  // de produire une cascade de faux échecs.
  if (recharger && (await page.locator(SELECTEUR_MODALE).count().catch(() => 0)) > 0) {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1_000);
  }
}

/**
 * Erreur signalant qu'un bouton a disparu de l'écran avant son test.
 *
 * Distincte d'un échec : elle traduit un changement d'état légitime provoqué par
 * le test précédent (un filtre qui masque une section). Le bouton existait bien
 * à l'inventaire ; la campagne le recense comme « non testé » plutôt que comme
 * cassé.
 */
class ErreurBoutonDisparu extends Error {
  constructor(message) {
    super(message);
    this.name = "ErreurBoutonDisparu";
  }
}

/**
 * Passe en revue tous les boutons de l'écran.
 *
 * Les boutons terminaux (« Enregistrer », « Supprimer »…) sont recensés mais
 * jamais cliqués, même si le garde-fou réseau intercepte déjà leurs écritures :
 * leur effet peut dépasser le HTTP (impression, e-mail, PDF).
 */
async function auditerBoutonsDeLEcran(page, maxBoutons) {
  const boutons = await page.evaluate(INVENTORIER_BOUTONS, MOTIF_TERMINAL.source);
  const resultats = [];
  const dejaVu = new Set();
  let cliques = 0;

  for (const b of boutons) {
    if (b.terminal) {
      resultats.push({ declencheur: b.nom, terminal: true, nonClique: true });
      continue;
    }
    if (b.desactive) {
      resultats.push({ declencheur: b.nom, desactive: true, nonClique: true });
      continue;
    }
    if (dejaVu.has(b.nom)) continue;
    if (cliques >= maxBoutons) {
      resultats.push({ declencheur: b.nom, nonClique: true, raison: "au-delà du plafond" });
      continue;
    }
    cliques++;
    etape(`  bouton ${cliques}/${Math.min(boutons.length, maxBoutons)} « ${b.nom} »`);
    let res;
    try {
      res = await avecDelai(auditerBouton(page, b.nom), 25_000, `bouton ${b.nom}`);
      // Un `sansEffet` mérite un contrôle : si le même libellé existe en
      // plusieurs exemplaires, le second peut légitimement ne rien changer.
      if (res.sansEffet) {
        res.occurrences = await page.evaluate(COMPTER_OCCURRENCES, b.nom).catch(() => 1);
        // Un libellé présent plusieurs fois (une pastille par site, par
        // exemple) : la 1re occurrence peut être inerte parce qu'elle appartient
        // à une section masquée. On teste les suivantes avant de conclure, sinon
        // le rapport accuse un bouton qui fonctionne.
        if (res.occurrences > 1) {
          for (let rang = 1; rang < res.occurrences && res.sansEffet; rang++) {
            etape(`    ↳ occurrence ${rang + 1}/${res.occurrences} du même libellé`);
            const autre = await avecDelai(
              auditerBouton(page, b.nom, rang),
              25_000,
              `bouton ${b.nom} (rang ${rang})`,
            ).catch(() => null);
            if (autre && !autre.sansEffet) {
              res.sansEffet = false;
              res.viaOccurrence = rang;
              Object.assign(res, {
                ouverte: autre.ouverte,
                origine: autre.origine,
                contenu: autre.contenu,
                navigation: autre.navigation,
                effetContenu: autre.effetContenu,
                fermeeParCroix: autre.fermeeParCroix,
                fermeeParEchap: autre.fermeeParEchap,
              });
            }
          }
        }
        // Recliquer un filtre déjà actif ne change rien : verdict attendu.
        res.dejaActif = res.sansEffet && b.actif === true;
      }
    } catch (e) {
      const disparu = e instanceof ErreurBoutonDisparu || /ErreurBoutonDisparu/.test(String(e));
      res = {
        declencheur: b.nom,
        ouverte: false,
        // « Disparu » n'est pas « cassé » : le bouton a été retiré de l'écran par
        // l'effet du test précédent (filtre, bascule de vue). On le recense sans
        // le compter comme un défaut, sinon le rapport serait illisible.
        ...(disparu
          ? { disparuApresAction: true, nonClique: true }
          : { erreur: String(e).split("\n")[0].slice(0, 160) }),
      };
      // La page peut être restée dans un état bloqué : on repart d'une base
      // saine, sinon tous les boutons suivants échouent en cascade.
      await page.keyboard.press("Escape").catch(() => {});
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
    }

    // Retour à l'état initial avant le bouton suivant.
    //
    // POURQUOI — sans cette remise à zéro, chaque test hérite des filtres et des
    // panneaux laissés par le précédent : sur `/absences`, « Collège(24) » masque
    // les classes de lycée, et « Lycée(26) » devenait introuvable — 124 « erreurs »
    // qui n'étaient que des effets de bord. Le rechargement est un GET, donc
    // inoffensif même contre la production ; il rend chaque verdict indépendant.
    if (res.effetContenu || res.navigation || res.ouverte) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(600);
    }

    resultats.push(res);
  }

  await page.evaluate(NETTOYER_BOUTONS).catch(() => {});
  return { resultats, total: boutons.length, cliques };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT DES MODALES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sélecteur des SURFACES au premier plan.
 *
 * Couvre les modales ET les surfaces flottantes légères, qui ne se ressemblent
 * pas mais obéissent au même besoin d'être détectées puis refermées :
 *   • `[role="dialog"]` / `[role="alertdialog"]` — modales Radix ou `<dialog>` ;
 *   • `[role="menu"]` / `[role="listbox"]` — menus déroulants, sélecteurs ;
 *   • `[data-radix-popper-content-wrapper]` — conteneur de tout contenu Radix
 *     positionné (Popover, Select, Dropdown) : c'est le marqueur le plus fiable
 *     du projet, qui n'utilise nulle part `aria-haspopup="dialog"` ;
 *   • `data-audit-modal` — posé par la sonde pour les modales « maison », qui
 *     n'ont ni `role` ni identifiant exploitable.
 *
 * Les oublier faisait deux dégâts : le menu n'était pas testé, et surtout il
 * restait ouvert — son voile bloquait alors tous les boutons suivants, qui
 * étaient signalés « en erreur au clic » à tort.
 */
const SELECTEUR_MODALE =
  '[data-audit-modal], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]';

/** Surfaces légères : un menu ne se referme pas comme une modale. */
const SELECTEUR_SURFACE_LEGERE = '[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]';

/**
 * Referme la modale au premier plan et VÉRIFIE qu'elle l'est.
 *
 * Deux chemins sont essayés séparément parce qu'ils empruntent deux mécanismes
 * différents : la croix passe par le composant de fermeture (donc par React),
 * Échap par le gestionnaire clavier du calque (`DismissableLayer` chez Radix).
 * Un bug peut casser l'un sans l'autre — c'est exactement le genre de défaut
 * qu'on cherche.
 *
 * Pour les modales maison, la croix est souvent une icône sans nom accessible :
 * on la trouve donc par l'icône, puis par un libellé de fermeture, dans cet
 * ordre. Si aucun des deux n'existe, la modale n'est refermable à la souris —
 * on le signale plutôt que de forcer un clic au hasard.
 */
async function fermerModale(page, parCroix) {
  const modale = page.locator(SELECTEUR_MODALE).last();
  // Une surface légère (menu, sélecteur) n'a souvent ni croix ni bouton
  // « Annuler » : son seul moyen de fermeture est Échap ou un clic à côté.
  const legere = (await page.locator(SELECTEUR_SURFACE_LEGERE).count().catch(() => 0)) > 0;

  if (parCroix && !legere) {
    const parNom = modale.getByRole("button", { name: /^fermer$/i });
    const parIcone = modale.locator('button:has(svg[class*="lucide-x"])');
    const parLibelle = modale.getByRole("button", {
      name: /^(fermer|annuler|retour|plus tard|quitter|non)/i,
    });
    if (await parNom.count()) await parNom.first().click({ timeout: 5_000 });
    else if (await parIcone.count()) await parIcone.first().click({ timeout: 5_000 });
    else if (await parLibelle.count()) await parLibelle.first().click({ timeout: 5_000 });
    else throw new Error("aucun bouton de fermeture (ni « Fermer », ni croix, ni libellé)");
  } else {
    await page.keyboard.press("Escape");
    // Repli : certains menus ne réagissent qu'au clic extérieur. On vise le coin
    // supérieur gauche, hors de tout panneau flottant (qui s'ancre au déclencheur).
    if (await modale.isVisible().catch(() => false)) {
      await page.mouse.click(4, 4).catch(() => {});
    }
  }
  await modale.waitFor({ state: "hidden", timeout: 6_000 });
}

// Les fonctions `auditerModale` / `auditerModalesDeLEcran` ont été retirées :
// elles devinaient les déclencheurs d'après le libellé du bouton, ce qui
// laissait échapper toute modale dont le bouton ne ressemblait pas à un verbe
// d'ouverture. `auditerBoutonsDeLEcran`, défini plus haut, clique chaque bouton
// sous garde-fou réseau et constate ce qui apparaît : la couverture ne dépend
// plus d'une liste de mots, mais de ce que l'écran fait réellement.



// ─────────────────────────────────────────────────────────────────────────────
// AUDIT D'UN ÉCRAN
// ─────────────────────────────────────────────────────────────────────────────

/** Relève l'état courant de la page et le traduit en anomalies lisibles. */
async function mesurerEcran(page) {
  const m = await evaluerAvecReprise(page, RELEVER_PAGE, MARQUEURS_ERREUR);
  const anomalies = [];
  if (m.erreurs.length) anomalies.push(`erreur serveur rendue : ${m.erreurs.join(", ")}`);
  if (m.taille === 0) anomalies.push("écran totalement vide");
  return { ...m, anomalies };
}

async function auditerEcran(page, href) {
  const resultat = { href, statut: null, urlFinale: null, modales: [], onglets: [], anomalies: [] };
  etape(`écran ${href} — chargement`);
  const reponse = await page.goto(`${BASE}${href}?embedded=1`, {
    waitUntil: "domcontentloaded",
    timeout: timeoutChargement,
  });
  resultat.statut = reponse?.status() ?? null;
  await page.waitForLoadState("networkidle", { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(700);
  resultat.urlFinale = new URL(page.url()).pathname;
  resultat.redirigeVers = resultat.urlFinale !== href ? resultat.urlFinale : null;

  // Un refus d'accès est un comportement voulu du contrôle de périmètre :
  // on le note, mais on n'audite pas l'écran (il n'y en a pas).
  if (resultat.urlFinale === "/acces-bloque" || resultat.urlFinale === "/login") {
    resultat.nonAutorise = true;
    etape(`écran ${href} — refusé (${resultat.urlFinale}), ignoré`);
    return resultat;
  }
  etape(`écran ${href} — chargé (${resultat.statut}), analyse des contrôles`);

  Object.assign(resultat, await mesurerEcran(page));

  resultat.controles = await evaluerAvecReprise(page, RELEVER_CONTROLES);
  const sansNom = resultat.controles.boutons.filter((b) => !b.nom);
  if (sansNom.length) resultat.anomalies.push(`${sansNom.length} bouton(s) sans nom accessible`);
  const liensMorts = resultat.controles.liens.filter((l) => !l.href || l.href === "#");
  if (liensMorts.length) resultat.anomalies.push(`${liensMorts.length} lien(s) mort(s) (href « # »)`);
  const champsSansNom = resultat.controles.champs.filter(
    (c) => !c.nom && !["hidden", "submit", "button", "checkbox", "radio"].includes(c.type),
  );
  if (champsSansNom.length) resultat.anomalies.push(`${champsSansNom.length} champ(s) sans nom`);

  // Répartition des contrôles, pour répondre à « tous les boutons sont-ils là
  // et font-ils ce qu'ils annoncent » sans relire 3 000 lignes de rapport.
  resultat.repartition = {
    terminal: resultat.controles.boutons.filter((b) => MOTIF_TERMINAL.test(b.nom)).length,
    fermeture: resultat.controles.boutons.filter((b) => MOTIF_FERMETURE.test(b.nom)).length,
    desactives: resultat.controles.boutons.filter((b) => b.desactive).length,
    sansNom: sansNom.length,
  };
  const desactives = resultat.repartition.desactives;
  if (desactives) resultat.anomalies.push(`${desactives} bouton(s) désactivé(s)`);

  // Boutons et modales de l'onglet par défaut.
  const dejaVu = new Set();
  const passe = await auditerBoutonsDeLEcran(page, maxBoutons);
  // `parent` rattache chaque verdict à l'écran qui le porte : la synthèse
  // agrège tous les écrans, et sans ce champ un bouton mort serait orphelin.
  passe.resultats.forEach((r) => (r.parent = href));
  resultat.boutons = passe.resultats;
  resultat.boutonsTotal = passe.total;
  resultat.boutonsCliques = passe.cliques;
  resultat.modales = passe.resultats.filter((r) => r.ouverte);

  // Puis chaque onglet, avec ses propres contrôles.
  const nbOnglets = await page.locator('[role="tab"]').count();
  for (let i = 0; i < nbOnglets; i++) {
    const locator = page.locator('[role="tab"]').nth(i);
    const libelle = ((await locator.textContent()) || "").replace(/\s+/g, " ").trim().slice(0, 50);
    const resOnglet = { index: i, libelle, modales: [] };
    try {
      await locator.click({ timeout: 8_000 });
      await page.waitForTimeout(900);
      const mesure = await mesurerEcran(page);
      resOnglet.taille = mesure.taille;
      resOnglet.lignes = mesure.lignes;
      resOnglet.erreurs = mesure.erreurs;
      resOnglet.vide = mesure.vide;
      const passeOnglet = await auditerBoutonsDeLEcran(page, maxBoutons);
      passeOnglet.resultats.forEach((r) => (r.parent = `${href} [onglet ${libelle}]`));
      resOnglet.boutonsTotal = passeOnglet.total;
      resOnglet.boutonsCliques = passeOnglet.cliques;
      resOnglet.modales = passeOnglet.resultats.filter((r) => r.ouverte);
      resultat.boutons.push(...passeOnglet.resultats);
      resultat.modales.push(...resOnglet.modales);
      // Retour au premier onglet : sans cela, l'écran suivant hérite de l'état
      // laissé par le dernier onglet visité, et les modales diffèrent.
      if (i > 0) {
        await page.locator('[role="tab"]').first().click({ timeout: 8_000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
    } catch (e) {
      resOnglet.erreurClic = String(e).split("\n")[0].slice(0, 140);
      resultat.anomalies.push(`onglet « ${libelle} » : ${resOnglet.erreurClic}`);
    }
    resultat.onglets.push(resOnglet);
  }

  // Boutons morts : présents, activés, cliqués, mais sans aucun effet visible.
  // C'est le défaut le plus insidieux — l'utilisateur croit avoir agi.
  const sansEffet = resultat.boutons.filter((r) => r.sansEffet && !r.dejaActif);
  if (sansEffet.length)
    resultat.anomalies.push(
      `${sansEffet.length} bouton(s) sans effet : ${sansEffet.map((r) => `« ${r.declencheur} »`).join(", ")}`,
    );
  const dejaActifs = resultat.boutons.filter((r) => r.dejaActif);
  if (dejaActifs.length)
    resultat.anomalies.push(
      `${dejaActifs.length} filtre(s) déjà actif(s) (aucun changement attendu)`,
    );
  const enErreur = resultat.boutons.filter((r) => r.erreur);
  if (enErreur.length)
    resultat.anomalies.push(`${enErreur.length} bouton(s) en erreur au clic`);
  const disparus = resultat.boutons.filter((r) => r.disparuApresAction);
  if (disparus.length)
    resultat.anomalies.push(
      `${disparus.length} bouton(s) non testé(s) : retirés de l'écran par l'action précédente`,
    );

  // Synthèse des modales en échec, remontée dans les anomalies de l'écran.
  for (const mod of resultat.modales) {
    if (mod.sansModale) continue;
    if (!mod.ouverte) resultat.anomalies.push(`modale « ${mod.declencheur} » ne s'ouvre pas`);
    else if (mod.fermeeParCroix === false)
      resultat.anomalies.push(`modale « ${mod.declencheur} » ne se ferme pas par la croix`);
    else if (mod.fermeeParEchap === false)
      resultat.anomalies.push(`modale « ${mod.declencheur} » ne se ferme pas par Échap`);
    // Défaut d'accessibilité structurel : la modale existe visuellement mais
    // n'est annoncée ni par un `role="dialog"`, ni par un déclencheur
    // reconnaissable — un lecteur d'écran la voit comme un simple bloc, et le
    // focus clavier peut la traverser. Les deux symptômes ayant la même cause,
    // ils sont regroupés pour ne pas gonfler le décompte.
    if (mod.ouverte && (mod.contenu?.sansRole || mod.origine === "calque-maison"))
      resultat.anomalies.push(
        `modale « ${mod.declencheur} » maison : sans role="dialog" ni DialogTrigger (accessibilité)`,
      );
  }

  return resultat;
}


// ─────────────────────────────────────────────────────────────────────────────
// AUDIT DU DOCK — le câblage de la navigation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vérifie que les écrans sont réellement ATTEIGNABLES depuis le dock.
 *
 * C'est le complément indispensable du reste : `auditerEcran` visite les
 * routes par URL directe, ce qui prouve qu'elles s'affichent — pas qu'un
 * utilisateur puisse y arriver en cliquant. Une entrée de menu pointant vers une
 * route inexistante passerait l'audit par URL et échouerait ici.
 *
 * On ne clique que des entrées de dock : elles ouvrent une fenêtre (iframe),
 * elles n'écrivent rien.
 */
async function auditerDock(page) {
  const resultat = { groupes: [], items: [] };
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(1_000);

  const cles = await page
    .locator("[data-dock-group]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-dock-group")));

  for (const cle of cles) {
    const groupe = { groupe: cle, modules: [] };
    try {
      await page.locator(`[data-dock-group="${cle}"]`).click({ timeout: 8_000 });
      await page.waitForTimeout(600);
      const hrefs = await page
        .locator("[data-dock-item]")
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-dock-item")));

      for (const href of hrefs) {
        const res = { href, ouvre: false };
        try {
          // Le panneau se referme après chaque clic de module : on le rouvre.
          if ((await page.locator(`[data-dock-item="${href}"]`).count()) === 0) {
            await page.locator(`[data-dock-group="${cle}"]`).click({ timeout: 8_000 });
            await page.waitForTimeout(500);
          }
          await page.locator(`[data-dock-item="${href}"]`).click({ timeout: 8_000 });
          await page.waitForTimeout(1_800);
          const cadre = page.locator(`iframe[src*="${href}"]`);
          res.ouvre = (await cadre.count()) > 0;
          if (!res.ouvre) {
            // L'application peut aussi afficher l'écran en plein cadre plutôt
            // qu'en iframe : l'URL suffit alors à prouver le câblage.
            res.ouvre = page.url().includes(href);
          }
          const texteCadre = await cadre.first().textContent().catch(() => "");
          res.erreurDansLeCadre = (texteCadre || "").toLowerCase().includes("application error");
        } catch (e) {
          res.erreur = String(e).split("\n")[0].slice(0, 140);
        } finally {
          // Fermer la fenêtre ouverte, sinon les iframes s'empilent et
          // ralentissent l'audit jusqu'à le faire échouer par timeout.
          const fermer = page.locator('button[title="Fermer"]');
          if (await fermer.count()) {
            await fermer.last().click({ timeout: 5_000 }).catch(() => {});
            await page.waitForTimeout(500);
          }
        }
        groupe.modules.push(res);
        resultat.items.push({ groupe: cle, ...res });
      }
    } catch (e) {
      groupe.erreur = String(e).split("\n")[0].slice(0, 160);
    }
    resultat.groupes.push(groupe);
  }

  return resultat;
}


// ─────────────────────────────────────────────────────────────────────────────
// SYNTHÈSE ET RAPPORT
// ─────────────────────────────────────────────────────────────────────────────

function ecrireRapport(rapport) {
  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, JSON.stringify(rapport, null, 1));
}

/**
 * Agrège le rapport brut en indicateurs exploitables.
 *
 * Le critère de réussite de l'audit n'est pas « zéro anomalie » : un écran vide
 * peut être l'état correct d'un mois sans devoir. En revanche, un bouton sans
 * nom, une modale qui refuse de se fermer ou une erreur console sont toujours
 * des défauts. La synthèse sépare donc les deux.
 */
function resumer(rapport) {
  const ecrans = rapport.ecrans.filter((e) => !e.nonAutorise);
  const tousLesBoutons = ecrans.flatMap((e) => e.boutons ?? []);
  const toutesLesModales = ecrans.flatMap((e) => e.modales ?? []);
  const modalesOuvertes = toutesLesModales.filter((m) => m.ouverte);
  const onglets = ecrans.flatMap((e) => e.onglets ?? []);

  const anomalies = [];
  for (const e of rapport.ecrans) {
    for (const a of e.anomalies ?? []) anomalies.push({ href: e.href, anomalie: a });
  }

  // Verdict bouton par bouton : c'est la réponse directe à « tous les boutons
  // sont là et fonctionnent ». On compte les clics qui ont produit un effet
  // (modale ou navigation) face à ceux qui n'ont rien produit du tout.
  const cliques = tousLesBoutons.filter((b) => !b.nonClique && !b.desactive && !b.terminal);
  // Boutons présents à l'inventaire mais retirés de l'écran avant leur test :
  // ce ne sont pas des défauts, mais ils ne sont pas jugés pour autant. Le
  // rapport doit le dire, pour que l'absence de verdict reste visible.
  const disparus = tousLesBoutons.filter((b) => b.disparuApresAction);
  return {
    ecransAudites: rapport.ecrans.length,
    ecransAutorises: ecrans.length,
    ecransInterdits: rapport.ecrans.filter((e) => e.nonAutorise).map((e) => e.href),
    ecransVides: ecrans.filter((e) => e.vide).map((e) => e.href),
    ecransEnErreur: ecrans
      .filter((e) => (e.erreurs ?? []).length || (e.erreursConsole ?? []).length)
      .map((e) => ({ href: e.href, rendu: e.erreurs, console: e.erreursConsole })),
    // Gardes `?? []` : un écran dont l'audit a échoué n'a pas de `controles`
    // complet, et un tableau absent ne doit pas faire tomber la synthèse.
    boutonsRecenses: ecrans.reduce((n, e) => n + (e.controles?.boutons?.length ?? 0), 0),
    boutonsTestes: cliques.length,
    boutonsQuiOuvrentUneModale: cliques.filter((b) => b.ouverte).length,
    boutonsQuiChangentLeContenu: cliques.filter((b) => b.effetContenu).length,
    boutonsQuiNaviguent: cliques.filter((b) => b.navigation).length,
    boutonsSansEffet: cliques.filter((b) => b.sansEffet && !b.dejaActif).map((b) => ({ href: b.parent, nom: b.declencheur })),
    boutonsDejaActifs: cliques.filter((b) => b.dejaActif).map((b) => ({ href: b.parent, nom: b.declencheur })),
    boutonsEnErreur: cliques.filter((b) => b.erreur).map((b) => ({ href: b.parent, nom: b.declencheur, erreur: b.erreur })),
    boutonsTerminauxNonCliques: tousLesBoutons.filter((b) => b.terminal).length,
    boutonsDesactives: tousLesBoutons.filter((b) => b.desactive).length,
    liensRecenses: ecrans.reduce((n, e) => n + (e.controles?.liens?.length ?? 0), 0),
    champsRecenses: ecrans.reduce((n, e) => n + (e.controles?.champs?.length ?? 0), 0),
    ongletsRecenses: onglets.length,
    ongletsEnErreur: onglets.filter((o) => (o.erreurs ?? []).length || o.erreurClic),
    modalesRecensees: toutesLesModales.filter((m) => !m.sansModale).length,
    modalesQuiOuvrent: modalesOuvertes.length,
    modalesFermeesParCroix: modalesOuvertes.filter((m) => m.fermeeParCroix).length,
    modalesFermeesParEchap: modalesOuvertes.filter((m) => m.fermeeParEchap).length,
    modalesMaison: modalesOuvertes.filter(
      (m) => m.contenu?.sansRole || m.origine === "calque-maison",
    ).length,
    modalesSansBoutonFermer: modalesOuvertes.filter((m) => m.fermeeParCroix === false).length,
    modalesEnEchec: toutesLesModales
      .filter((m) => !m.sansModale && (!m.ouverte || m.fermeeParCroix === false || m.fermeeParEchap === false))
      .map((m) => ({ declencheur: m.declencheur, erreur: m.erreur ?? m.erreurCroix ?? m.erreurEchap })),
    dock: rapport.dock
      ? {
          // Gardes `?? []` : `auditerDock` peut échouer et être remplacé par
          // `{ erreur }` (cf. `main`). Lire `.groupes.length` sans garde faisait
          // tomber toute la synthèse — donc tout le rapport — après un audit de
          // plusieurs heures, au moment précis où il devenait utile.
          groupes: (rapport.dock.groupes ?? []).length,
          modules: (rapport.dock.items ?? []).length,
          modulesQuiNEouvrentPas: (rapport.dock.items ?? [])
            .filter((i) => !i.ouvre)
            .map((i) => i.href),
          erreur: rapport.dock.erreur ?? null,
        }
      : null,
    totalAnomalies: anomalies.length,
    anomalies,
  };
}

function afficherSynthese(s) {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log(`SYNTHÈSE — ${s.ecransAudites} écrans audités`);
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`Contrôles recensés : ${s.boutonsRecenses} boutons, ${s.liensRecenses} liens, ${s.champsRecenses} champs, ${s.ongletsRecenses} onglets`);
  console.log(
    `Boutons testés     : ${s.boutonsTestes} cliqués → ${s.boutonsQuiOuvrentUneModale} modale(s), ${s.boutonsQuiChangentLeContenu} changement(s) de contenu, ${s.boutonsQuiNaviguent} navigation(s), ${s.boutonsSansEffet.length} sans effet`,
  );
  console.log(
    `                     ${s.boutonsTerminauxNonCliques} terminaux (non cliqués), ${s.boutonsDesactives} désactivés, ${s.boutonsEnErreur.length} en erreur`,
  );
  console.log(`Modales           : ${s.modalesRecensees} recensées, ${s.modalesQuiOuvrent} s'ouvrent, ${s.modalesFermeesParCroix} se ferment (croix), ${s.modalesFermeesParEchap} se ferment (Échap)`);
  console.log(`                    ${s.modalesMaison} « maison » (sans role="dialog"), ${s.modalesSansBoutonFermer} sans bouton de fermeture`);
  if (s.dock) console.log(`Dock              : ${s.dock.groupes} catégories, ${s.dock.modules} modules, ${s.dock.modulesQuiNEouvrentPas.length} non ouvrants`);
  if (s.ecransInterdits.length) console.log(`Écrans refusés    : ${s.ecransInterdits.length} (${s.ecransInterdits.join(", ")})`);
  if (s.ecransVides.length) console.log(`Écrans sans donnée: ${s.ecransVides.length} (${s.ecransVides.join(", ")})`);

  const sections = [
    ["ÉCRANS EN ERREUR (serveur ou console)", s.ecransEnErreur.map((e) => ({ href: e.href, anomalie: [...(e.rendu ?? []), ...(e.console ?? [])].join(" | ") }))],
    ["MODALES EN ÉCHEC", s.modalesEnEchec.map((m) => ({ href: "(modale)", anomalie: `${m.declencheur} — ${m.erreur ?? "fermeture incomplète"}` }))],
    ["BOUTONS SANS EFFET AU CLIC", s.boutonsSansEffet.map((b) => ({ href: b.href, anomalie: `« ${b.nom} » : rien ne se passe` }))],
    ["BOUTONS EN ERREUR AU CLIC", s.boutonsEnErreur.map((b) => ({ href: b.href, anomalie: `« ${b.nom} » : ${b.erreur}` }))],
    ["ONGLETS EN ERREUR", s.ongletsEnErreur.map((o) => ({ href: "(onglet)", anomalie: `${o.libelle} — ${o.erreurClic ?? (o.erreurs ?? []).join(", ")}` }))],
    ["MODULES DE DOCK NON OUVRANTS", s.dock?.modulesQuiNEouvrentPas.map((h) => ({ href: h, anomalie: "aucune fenêtre ouverte" })) ?? []],
    ["DÉFAUTS DE CONTRÔLE (nom, href mort)", s.anomalies],
  ];

  for (const [titre, lignes] of sections) {
    if (!lignes.length) continue;
    console.log(`\n── ${titre} (${lignes.length}) ──`);
    for (const l of lignes.slice(0, 40)) console.log(`   ✗ ${l.href} : ${l.anomalie}`);
    if (lignes.length > 40) console.log(`   … et ${lignes.length - 40} autre(s)`);
  }

  console.log(`\nRapport complet : ${SORTIE}\n`);
}


// ─────────────────────────────────────────────────────────────────────────────
// BOUCLE PRINCIPALE
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // ─── Mode « synthèse seule » ──────────────────────────────────────────────
  // POURQUOI — l'audit complet coûte des heures ; la synthèse, elle, est
  // instantanée. Quand seule la mise en forme du verdict a changé (ou qu'elle a
  // planté, comme ici, sur un rapport déjà écrit), il serait absurde de
  // re-parcourir les 81 écrans. Ce mode relit `audit-reports/ui-complet.json`,
  // recalcule le verdict et réimprime le résumé, sans navigateur ni serveur.
  if (process.argv.includes("--synthese-seulement")) {
    if (!fs.existsSync(SORTIE)) {
      console.error(`Aucun rapport à relire : ${SORTIE} est introuvable.`);
      process.exit(1);
    }
    const rapport = JSON.parse(fs.readFileSync(SORTIE, "utf8"));
    console.log(`Relecture de ${SORTIE} (${rapport.ecrans?.length ?? 0} écrans)\n`);
    rapport.synthese = resumer(rapport);
    ecrireRapport(rapport);
    afficherSynthese(rapport.synthese);
    return;
  }

  const navigateur = await chromium.launch({ headless: !navigateurVisible });
  if (navigateurVisible) {
    etape("navigateur visible — nécessaire pour franchir Turnstile en production");
  }
  const context = await navigateur.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "fr-FR",
  });
  await connecter(context, codeTotp);

  const page = await context.newPage();
  instrumenterReseau(page);

  // Le rôle du compte de démonstration (COUNSELOR) fermerait la plupart des
  // écrans. On incarne un administrateur de tenant pour que l'audit porte sur
  // des pages réellement rendues, avec leurs tableaux et leurs modales.
  // La bascule est faite AVANT le garde-fou : elle-même écrit (POST).
  if (roleVise) {
    await basculerRole(page, roleVise);
  } else {
    etape("rôle du compte conservé (--sans-role) : les refus d'accès seront nombreux");
  }

  const toutes = filtrePages ?? routesDuTableauDeBord();

  // Pré-chauffage : on compile tout, puis on s'arrête. L'audit proprement dit
  // est relancé ensuite, sans ce mode, contre un serveur déjà chaud.
  if (modePrechauffage) {
    await prechauffer(context, toutes, Number(arg("paralleles") ?? 4));
    await navigateur.close();
    return;
  }

  // À partir d'ici, l'audit ne peut plus rien modifier : toute méthode non-GET
  // est interceptée avant d'atteindre le serveur (cf. `bloquerEcritures`).
  await bloquerEcritures(page);
  etape("garde-fou réseau actif — écritures bloquées côté navigateur");

  // Dialogues natifs (`confirm`, `alert`) : Playwright les rejette par défaut,
  // mais seulement s'il a le temps de les intercepter. Les rejeter ici, de façon
  // explicite, évite qu'une confirmation sans réponse ne gèle le rendu.
  page.on("dialog", (d) => {
    dialoguesNatifs.push(`${d.type()} : ${d.message().slice(0, 120)}`);
    d.dismiss().catch(() => {});
  });

  // Compteur des écritures interceptées : sans lui, on confondrait « modale qui
  // ne s'ouvre pas » et « modale dont le chargement a été bloqué par l'audit ».
  let ecrituresBloquees = 0;
  page.on("requestfailed", (r) => {
    if (r.failure()?.errorText === "net::ERR_BLOCKED_BY_CLIENT") ecrituresBloquees++;
  });

  /** Confirmations natives rencontrées — elles signalent une UI à moderniser. */
  const dialoguesNatifs = [];

  // Le navigateur, lui, doit rester borné : une action qui n'aboutit pas doit
// échouer, jamais suspendre l'audit. Les budgets explicites plus bas (25 s par
// bouton) s'ajoutent à ce plafond par défaut.
  page.setDefaultTimeout(10_000);

  // Journaux console, vidés avant chaque écran : une erreur React signalée sur
  // `/notes` ne doit pas être imputée à `/eleves`.
  const journaux = [];
  page.on("console", (m) => {
    if (m.type() === "error") journaux.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => journaux.push(`pageerror: ${String(e.message).slice(0, 200)}`));

  const routes = limite > 0 ? toutes.slice(0, limite) : toutes;

  const rapport = {
    base: BASE,
    compte: EMAIL,
    role: roleVise ?? "(rôle du compte)",
    debut: new Date().toISOString(),
    nbEcrans: routes.length,
    ecrans: [],
    dock: null,
  };

  console.log(`Audit UI — ${routes.length} écrans sur ${BASE} (lecture seule)\n`);

  /** Échecs de navigation consécutifs — voir le contrôle « serveur vivant ». */
  let echecsConsecutifs = 0;

  for (const href of routes) {
    journaux.length = 0;
    let res;
    try {
      res = await auditerEcran(page, href);
    } catch (e) {
      // Un écran qui fait tomber le navigateur ne doit pas faire tomber l'audit
      // entier : on le note et on passe au suivant.
      res = { href, anomalies: [`exception : ${String(e).split("\n")[0].slice(0, 160)}`] };
    }

    // ─── Le serveur est-il encore vivant ? ───────────────────────────────────
    // POURQUOI CE CONTRÔLE — un serveur qui meurt en cours d'audit ne produit pas
    // d'erreur bruyante : Playwright attend simplement son timeout, écran après
    // écran. Un run réel a ainsi passé 47 écrans × 120 s de timeout, soit neuf
    // heures, avant d'aboutir à un rapport vide et à un plantage de synthèse.
    // Le symptôme est reconnaissable : des échecs de navigation CONSÉCUTIFS.
    // Trois d'affilée ne s'expliquent pas par un écran fautif — un écran fautif
    // casse une page, pas la suivante — et justifient d'arrêter là.
    const panneDeNavigation =
      /ERR_ABORTED|Timeout \d+ms exceeded|has been closed|ERR_CONNECTION|ERR_EMPTY_RESPONSE/.test(
        JSON.stringify(res.anomalies ?? []),
      );
    echecsConsecutifs = panneDeNavigation ? echecsConsecutifs + 1 : 0;
    if (echecsConsecutifs >= 3) {
      rapport.interrompu = {
        cause: "serveur injoignable ou navigateur fermé",
        derniersEcrans: rapport.ecrans.slice(-3).map((e) => e.href),
        ecransRestants: routes.length - rapport.ecrans.length,
      };
      ecrireRapport(rapport);
      console.error(
        `\n✗ Audit interrompu : 3 échecs de navigation consécutifs sur ${BASE}.\n` +
          `  Derniers écrans : ${rapport.interrompu.derniersEcrans.join(", ")}\n` +
          `  ${rapport.interrompu.ecransRestants} écran(s) non audité(s).\n` +
          `  Vérifiez que le serveur répond, puis relancez — le rapport partiel est conservé.\n`,
      );
      break;
    }
    res.erreursConsole = [...new Set(journaux)];
    if (res.erreursConsole.length) {
      res.anomalies.push(`${res.erreursConsole.length} erreur(s) console`);
    }
    rapport.ecrans.push(res);
    // Écriture après chaque écran : une session d'audit interrompue ne doit pas
    // perdre les écrans déjà passés.
    ecrireRapport(rapport);

    const drapeau = res.nonAutorise ? "–" : res.anomalies.length ? "✗" : res.vide ? "○" : "•";
    const nbModales = (res.modales ?? []).filter((m) => m.ouverte).length;
    console.log(
      `${drapeau} ${href.padEnd(26)} ${String(res.taille ?? 0).padStart(6)} car.  ` +
        `${String(res.boutonsCliques ?? 0).padStart(3)}/${String(res.boutonsTotal ?? 0).padEnd(3)} boutons testés  ` +
        `${String(nbModales).padStart(2)} modale(s)  ` +
        `${String((res.onglets ?? []).length).padStart(2)} onglet(s)`,
    );
    for (const a of res.anomalies ?? []) console.log(`      ⚠ ${a}`);
    // Progression : un écran à 25 boutons prend ~40 s. Sans cette ligne, un
    // audit de 81 écrans paraît figé alors qu'il travaille.
    etape(`écran ${href} — terminé (${res.boutonsCliques ?? 0} boutons testés)`);
  }

  rapport.ecrituresBloquees = ecrituresBloquees;
  rapport.dialoguesNatifs = [...new Set(dialoguesNatifs)];
  if (ecrituresBloquees) {
    etape(
      `${ecrituresBloquees} écriture(s) interceptée(s) par le garde-fou — aucun effet persistant possible`,
    );
  }
  if (rapport.dialoguesNatifs.length) {
    etape(`${rapport.dialoguesNatifs.length} dialogue(s) natif(s) rencontré(s) (confirm/alert)`);
  }

  if (!sansDock) {
    console.log("\nAudit du dock…");
    try {
      rapport.dock = await auditerDock(page);
    } catch (e) {
      rapport.dock = { erreur: String(e).split("\n")[0].slice(0, 200) };
    }
  }

  rapport.fin = new Date().toISOString();
  rapport.synthese = resumer(rapport);
  ecrireRapport(rapport);
  afficherSynthese(rapport.synthese);

  await navigateur.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

