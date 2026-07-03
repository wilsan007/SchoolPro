import { test, expect } from "./fixtures";

test.describe("Emploi du temps", () => {
  test("afficher la grille hebdomadaire", async ({ authedPage: page }) => {
    await page.goto("/emploi-du-temps");
    await expect(page.locator("text=Emploi").first()).toBeVisible({ timeout: 10000 });
    // Vérifier la présence des jours (Dimanche-Jeudi)
    await expect(page.locator("text=Dim").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Jeu").first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Bulletins", () => {
  test("page de gestion des bulletins", async ({ authedPage: page }) => {
    await page.goto("/notes/bulletins");
    await expect(page.locator("text=Générer").first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Navigation — pages principales", () => {
  const routes = [
    { path: "/dashboard", title: "Tableau de bord" },
    { path: "/eleves", title: "Élèves" },
    { path: "/absences", title: "Absences" },
    { path: "/notes", title: "Notes" },
    { path: "/evaluations", title: "Évaluations" },
    { path: "/emploi-du-temps", title: "Emploi" },
    { path: "/facturation", title: "Facturation" },
    { path: "/communication", title: "Communication" },
    { path: "/rapports", title: "Rapports" },
    { path: "/parametres", title: "Paramètres" },
    { path: "/vie-scolaire", title: "Vie" },
    { path: "/cours", title: "Cours" },
    { path: "/analytics", title: "Analytics" },
  ];

  for (const route of routes) {
    test(`${route.path} retourne 200`, async ({ authedPage: page }) => {
      const res = await page.goto(route.path);
      expect(res?.status()).toBeLessThan(400);
    });
  }
});
