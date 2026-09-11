import { test as base, expect, type Page } from "@playwright/test";

/**
 * Fixtures E2E multi-rôles (15 rôles)
 * ============================================================
 * Chaque rôle dispose d'un compte dédié créé par le script LEARNOS
 * (`scripts/qa-comptes-demo.ts`) sur le tenant `demo-learnos`.
 * Ces comptes se greffent sur le jeu de démonstration LEARNOS
 * (`scripts/demo-learnos.ts`) : même tenant, même site, même classe.
 *
 * Le tenant est `demo-learnos`. Les comptes tenant-scopés
 * (tout sauf SUPER_ADMIN) y sont rattachés. SUPER_ADMIN est un
 * compte plateforme sans tenant.
 *
 * Sélection de tenant : si l'utilisateur n'a qu'un seul tenant,
 * celui-ci est sélectionné automatiquement — la page /select-tenant
 * n'apparaît pas. Si l'utilisateur a plusieurs tenants, il choisit
 * manuellement. SUPER_ADMIN sans tenant va directement sur /super-admin.
 *
 * APPROCHE : le login se fait via l'API NextAuth directement
 * (POST /api/auth/callback/credentials avec token CSRF), pas via
 * le formulaire UI. Cela évite les problèmes de hydration React,
 * de tokens CSRF stale, et de timing du handler onSubmit.
 */

export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Demo@2026!";
const SUFFIXE = "@qa-learnos.test";

export const E2E_CREDENTIALS: Record<string, { email: string; password: string }> = {
  SUPER_ADMIN: { email: `super_admin${SUFFIXE}`, password: E2E_PASSWORD },
  TENANT_ADMIN: { email: `admin${SUFFIXE}`, password: E2E_PASSWORD },
  PRINCIPAL: { email: `principal${SUFFIXE}`, password: E2E_PASSWORD },
  TEACHER: { email: `prof${SUFFIXE}`, password: E2E_PASSWORD },
  CLASS_TEACHER: { email: `pp${SUFFIXE}`, password: E2E_PASSWORD },
  PARENT: { email: `parent${SUFFIXE}`, password: E2E_PASSWORD },
  STUDENT: { email: `eleve${SUFFIXE}`, password: E2E_PASSWORD },
  SUPERVISOR: { email: `supervisor${SUFFIXE}`, password: E2E_PASSWORD },
  SECRETARY: { email: `secretary${SUFFIXE}`, password: E2E_PASSWORD },
  COUNSELOR: { email: `counselor${SUFFIXE}`, password: E2E_PASSWORD },
  NURSE: { email: `nurse${SUFFIXE}`, password: E2E_PASSWORD },
  ACCOUNTANT: { email: `accountant${SUFFIXE}`, password: E2E_PASSWORD },
  SUBJECT_LEAD: { email: `subject_lead${SUFFIXE}`, password: E2E_PASSWORD },
  SITE_MANAGER: { email: `site_manager${SUFFIXE}`, password: E2E_PASSWORD },
  INSPECTOR: { email: `inspector${SUFFIXE}`, password: E2E_PASSWORD },
};

/**
 * Motif d'URL acceptable après login : toutes les routes d'accueil
 * possibles + /select-tenant (si multi-tenant) + /acces-bloque
 * (si le rôle n'a pas d'accueil dédié).
 */
const POST_LOGIN_URL = /\/(select-tenant|dashboard|acces-bloque|super-admin|direction|mon-espace|ma-classe|parent|eleve|vie-scolaire|secretariat|conseiller|infirmerie|comptabilite|ma-matiere|exploitation|inspection)/;

const POST_TENANT_URL = /\/(dashboard|acces-bloque|super-admin|direction|mon-espace|ma-classe|parent|eleve|vie-scolaire|secretariat|conseiller|infirmerie|comptabilite|ma-matiere|exploitation|inspection)/;

/**
 * Connecte la page avec le compte E2E du rôle demandé.
 *
 * Le login se fait en deux étapes :
 *  1. Récupérer un token CSRF via GET /api/auth/csrf
 *  2. POST /api/auth/callback/credentials avec email, password, csrfToken
 *
 * NextAuth répond par une 302 vers la callback URL. Les cookies de
 * session sont alors stockés dans le contexte navigateur. On navigue
 * ensuite vers la page d'accueil du rôle.
 *
 * La sélection de tenant est automatique s'il n'y en a qu'un seul.
 */
const sessionCache = new Map<string, Record<string, string>>();

