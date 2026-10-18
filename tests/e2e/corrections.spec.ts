import { test, expect, loginAs } from "./fixtures-roles";
import type { Page, FrameLocator } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { getAnneeCouranteLibelle } from "../../src/lib/annee-scolaire";

/**
 * Corrections assistées — parcours réel de l'adulte qui relit
 * ============================================================
 *
 * CE QUE CE FICHIER VÉRIFIE ET QUE LES AUTRES TESTS NE PEUVENT PAS
 * ---------------------------------------------------------------
 * Le banc d'essai (`scripts/_tmp_banc-corrections.ts`) prouve que la chaîne
 * serveur tient de bout en bout, et les tests unitaires prouvent les règles
 * isolées. Ni l'un ni l'autre ne dit ce qui **arrive réellement dans le
 * navigateur** : un écran peut afficher des critères que le fetch n'envoie pas,
 * un toast peut mentir sur ce qui a été écrit en base, et un bouton peut
 * valider avec une grille vide alors que l'adulte n'a rien touché.
 *
 * CE QU'IL COUVE, dans l'ordre :
 *   1. la file s'affiche avec les trois cartes (élève, énoncé, confiance,
 *      critères éditables), le budget du jour et la fiabilité observée ;
 *   2. l'adulte retient d'autres critères que la proposition : la note
 *      VALIDÉE en base vient de la grille (2+1=3), jamais d'un score client ;
 *   3. le rejet écrit REJETEE sans produire aucune preuve d'apprentissage ;
 *   4. l'API refuse un appel sans session (401), ignore un « score » falsifié
 *      envoyé par un client modifié, et rejoue à 409 sur une copie traitée.
 *
 * MODE D'EMPLOI DE LA BASE
 * Comme `invitation.spec.ts` : le test crée ses données DIRECTEMENT en base
 * (question + grille, classe, élève, trois corrections) dans le tenant du
 * compte QA, avec un marqueur horodaté, puis tout est supprimé en fin de
 * parcours — il ne dépend d'aucune correction de démonstration préexistante.
 */

const prisma = new PrismaClient();

/** Compte QA dont les compétences `entrainement:valider` ouvrent l'onglet. */
const COMPTE_ADULTE = "admin@qa-learnos.test";

const marqueur = `E2E-${Date.now().toString(36)}`;

// Données du parcours, résolues dans beforeAll.
let tenantId = "";
let siteId: string | null = null;
let adulteId = "";
let annee = "";
let questionId = "";
let classeId = "";
let eleveId = "";
let corrA = ""; // A_VALIDER, modèle propose c1+c2
let corrB = ""; // INCERTAINE, aucune réponse
let corrC = ""; // A_VALIDER, laissée intacte pour le test d'API

const GRILLE = {
  criteres: [
    { id: "c1", libelle: "Poser l'équation", points: 2 },
    { id: "c2", libelle: "Effectuer le calcul", points: 1 },
    { id: "c3", libelle: "Résultat avec unité", points: 1 },
  ],
  erreursAnticipees: [{ type: "CALCULATION_ERROR", description: "Oublie d'additionner le 5" }],
  explication: "On pose l'équation puis on additionne.",
};

const DETAILS = GRILLE.criteres.map((c) => ({
  id: c.id,
  libelle: c.libelle,
  points: c.points,
  reussi: c.id !== "c3",
  justification: "Proposition du modèle.",
}));


