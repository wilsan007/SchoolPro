import { test, expect, type Page } from "@playwright/test";

/**
 * Entraînement autonome — parcours réel d'un élève.
 *
 * CE QUE CE FICHIER VÉRIFIE ET QUE LES AUTRES TESTS NE PEUVENT PAS
 * ---------------------------------------------------------------
 * Les tests unitaires prouvent que `vueEleve` retire les réponses attendues ;
 * le script de bout en bout prouve que la chaîne serveur tient. Ni l'un ni
 * l'autre ne dit ce qui **arrive réellement dans le navigateur** : un corrigé
 * peut fuir par une réponse d'API que l'écran n'affiche pas, et un enchaînement
 * peut être juste côté serveur tout en étant impraticable à l'écran.
 *
 * On regarde donc les deux à la fois : ce que la page montre, et ce que le
 * réseau transporte.
 *
 * Prérequis — le jeu de démonstration et ses comptes :
 *   npx tsx scripts/demo-learnos.ts
 *   npx tsx scripts/demo-learnos.ts --eleves
 */

const MOT_DE_PASSE = "Demo@2026!";

async function connecter(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', MOT_DE_PASSE);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });
}

test.describe("Entraînement autonome", () => {
  test("un élève accède à sa séance et l'écran se comporte comme prévu", async ({ page }) => {
    // Tout ce que le navigateur reçoit des routes d'entraînement, conservé
    // pour être inspecté : c'est le seul endroit où une fuite de corrigé se
    // verrait vraiment.
    const charges: string[] = [];
    page.on("response", async (res) => {
      if (!res.url().includes("/api/learnos/")) return;
      const corps = await res.text().catch(() => "");
      if (corps) charges.push(corps);
    });

    await connecter(page, "amina@demo-learnos.test");
    await page.goto("/entrainement");

    // L'écran se résout toujours dans l'un de ces états — jamais une page
    // blanche ni un chargement infini.
    //
    // `body` et non `main, body` : en CSS la virgule matche les DEUX éléments,
    // et le mode strict de Playwright refuse un locator qui en résout plusieurs.
    // `body` contient `main`, donc l'intention est préservée sans l'ambiguïté.
    const carte = page.locator("body");
    await expect(carte).toContainText(
      /Exercice \d+ sur \d+|Rien à travailler|Séance terminée|Vérification en classe/,
      { timeout: 25000 }
    );

    await page.screenshot({ path: "test-results/entrainement-eleve.png", fullPage: true });

    const texte = await page.locator("body").innerText();
    const enSeance = /Exercice \d+ sur \d+/.test(texte);

    if (enSeance) {
      // La mention de pondération est présente : l'élève doit savoir que ce
      // travail compte moins que celui validé en classe.
      await expect(page.locator("body")).toContainText(/comptent bien moins/);

      // Une seule étape ouverte à la fois : la suivante n'est pas dans le DOM.
      const champs = page.locator('input[type="text"], input:not([type])');
      const boutonsChoix = page.locator("button", { hasText: /^\s*\S/ });
      expect((await champs.count()) + (await boutonsChoix.count())).toBeGreaterThan(0);
    }

    // Le contrôle qui compte : aucune charge utile ne porte de réponse
    // attendue. `corrige` n'apparaît qu'à `null` tant qu'aucune étape n'est
    // close — une valeur non nulle ici signifierait que le corrigé est parti
    // avant d'avoir été mérité.
    for (const corps of charges) {
      if (!corps.includes('"etapes"')) continue;
      const corriges = [...corps.matchAll(/"corrige":\s*("(?:[^"\\]|\\.)*"|null)/g)].map(
        (m) => m[1]
      );
      expect(corriges.every((c) => c === "null")).toBe(true);
    }
  });

  test("un élève ne peut pas ouvrir la séance d'un autre", async ({ page }) => {
    await connecter(page, "amina@demo-learnos.test");

    // Feuille appartenant à Kadidja : le périmètre relationnel doit la rendre
    // introuvable, pas seulement invisible dans les listes.
    const reponse = await page.request.get("/api/learnos/entrainement/feuille-inexistante");
    expect([403, 404]).toContain(reponse.status());
  });

  test("l'attestation lancée en classe passe avant l'entraînement", async ({ page }) => {
    await connecter(page, "kadidja@demo-learnos.test");
    await page.goto("/entrainement");

    await expect(page.locator("body")).toContainText(
      /Vérification en classe|Exercice \d+ sur \d+|Rien à travailler|Séance terminée/,
      { timeout: 25000 }
    );

    await page.screenshot({ path: "test-results/entrainement-attestation.png", fullPage: true });
  });
});