export async function loginAs(page: Page, role: string): Promise<void> {
  const creds = E2E_CREDENTIALS[role];
  if (!creds) {
    throw new Error(`Rôle inconnu dans E2E_CREDENTIALS : ${role}`);
  }

  const origin = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3001";

  // 1. Nettoyer toute session précédente.
  await page.context().clearCookies();

  // 1b. Restaurer la session depuis le cache si disponible (évite le rate limiter).
  const cachedCookies = sessionCache.get(role);
  if (cachedCookies) {
    const cookieList = Object.entries(cachedCookies).map(([name, value]) => ({
      name,
      value,
      domain: "localhost",
      path: "/",
    }));
    await page.context().addCookies(cookieList);
    return;
  }

  // 2. Récupérer un token CSRF frais (avec retry pour le cold start du dev server).
  let csrfToken: string | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const csrfRes = await page.request.get(`${origin}/api/auth/csrf`, {
        failOnStatusCode: false,
      });
      if (csrfRes.ok()) {
        const body = await csrfRes.json();
        csrfToken = body.csrfToken;
        if (csrfToken) break;
      }
    } catch {
      // Le dev server compile peut-être encore la route.
    }
    await page.waitForTimeout(2000);
  }
  if (!csrfToken) {
    throw new Error(`CSRF token fetch failed for ${role} after 5 attempts`);
  }

  // 3. Soumettre les credentials via l'API NextAuth.
  //    NextAuth répond par 302 → /select-tenant ou la callback URL.
  //    On suit pas la redirection (redirect: "manual") pour inspecter.
  //    Retry avec backoff exponentiel si le rate limiter renvoie 429.
  let loginRes;
  for (let attempt = 0; attempt < 4; attempt++) {
    loginRes = await page.request.post(`${origin}/api/auth/callback/credentials`, {
      form: {
        email: creds.email,
        password: creds.password,
        csrfToken: csrfToken!,
        callbackUrl: `${origin}/select-tenant`,
        json: "true",
      },
      maxRedirects: 0,
    });

    if (loginRes.status() === 429) {
      // Rate limited : attendre avec backoff exponentiel (2s, 4s, 8s).
      const waitMs = 2000 * Math.pow(2, attempt);
      await page.waitForTimeout(waitMs);
      // Récupérer un nouveau token CSRF (l'ancien peut avoir expiré).
      const csrfRetry = await page.request.get(`${origin}/api/auth/csrf`, {
        failOnStatusCode: false,
      });
      if (csrfRetry.ok()) {
        const body = await csrfRetry.json();
        csrfToken = body.csrfToken ?? csrfToken;
      }
      continue;
    }
    break;
  }
  if (!loginRes) {
    throw new Error(`Login failed for ${role}: no response after retries`);
  }

  // NextAuth renvoie 302 en cas de succès. Les cookies de session
  // sont posés dans cette réponse.
  if (loginRes.status() !== 302) {
    // Essayer de lire le corps d'erreur pour le diagnostic.
    const body = await loginRes.text().catch(() => "(no body)");
    throw new Error(`Login failed for ${role}: HTTP ${loginRes.status()} — ${body.slice(0, 200)}`);
  }

  // 4. Les cookies de session sont maintenant dans le contexte.
  //    Naviguer vers la page d'accueil du rôle.
  //    On passe par /select-tenant qui redirigera automatiquement
  //    si un seul tenant, ou vers la route d'accueil directement.
  //    Retry : le dev server peut encore compiler /select-tenant (cold start).
  let gotoOk = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await page.goto("/select-tenant", { waitUntil: "domcontentloaded", timeout: 30000 });
      gotoOk = true;
      break;
    } catch {
      // Le dev server compile peut-être encore la route. Réessayer.
      await page.waitForTimeout(3000);
    }
  }
  if (!gotoOk) {
    throw new Error(`Navigation to /select-tenant failed for ${role} after 5 attempts`);
  }

  // Attendre la redirection (automatique si un seul tenant).
  await page.waitForURL(POST_LOGIN_URL, { timeout: 20000 });

  // Si on est sur /select-tenant (multi-tenant), choisir le tenant LEARNOS.
  if (page.url().includes("/select-tenant")) {
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
    const tenantButton = page.locator('button:has-text("demo-learnos")');
    const hasTenant = await tenantButton.count();
    if (hasTenant > 0) {
      await tenantButton.first().click({ timeout: 10000 });
      await page.waitForURL(POST_TENANT_URL, { timeout: 20000 });
    } else {
      // Aucun tenant à sélectionner : attendre la redirection automatique.
      await page.waitForURL(POST_TENANT_URL, { timeout: 20000 });
    }
  }

  // 5. Mettre en cache les cookies de session pour les prochains tests
  //    utilisant le même rôle (évite de dépasser le rate limiter).
  const currentCookies = await page.context().cookies();
  const cookieMap: Record<string, string> = {};
  for (const c of currentCookies) {
    cookieMap[c.name] = c.value;
  }
  sessionCache.set(role, cookieMap);
}

/**
 * Test base réexporté pour permettre `import { test, expect } from "./fixtures-roles"`.
 * Aucune fixture personnalisée n'est nécessaire : `loginAs` est appelée
 * explicitement dans chaque test, ce qui garde les logs lisibles.
 */
export const test = base;
export { expect };
