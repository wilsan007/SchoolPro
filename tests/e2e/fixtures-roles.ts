import { test as base, expect, type Page } from "@playwright/test";

/**
 * Fixtures E2E multi-rôles
 * ============================================================
 * Chaque rôle dispose d'un compte dédié créé par le seed E2E
 * (`prisma/seed-e2e.ts`). Ces comptes ne sont jamais utilisés en
 * développement courant — ils existent uniquement pour les tests
 * Playwright, afin de ne pas polluer la base de demo.
 *
 * Le tenant E2E est nommé « e2e-test ». Les comptes tenant-scopés
 * (tout sauf SUPER_ADMIN) y sont rattachés. SUPER_ADMIN est un
 * compte plateforme sans tenant.
 */

export const E2E_PASSWORD = "E2E-Test-2026!";

export const E2E_CREDENTIALS: Record<string, { email: string; password: string }> = {
  SUPER_ADMIN: { email: "e2e-superadmin@ecolpro.app", password: E2E_PASSWORD },
  TENANT_ADMIN: { email: "e2e-tenantadmin@ecolpro.app", password: E2E_PASSWORD },
  PRINCIPAL: { email: "e2e-principal@ecolpro.app", password: E2E_PASSWORD },
  TEACHER: { email: "e2e-teacher@ecolpro.app", password: E2E_PASSWORD },
  CLASS_TEACHER: { email: "e2e-classteacher@ecolpro.app", password: E2E_PASSWORD },
  PARENT: { email: "e2e-parent@ecolpro.app", password: E2E_PASSWORD },
  STUDENT: { email: "e2e-student@ecolpro.app", password: E2E_PASSWORD },
  SUPERVISOR: { email: "e2e-supervisor@ecolpro.app", password: E2E_PASSWORD },
  SECRETARY: { email: "e2e-secretary@ecolpro.app", password: E2E_PASSWORD },
  COUNSELOR: { email: "e2e-counselor@ecolpro.app", password: E2E_PASSWORD },
  NURSE: { email: "e2e-nurse@ecolpro.app", password: E2E_PASSWORD },
  ACCOUNTANT: { email: "e2e-accountant@ecolpro.app", password: E2E_PASSWORD },
  SUBJECT_LEAD: { email: "e2e-subjectlead@ecolpro.app", password: E2E_PASSWORD },
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
  await page.fill('input[type="email"]', creds.email);
  await page.fill('input[type="password"]', creds.password);
  await page.click('button[type="submit"]');

  // Attendre la première redirection post-login.
  await page.waitForURL(POST_LOGIN_URL, { timeout: 15000 });

  // Si on est sur /select-tenant, choisir le tenant E2E.
  if (page.url().includes("/select-tenant")) {
    // Le tenant E2E est nommé « e2e-test » par le seed.
    await page.click("text=e2e-test", { timeout: 10000 });
    await page.waitForURL(POST_TENANT_URL, { timeout: 15000 });
  }
}

/**
 * Test base réexporté pour permettre `import { test, expect } from "./fixtures-roles"`.
 * Aucune fixture personnalisée n'est nécessaire : `loginAs` est appelée
 * explicitement dans chaque test, ce qui garde les logs lisibles.
 */
export const test = base;
export { expect };
