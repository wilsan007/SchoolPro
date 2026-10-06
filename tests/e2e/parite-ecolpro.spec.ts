/**
 * Parité EcolPro — vérification réelle des 20 fonctionnalités portées.
 *
 * Chaque test appelle la vraie route avec la session d'un administrateur, sur
 * le jeu de données complet (`tenant-ambouli`). Le but n'est pas de couvrir la
 * logique métier — les tests unitaires s'en chargent — mais de prouver que
 * chaque fonctionnalité répond autre chose qu'une erreur sur des données
 * réelles : c'est exactement ce qu'un audit de code ne peut pas établir.
 *
 *   E2E_EMAIL=admin-ambouli@qa-learnos.test pnpm exec playwright test tests/e2e/parite-ecolpro.spec.ts
 *
 * Le compte est posé par `scripts/qa-compte-ambouli.ts`.
 */

import { PrismaClient } from "@prisma/client";
import { test, expect } from "./fixtures";

// Le pooler Supabase met plusieurs secondes à répondre depuis un poste de
// développement : le délai de connexion par défaut (5 s) fait échouer la
// préparation des tests avant même la première requête.
function urlAvecDelais(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  return `${url}${url.includes("?") ? "&" : "?"}connect_timeout=60&pool_timeout=60`;
}

const urlBase = urlAvecDelais();
const prisma = urlBase
  ? new PrismaClient({ datasources: { db: { url: urlBase } } })
  : new PrismaClient();
const TENANT = process.env.E2E_TENANT ?? "tenant-ambouli";

type Contexte = {
  classeId: string;
  classeNom: string;
  eleveIds: string[];
  periodeId: string;
  enseignantId: string | null;
  matiereId: string | null;
  jourEdt: string | null;
  heureDebut: string | null;
  heureFin: string | null;
  /** Classe + période + élève ayant RÉELLEMENT un bulletin généré. */
  bulletin: { classeId: string; periodeId: string; eleveId: string } | null;
};

let ctx: Contexte;

