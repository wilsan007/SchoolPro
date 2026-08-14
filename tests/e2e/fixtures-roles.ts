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
 */

export const E2E_PASSWORD = "Demo@2026!";
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
 * La sélection de tenant est automatique s'il n'y en a qu'un seul :
 * la page /select-tenant n'apparaît que pour les comptes multi-tenant.
 * Tous les comptes E2E (sauf SUPER_ADMIN) ont un seul tenant (demo-learnos),
 * donc la plupart des logins vont directement à la route d'accueil.
 */
export async function loginAs(page: Page, role: string): Promise<void> {
  const creds = E2E_CREDENTIALS[role];
  if (!creds) {
    throw new Error(`Rôle inconnu dans E2E_CREDENTIALS : ${role}`);
  }

  // Nettoyer toute session précédente pour éviter les interférences entre tests.
  // Le simple clearCookies ne suffit pas : il faut aussi détruire la session
  // côté serveur via l'endpoint de déconnexion NextAuth.
  await page.context().clearCookies();
  // Tenter un signout explicite (ignorer les erreurs si pas de session).
  await page.goto("/api/auth/signout", { waitUntil: "domcontentloaded" }).catch(() => {});
  // Revenir à la page de login.
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  // La page de login utilise un Suspense boundary + hydration React.
  // attendre que le formulaire soit visible et cliquable.
  await page.waitForSelector('input[type="email"]', { state: "visible", timeout: 20000 });
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', creds.email);
  await page.fill('input[type="password"]', creds.password);
  await page.click('button[type="submit"]');

  // Attendre la première redirection post-login.
  // Avec un seul tenant, l'utilisateur va directement à son accueil.
  // Avec plusieurs tenants, il passe par /select-tenant.
  await page.waitForURL(POST_LOGIN_URL, { timeout: 25000 });

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
}

/**
 * Test base réexporté pour permettre `import { test, expect } from "./fixtures-roles"`.
 * Aucune fixture personnalisée n'est nécessaire : `loginAs` est appelée
 * explicitement dans chaque test, ce qui garde les logs lisibles.
 */
export const test = base;
export { expect };
