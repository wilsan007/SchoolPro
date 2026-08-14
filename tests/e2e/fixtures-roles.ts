import { test as base, expect, type Page } from "@playwright/test";

/**
 * Fixtures E2E multi-rôles
 * ============================================================
 * Chaque rôle dispose d'un compte dédié créé par le script LEARNOS
 * (`scripts/qa-comptes-demo.ts`) sur le tenant `demo-learnos`.
 * Ces comptes se greffent sur le jeu de démonstration LEARNOS
 * (`scripts/demo-learnos.ts`) : même tenant, même site, même classe.
 *
 * Le tenant est `demo-learnos`. Les comptes tenant-scopés
 * (tout sauf SUPER_ADMIN) y sont rattachés. SUPER_ADMIN est un
 * compte plateforme sans tenant.
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
};

/**
 * Motif d'URL acceptable après login :
 *   - /select-tenant  → choix du tenant (comptes multi-tenant)
 *   - /dashboard      → tableau de bord générique
 *   - /super-admin    → console plateforme
 *   - /direction      → direction
 *   - /mon-espace     → enseignant
 *   - /ma-classe      → professeur principal
 *   - /parent         → espace parent
 *   - /eleve          → espace élève
 *   - /vie-scolaire   → surveillant
 *   - /secretariat    → secrétariat
 *   - /conseiller     → conseiller
 *   - /infirmerie     → infirmerie
 *   - /comptabilite   → comptabilité
 *   - /ma-matiere     → coordinateur de matière
 */
const POST_LOGIN_URL = /\/(select-tenant|dashboard|super-admin|direction|mon-espace|ma-classe|parent|eleve|vie-scolaire|secretariat|conseiller|infirmerie|comptabilite|ma-matiere)/;

const POST_TENANT_URL = /\/(dashboard|super-admin|direction|mon-espace|ma-classe|parent|eleve|vie-scolaire|secretariat|conseiller|infirmerie|comptabilite|ma-matiere)/;

/**
 * Connecte la page avec le compte E2E du rôle demandé.
 *
 * Gère l'étape intermédiaire `/select-tenant` : si l'utilisateur
 * appartient à plusieurs tenants, NextAuth le redirige vers cet
 * écran de choix. On sélectionne alors le tenant « e2e-test ».
 */
export async function loginAs(page: Page, role: string): Promise<void> {
  const creds = E2E_CREDENTIALS[role];
  if (!creds) {
    throw new Error(`Rôle inconnu dans E2E_CREDENTIALS : ${role}`);
  }

  await page.goto("/login");
  // La page de login utilise un Suspense boundary : attendre que le formulaire
  // soit réellement rendu avant d'interagir avec les inputs.
  await page.waitForSelector('input[type="email"]', { state: "visible", timeout: 15000 });
  await page.fill('input[type="email"]', creds.email);
  await page.fill('input[type="password"]', creds.password);
  await page.click('button[type="submit"]');

  // Attendre la première redirection post-login.
  await page.waitForURL(POST_LOGIN_URL, { timeout: 20000 });

  // Si on est sur /select-tenant, choisir le tenant LEARNOS.
  if (page.url().includes("/select-tenant")) {
    // Le tenant de démonstration LEARNOS est « demo-learnos ».
    await page.click("text=demo-learnos", { timeout: 10000 });
    await page.waitForURL(POST_TENANT_URL, { timeout: 20000 });
  }
}

/**
 * Test base réexporté pour permettre `import { test, expect } from "./fixtures-roles"`.
 * Aucune fixture personnalisée n'est nécessaire : `loginAs` est appelée
 * explicitement dans chaque test, ce qui garde les logs lisibles.
 */
export const test = base;
export { expect };