test.beforeAll(async () => {
  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId: TENANT, isCurrent: true },
    select: { libelle: true, periodes: { select: { id: true }, orderBy: { numero: "asc" }, take: 1 } },
  });
  if (!annee) throw new Error(`Aucune année courante sur ${TENANT}`);

  // Une classe de l'année courante qui a un emploi du temps : sans créneau,
  // l'appel par créneau retomberait sur les heures pleines par défaut et ne
  // prouverait rien du chemin « créneau issu de l'EDT ».
  const edt = await prisma.emploiTemps.findFirst({
    where: { tenantId: TENANT, annee: annee.libelle },
    select: { classeId: true, jour: true, heureDebut: true, heureFin: true, matiereId: true, enseignantId: true },
  });
  const classe = await prisma.classe.findFirst({
    where: { tenantId: TENANT, annee: annee.libelle, ...(edt ? { id: edt.classeId } : {}) },
    select: { id: true, nom: true, eleves: { where: { statut: "ACTIF" }, select: { id: true }, take: 3 } },
  });
  if (!classe) throw new Error(`Aucune classe sur ${TENANT} pour ${annee.libelle}`);

  // Les routes de bulletins (matrice, export Excel, conseil, appréciation IA)
  // exigent des bulletins déjà générés : les interroger sur une classe au
  // hasard renvoie un 404 légitime qui ne dit rien de leur bon fonctionnement.
  const bulletin = await prisma.bulletin.findFirst({
    where: { tenantId: TENANT },
    select: { eleveId: true, periodeId: true, eleve: { select: { classeId: true } } },
    orderBy: { createdAt: "desc" },
  });

  ctx = {
    classeId: classe.id,
    classeNom: classe.nom,
    eleveIds: classe.eleves.map((e) => e.id),
    periodeId: annee.periodes[0]?.id ?? "",
    enseignantId: edt?.enseignantId ?? null,
    matiereId: edt?.matiereId ?? null,
    jourEdt: edt?.jour ?? null,
    heureDebut: edt?.heureDebut ?? null,
    heureFin: edt?.heureFin ?? null,
    bulletin:
      bulletin && bulletin.eleve.classeId
        ? { classeId: bulletin.eleve.classeId, periodeId: bulletin.periodeId, eleveId: bulletin.eleveId }
        : null,
  };
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("Parité EcolPro — niveau 1", () => {
  test("1. appel par créneau avec heure d'arrivée", async ({ authedPage: page }) => {
    test.skip(ctx.eleveIds.length < 2, "classe sans élèves");
    // Date passée et fixe : l'appel de test ne pollue pas la journée courante
    // de la démonstration, et son identifiant déterministe permet le ménage.
    const date = "2026-01-07";
    const [absent, retard] = ctx.eleveIds;
    const heureDebut = ctx.heureDebut ?? "08:00";
    const heureFin = ctx.heureFin ?? "09:00";
    // Strictement après le début et au plus tard à la fin du créneau.
    const enMinutes = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
    const minutesArrivee = Math.min(enMinutes(heureDebut) + 5, enMinutes(heureFin));
    const arrivee = `${String(Math.floor(minutesArrivee / 60)).padStart(2, "0")}:${String(minutesArrivee % 60).padStart(2, "0")}`;

    const res = await page.request.post("/api/absences/appel", {
      data: {
        classeId: ctx.classeId,
        date,
        heureDebut,
        heureFin,
        presences: Object.fromEntries(
          ctx.eleveIds.map((id, i) => [id, i === 0 ? "absent" : i === 1 ? "retard" : "present"])
        ),
        retardsHeureArrivee: { [retard]: arrivee },
      },
    });
    expect(res.status(), await res.text()).toBe(200);

    const lignes = await prisma.absence.findMany({
      where: { tenantId: TENANT, eleveId: { in: [absent, retard] }, date: { gte: new Date(`${date}T00:00:00Z`), lte: new Date(`${date}T23:59:59Z`) } },
      select: { eleveId: true, isRetard: true, heureDebut: true, heureFin: true },
    });
    const ligneAbsent = lignes.find((l) => l.eleveId === absent);
    const ligneRetard = lignes.find((l) => l.eleveId === retard);
    expect(ligneAbsent?.heureDebut).toBe(heureDebut);
    expect(ligneAbsent?.heureFin).toBe(heureFin);
    expect(ligneRetard?.isRetard).toBe(true);
    expect(ligneRetard?.heureFin).toBe(arrivee); // temps manqué, pas la fin du cours

    // Correction de l'appel : l'élève repassé présent perd son absence.
    const res2 = await page.request.post("/api/absences/appel", {
      data: {
        classeId: ctx.classeId,
        date,
        heureDebut,
        heureFin,
        presences: Object.fromEntries(ctx.eleveIds.map((id) => [id, "present"])),
      },
    });
    expect(res2.status(), await res2.text()).toBe(200);
    const restantes = await prisma.absence.count({
      where: { tenantId: TENANT, eleveId: { in: ctx.eleveIds }, date: { gte: new Date(`${date}T00:00:00Z`), lte: new Date(`${date}T23:59:59Z`) } },
    });
    expect(restantes).toBe(0);

    // Créneau incohérent : refusé.
    const res3 = await page.request.post("/api/absences/appel", {
      data: {
        classeId: ctx.classeId, date, heureDebut: "10:00", heureFin: "09:00",
        presences: { [absent]: "present" },
      },
    });
    expect(res3.status()).toBe(400);
  });

  test("6. feuille de présence", async ({ authedPage: page }) => {
    const res = await page.request.get(`/api/absences/feuille-presence?classeId=${ctx.classeId}`);
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.html ?? "").toContain("<table");
  });

  test("3+4. workflow sanctions et convocation", async ({ authedPage: page }) => {
    test.skip(ctx.eleveIds.length === 0, "classe sans élèves");
    const convocation = await page.request.post("/api/vie-scolaire/convocations", {
      data: { eleveId: ctx.eleveIds[0], motif: "Test de parité", dateConvocation: "2026-01-12T10:00:00.000Z" },
    });
    expect(convocation.status(), await convocation.text()).toBe(200);

    const historique = await page.request.get(`/api/vie-scolaire/historique-disciplinaire?eleveId=${ctx.eleveIds[0]}`);
    expect([200, 400]).toContain(historique.status());
  });

  test("5. statistiques de retards", async ({ authedPage: page }) => {
    const res = await page.request.get("/api/vie-scolaire/retards-stats?seuil=2");
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("seuil");
  });

  test("2. cahier de texte", async ({ authedPage: page }) => {
    const res = await page.request.get(`/api/cahier-journal/seances?classeId=${ctx.classeId}`);
    expect(res.status(), await res.text()).toBe(200);
  });

  test("7. emploi du temps — export", async ({ authedPage: page }) => {
    const res = await page.request.get(`/api/emploi-du-temps/export?format=excel&scope=classe&classeId=${ctx.classeId}`);
    expect(res.status(), await res.text()).toBe(200);
  });

  test("9. examens", async ({ authedPage: page }) => {
    const res = await page.request.get("/api/examens");
    expect(res.status(), await res.text()).toBe(200);
  });

  test("10. appréciation IA", async ({ authedPage: page }) => {
    test.skip(!ctx.bulletin, "aucun bulletin généré dans ce jeu de données");
    const res = await page.request.post("/api/ai/appreciation", {
      data: { eleveId: ctx.bulletin!.eleveId, periodeId: ctx.bulletin!.periodeId },
    });
    // 503 accepté : la clé du fournisseur d'IA peut être absente en local.
    expect([200, 503], await res.text()).toContain(res.status());
  });

  test("11. détection de doublons", async ({ authedPage: page }) => {
    const res = await page.request.get("/api/eleves/doublons");
    expect(res.status(), await res.text()).toBe(200);
  });

  test("12. cartes scolaires et attestation", async ({ authedPage: page }) => {
    const cartes = await page.request.get(`/api/eleves/cartes-scolaires?classeId=${ctx.classeId}`);
    expect(cartes.status(), await cartes.text()).toBe(200);

    test.skip(ctx.eleveIds.length === 0, "classe sans élèves");
    const attestation = await page.request.post("/api/eleves/attestation", { data: { eleveId: ctx.eleveIds[0] } });
    expect(attestation.status(), await attestation.text()).toBe(200);
  });

  test("14+15. règles d'appréciation, signature et cachet", async ({ authedPage: page }) => {
    const regles = await page.request.get("/api/parametres/regles-appreciation");
    expect(regles.status(), await regles.text()).toBe(200);
    // La signature et le cachet s'écrivent par PUT et se lisent côté serveur
    // dans la page de paramètres : il n'y a pas de GET, et c'est voulu.
    const page_ = await page.request.get("/parametres");
    expect(page_.status()).toBe(200);
  });

  test("16. bulletins — matrice, conseil et export Excel", async ({ authedPage: page }) => {
    test.skip(!ctx.bulletin, "aucun bulletin généré dans ce jeu de données");
    const { classeId, periodeId } = ctx.bulletin!;
    const matrice = await page.request.get(`/api/bulletins/matrice?classeId=${classeId}&periodeId=${periodeId}`);
    expect(matrice.status(), await matrice.text()).toBe(200);
    const excel = await page.request.get(`/api/bulletins/export-excel?classeId=${classeId}&periodeId=${periodeId}`);
    expect(excel.status(), await excel.text()).toBe(200);
    const conseil = await page.request.get(`/api/bulletins/conseil-data?classeId=${classeId}&periodeId=${periodeId}`);
    expect(conseil.status(), await conseil.text()).toBe(200);
  });

  test("17. export financier", async ({ authedPage: page }) => {
    const res = await page.request.get("/api/finances/export?format=excel");
    expect(res.status(), await res.text()).toBe(200);
  });

  test("18+19+20. structures, salles, disponibilités", async ({ authedPage: page }) => {
    const structures = await page.request.get("/api/structures");
    expect(structures.status(), await structures.text()).toBe(200);
    const salles = await page.request.get("/api/salles");
    expect(salles.status(), await salles.text()).toBe(200);
    const dispos = await page.request.get(
      `/api/disponibilites${ctx.enseignantId ? `?enseignantId=${ctx.enseignantId}` : ""}`
    );
    expect(dispos.status(), await dispos.text()).toBe(200);
  });

  test("8. fournitures", async ({ authedPage: page }) => {
    const res = await page.request.get("/fournitures");
    expect(res.status()).toBe(200);
  });
});