test.describe("Corrections assistées à valider", () => {
  // Le dev server compile à la demande et la base est distante (un PATCH de
  // validation prend 8 à 15 s). Le timeout est déclaré ici car
  // test.setTimeout() ne couvre PAS les hooks — beforeAll garde sinon 30 s.
  test.describe.configure({ mode: "serial", timeout: 120000 });

  // ---- Seed : QUESTION + CLASSE + ÉLÈVE ---------------------------------
  // Historise l'année sur la classe dès la création : la Time Machine
  // (getAnneeCouranteLibelle suit la date simulée) ne doit JAMAIS être
  // invoquée après — deux appels à deux dates simulées différentes (seed
  // vs. page) donneraient deux années différentes et une file vide.
  test.beforeAll(async () => {
    const adulte = await prisma.user.findUnique({
      where: { email: COMPTE_ADULTE },
      select: { id: true, role: true, isActive: true, siteId: true, tenantId: true },
    });
    if (!adulte?.tenantId || !adulte.isActive) {
      throw new Error(
        `Compte ${COMPTE_ADULTE} introuvable ou inactif : lancez scripts/qa-comptes-demo.ts.`
      );
    }
    if (!["TENANT_ADMIN", "PRINCIPAL"].includes(adulte.role)) {
      throw new Error(
        `Le rôle ${adulte.role} de ${COMPTE_ADULTE} n'a pas entrainement:valider.`
      );
    }
    adulteId = adulte.id;
    tenantId = adulte.tenantId;
    siteId = adulte.siteId;

    // UN SEUL APPEL à l'horloge démo par exécution, ici au seed : année
    // historisée sur la classe. Jamais d'appel ultérieur — une date simulée
    // différente donnerait une autre année et une file vide.
    const anneeCourante = await getAnneeCouranteLibelle(tenantId);
    if (!anneeCourante) {
      throw new Error(`Aucune année scolaire active pour le tenant ${tenantId}.`);
    }
    annee = anneeCourante;

    const competence = await prisma.competence.findFirst({
      where: { tenantId },
      select: { id: true },
      orderBy: { code: "asc" },
    });
    if (!competence) throw new Error(`Aucune compétence pour le tenant ${tenantId}.`);

    const question = await prisma.question.create({
      data: {
        tenantId,
        siteId,
        competenceId: competence.id,
        palier: "APPLICATION",
        enonce: "Banc E2E : résous 3x + 5 = 20.",
        bareme: 4,
        grille: GRILLE,
        grilleVersion: 1,
        origine: "humain",
      },
      select: { id: true },
    });
    questionId = question.id;

    const classe = await prisma.classe.create({
      data: {
        tenantId,
        siteId,
        nom: `E2E Corrections ${marqueur}`,
        niveau: "Terminale",
        annee,
      },
      select: { id: true },
    });
    classeId = classe.id;

    const eleve = await prisma.eleve.create({
      data: {
        tenantId,
        siteId,
        matricule: marqueur,
        nom: "Banc",
        prenom: "Essai",
        dateNaissance: new Date("2010-01-01"),
        classeId: classe.id,
        anneeInscription: annee,
      },
      select: { id: true },
    });
    eleveId = eleve.id;

    const creer = (reponse: string, statut: "A_VALIDER" | "INCERTAINE", confiance: number) =>
      prisma.correctionAssistee
        .create({
          data: {
            tenantId,
            siteId,
            eleveId: eleve.id,
            questionId: question.id,
            grilleVersion: 1,
            reponse,
            statut,
            score: 3,
            maxScore: 4,
            criteresReussis: ["c1", "c2"],
            details: DETAILS,
            erreurs: [],
            confiance,
            motifs: ["confiance_insuffisante"],
            modele: "banc-e2e",
            promptVersion: "v1",
          },
          select: { id: true },
        })
        .then((c) => c.id);

    corrA = await creer("3x + 5 = 20 donc x = 5", "A_VALIDER", 0.71);
    corrB = await creer("Je ne sais pas.", "INCERTAINE", 0.35);
    corrC = await creer("3x + 5 = 20 donc x = 5", "A_VALIDER", 0.8);
  });

  test.afterAll(async () => {
    // Rien ne subsiste : ni les corrections, ni leurs preuves, ni le profil
    // jumeau que la validation recalcule, ni l'élève / la question / la classe.
    await prisma.correctionAssistee.deleteMany({ where: { eleveId } });
    await prisma.learningEvidence.deleteMany({ where: { eleveId } });
    await prisma.studentLearningProfile.deleteMany({ where: { eleveId } });
    await prisma.recommandation.deleteMany({ where: { eleveId } });
    await prisma.planProgression.deleteMany({ where: { eleveId } });
    await prisma.eleve.deleteMany({ where: { id: eleveId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.classe.deleteMany({ where: { id: classeId } });
    await prisma.$disconnect();
  });

  // Ouvrir l'iframe du module puis entrer dedans : le contenu de
  // /recommandations ne vit QUE dans l'iframe du workspace ; le document
  // parent n'est que la coquille (dock, header). Sans ce cadrage, le test
  // vérifiait une coquille vide.
  async function dansLeModule(page: Page): Promise<FrameLocator> {
    const cadre = page.frameLocator("iframe").first();
    await expect(
      cadre.getByText("Corrections assistées à valider", { exact: false }).first()
    ).toBeVisible({ timeout: 30000 });
    return cadre;
  }

  test("la file, le budget et la fiabilité s'affichent", async ({ page }) => {
    await loginAs(page, "TENANT_ADMIN");
    await page.goto("/recommandations", { waitUntil: "domcontentloaded" });

    const cadre = await dansLeModule(page);

    // Les trois cartes sont là, identifiables par l'id réel de la correction —
    // le seul endroit où l'on voit que l'écran montre BIEN nos données.
    const carteA = cadre.getByTestId(`correction-${corrA}`);
    const carteB = cadre.getByTestId(`correction-${corrB}`);
    const carteC = cadre.getByTestId(`correction-${corrC}`);
    await expect(carteA).toBeVisible({ timeout: 25000 });
    await expect(carteB).toBeVisible();
    await expect(carteC).toBeVisible();

    // Contenu de la carte : élève, énoncé, confiance, note proposée.
    await expect(carteA).toContainText("Essai Banc");
    await expect(carteA).toContainText("Banc E2E : résous 3x + 5 = 20.");
    await expect(carteA).toContainText("71 %");
    await expect(carteA).toContainText("3 / 4");

    // Les critères de la grille sont éditables — c'est LE point de l'écran.
    // La proposition du modèle (c1+c2) est pré-cochée ; c3 ne l'est pas.
    await expect(carteA.getByRole("checkbox", { name: "Poser l'équation" })).toBeVisible();
    await expect(carteA.getByRole("checkbox", { name: "Effectuer le calcul" })).toBeVisible();
    await expect(carteA.getByRole("checkbox", { name: "Résultat avec unité" })).toBeVisible();
    await expect(carteA.getByRole("checkbox", { name: "Poser l'équation" })).toBeChecked();
    await expect(carteA.getByRole("checkbox", { name: "Effectuer le calcul" })).toBeChecked();
    await expect(carteA.getByRole("checkbox", { name: "Résultat avec unité" })).not.toBeChecked();

    // L'incertitude est visible autrement que par la couleur du bord.
    await expect(carteB).toContainText("35 %");

    // Budget IA du jour : chiffres, pas carte vide.
    await expect(cadre.locator("body")).toContainText("Budget IA du jour");
    await expect(cadre.locator("body")).toContainText(/\d+ \/ \d+ corrections restantes/);

    // Fiabilité : soit des mesures, soit l'aveu qu'il n'y en a pas assez.
    await expect(cadre.locator("body")).toContainText("Fiabilité du correcteur");
    await expect(cadre.locator("body")).toContainText(
      /Pas assez de données|Taux de confirmation/
    );

    await page.screenshot({ path: "test-results/corrections-file.png", fullPage: true });
  });

  test("l'adulte retient d'autres critères : la note vient de la grille", async ({ page }) => {
    await loginAs(page, "TENANT_ADMIN");
    await page.goto("/recommandations", { waitUntil: "domcontentloaded" });

    const cadre = await dansLeModule(page);
    const carte = cadre.getByTestId(`correction-${corrA}`);
    await expect(carte).toBeVisible({ timeout: 25000 });

    // Le modèle proposait c1+c2 pré-cochés ; l'adulte retient c1+c3
    // (écart volontaire, le même que le banc d'essai : 2+1=3, deux écarts).
    // Premier clic : un seul bascule, prouvant que les cases sont éditables.
    await expect(carte.getByRole("checkbox", { name: "Poser l'équation" })).toBeChecked();
    await carte.getByRole("checkbox", { name: "Effectuer le calcul" }).click();
    await expect(carte.getByRole("checkbox", { name: "Effectuer le calcul" })).not.toBeChecked();
    await expect(carte.getByRole("checkbox", { name: "Poser l'équation" })).toBeChecked();
    await carte.getByRole("checkbox", { name: "Résultat avec unité" }).click();
    await expect(carte.getByRole("checkbox", { name: "Résultat avec unité" })).toBeChecked();

    await carte.getByRole("button", { name: "Valider" }).click();

    // Le toast est la seule confirmation visible — il doit refléter le réel.
    // Timeout large : le PATCH serveur prend 8 à 15 s sur la base distante.
    await expect(cadre.locator("body")).toContainText("Correction validée", {
      timeout: 45000,
    });
    await expect(carte).toHaveCount(0);

    const corr = await prisma.correctionAssistee.findUnique({ where: { id: corrA } });
    expect(corr?.statut).toBe("VALIDEE");
    expect(corr?.criteresValides).toEqual(expect.arrayContaining(["c1", "c3"]));
    expect(corr?.criteresValides).toHaveLength(2);
    expect(corr?.scoreValide).toBe(3); // 2 + 1 : la grille décide, pas le client.
    expect(corr?.valideParId).toBe(adulteId);
    expect(corr?.evidenceId).toBeTruthy();

    // La preuve d'apprentissage est rattachée à la correction, de type
    // supervisé (EXERCICE), avec les scores de la grille.
    const preuve = corr?.evidenceId
      ? await prisma.learningEvidence.findUnique({ where: { id: corr.evidenceId } })
      : null;
    expect(preuve).not.toBeNull();
    expect(preuve?.sourceType).toBe("correction-assistee");
    expect(preuve?.sourceId).toBe(corrA);
    expect(preuve?.evidenceType).toBe("EXERCICE");
    expect(preuve?.rawScore).toBe(3);
    expect(preuve?.maxScore).toBe(4);

    // Le profil jumeau a été recalculé — la validation n'est pas cosmétique.
    const profil = await prisma.studentLearningProfile.findFirst({
      where: { eleveId },
      select: { evidenceCount: true },
    });
    expect(profil?.evidenceCount ?? 0).toBeGreaterThanOrEqual(1);
  });

  test("le rejet n'écrit aucune preuve", async ({ page }) => {
    await loginAs(page, "TENANT_ADMIN");
    await page.goto("/recommandations", { waitUntil: "domcontentloaded" });

    const cadre = await dansLeModule(page);
    const carte = cadre.getByTestId(`correction-${corrB}`);
    await expect(carte).toBeVisible({ timeout: 25000 });
    await carte.getByRole("button", { name: "Rejeter" }).click();

    await expect(cadre.locator("body")).toContainText("Correction rejetée", {
      // Même latence serveur que la validation.
      timeout: 45000,
    });
    await expect(carte).toHaveCount(0);

    const corr = await prisma.correctionAssistee.findUnique({ where: { id: corrB } });
    expect(corr?.statut).toBe("REJETEE");
    expect(corr?.evidenceId).toBeNull();
    expect(corr?.scoreValide).toBeNull();

    const preuve = await prisma.learningEvidence.findFirst({
      where: { sourceType: "correction-assistee", sourceId: corrB },
    });
    expect(preuve).toBeNull();
  });

  test("l'API refuse un client modifié et un appel sans session", async ({ page, request }) => {
    // 1. Sans session : refus avant toute écriture.
    const sansSession = await request.patch(`/api/learnos/corrections/${corrC}`, {
      data: { criteresValides: ["c1"] },
    });
    expect(sansSession.status()).toBe(401);

    await loginAs(page, "TENANT_ADMIN");

    // 2. Un « score » trafiqué dans le corps est ignoré : la note vient de la
    //    grille (c1 = 2 points), donc 2 et non 99.
    const trafiquee = await page.request.patch(`/api/learnos/corrections/${corrC}`, {
      data: { criteresValides: ["c1"], score: 99 },
    });
    expect(trafiquee.status()).toBe(200);
    const corps = await trafiquee.json();
    expect(corps.resultat.score).toBe(2);
    const corr = await prisma.correctionAssistee.findUnique({ where: { id: corrC } });
    expect(corr?.scoreValide).toBe(2);

    // 3. Rejouer la même validation est refusée : la copie est déjà traitée.
    const rejouee = await page.request.patch(`/api/learnos/corrections/${corrC}`, {
      data: { criteresValides: ["c1", "c2"] },
    });
    expect(rejouee.status()).toBe(409);
    expect((await rejouee.json()).code).toBe("deja_traitee");
  });
});
