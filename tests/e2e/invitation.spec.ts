import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import { hashInvitationToken } from "../../src/lib/invitations";

/**
 * Parcours d'invitation — test de bout en bout
 * ============================================================
 * POURQUOI CE TEST EXISTE
 * `src/lib/invitations-server.test.ts` couvre la règle (jeton, expiration, états)
 * mais pas le CHEMIN RÉEL : page publique, route HTTP, base de données. Une
 * future modification de la page ou de la route casserait le parcours sans
 * qu'aucun test unitaire ne s'en aperçoive.
 *
 * CE QU'IL PROUVE, dans l'ordre :
 *   1. la page s'ouvre et propose le formulaire pour un jeton valide ;
 *   2. un mot de passe faible est REFUSÉ, et rien n'est créé ;
 *   3. un mot de passe conforme crée le compte — marqué vérifié, sans forçage
 *      de changement ;
 *   4. le jeton est à USAGE UNIQUE : rejouer le lien échoue ;
 *   5. un jeton inconnu est refusé (via l'API, dont les codes sont stables).
 *
 * MODE D'EMPLOI DE LA BASE
 * Le test crée son invitation DIRECTEMENT en base plutôt que via l'interface
 * d'administration : il ne dépend ainsi d'aucun compte de démonstration
 * préexistant, et peut tourner sur une base fraîche.
 *
 * Il écrit dans la base réelle : l'adresse est donc namespaceée
 * (`@qa-schoolpro.test`) et TOUT est supprimé en fin de test — utilisateur,
 * fiche enseignant éventuelle et invitation.
 */

const prisma = new PrismaClient();

const email = `e2e-invitation-${Date.now()}@qa-schoolpro.test`;
const token = randomBytes(32).toString("base64url");

let invitationId: string | null = null;
let tenantId: string | null = null;

test.describe("Parcours d'invitation", () => {
  test.beforeAll(async () => {
    const tenant = await prisma.tenant.findFirst({
      where: { status: "ACTIVE" },
      select: { id: true },
    });
    if (!tenant) {
      throw new Error(
        "Aucun établissement ACTIVE en base : le parcours d'invitation ne peut pas être testé."
      );
    }
    tenantId = tenant.id;

    // L'empreinte est calculée par le MÊME module que le serveur : recopier
    // l'algorithme ici créerait une seconde vérité, et le test pourrait passer
    // alors que le serveur, lui, hache autrement.
    const invitation = await prisma.invitation.create({
      data: {
        tenantId: tenant.id,
        email,
        name: "E2E Invité",
        // Rôle sans effet de bord : un secrétaire ne déclenche pas la création
        // d'une fiche enseignant, donc le nettoyage reste simple.
        role: "SECRETARY",
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + 3600_000),
      },
      select: { id: true },
    });
    invitationId = invitation.id;
  });

  test.afterAll(async () => {
    // Nettoyage : on ne laisse RIEN derrière nous dans une base partagée.
    await prisma.user.deleteMany({ where: { email } });
    if (invitationId) {
      await prisma.invitation.deleteMany({ where: { id: invitationId } });
    }
    await prisma.$disconnect();
  });

  test("ouvre le formulaire pour un jeton valide", async ({ page }) => {
    await page.goto(`/accept-invitation?token=${encodeURIComponent(token)}`);

    // Le champ de mot de passe signale le formulaire, sans dépendre de la
    // langue de l'interface (Playwright démarre en en-US, l'application en fr).
    await expect(page.locator("#password")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#confirmation")).toBeVisible();
  });

  test("refuse un mot de passe faible et ne crée aucun compte", async ({ page }) => {
    await page.goto(`/accept-invitation?token=${encodeURIComponent(token)}`);
    await expect(page.locator("#password")).toBeVisible({ timeout: 15000 });

    await page.fill("#password", "court");
    await page.fill("#confirmation", "court");
    await page.click('button[type="submit"]');

    // Le formulaire reste affiché : l'utilisateur peut corriger.
    await expect(page.locator("#password")).toBeVisible();
    // Et surtout : aucun compte n'a été créé.
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  test("accepte un mot de passe conforme, crée le compte et consomme le jeton", async ({
    page,
  }) => {
    await page.goto(`/accept-invitation?token=${encodeURIComponent(token)}`);
    await expect(page.locator("#password")).toBeVisible({ timeout: 15000 });

    const motDePasse = "MotDePasse1!";
    await page.fill("#password", motDePasse);
    await page.fill("#confirmation", motDePasse);
    await page.click('button[type="submit"]');

    // Le formulaire disparaît et un lien de connexion apparaît.
    await expect(page.locator('a[href="/login"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#password")).toHaveCount(0);

    // ── Vérifications en base ──────────────────────────────────────────
    const utilisateur = await prisma.user.findFirst({
      where: { email },
      select: {
        id: true,
        emailVerified: true,
        mustChangePassword: true,
        role: true,
        tenantId: true,
      },
    });
    expect(utilisateur).not.toBeNull();
    // L'invitation vaut preuve de possession de l'adresse.
    expect(utilisateur!.emailVerified).not.toBeNull();
    // Le mot de passe a été choisi par l'utilisateur : rien à forcer.
    expect(utilisateur!.mustChangePassword).toBe(false);
    expect(utilisateur!.role).toBe("SECRETARY");
    expect(utilisateur!.tenantId).toBe(tenantId);

    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId! },
      select: { status: true, acceptedAt: true },
    });
    expect(invitation!.status).toBe("ACCEPTED");
    expect(invitation!.acceptedAt).not.toBeNull();
  });

  test("refuse de rejouer un jeton déjà utilisé (usage unique)", async ({ request }) => {
    // Passage par l'API : ses codes d'erreur sont STABLES et non traduits,
    // donc l'assertion ne dépend pas de la langue de l'interface.
    const res = await request.post("/api/auth/invitation", {
      data: { token, password: "MotDePasse2!" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("invitation_deja_acceptee");
  });

  test("refuse un jeton inconnu", async ({ request }) => {
    const res = await request.post("/api/auth/invitation", {
      data: { token: "jeton-qui-n-existe-pas", password: "MotDePasse1!" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("jeton_inconnu");
  });

  test("refuse un mot de passe faible via l'API, avant même de chercher le jeton", async ({
    request,
  }) => {
    const res = await request.post("/api/auth/invitation", {
      data: { token: "jeton-qui-n-existe-pas", password: "court" },
    });
    expect(res.status()).toBe(400);
    // Le contrôle du mot de passe passe AVANT la recherche du jeton : c'est
    // volontaire (le moins coûteux d'abord, et aucun accès à la base pour une
    // requête manifestement invalide). Ce test le fige.
    expect((await res.json()).error).toBe("mot_de_passe_faible");
  });
});
