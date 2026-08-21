import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withRlsContext, withSystemContext } from "@/lib/rls-context";
import { withRlsExtension } from "@/lib/prisma-rls";

/**
 * EcolPro — Preuve d'isolation multi-tenant au niveau BASE DE DONNÉES
 * ===================================================================
 *
 * CE QUE CES TESTS PROUVENT — ET POURQUOI ILS EXISTENT
 * Les tests unitaires existants (site-scope, permissions, tenant-claims)
 * vérifient que le CODE construit les bons filtres. Ils ne peuvent rien
 * dire du cas qui compte vraiment : une requête qui aurait oublié le
 * filtre. Ici, on interroge délibérément la base SANS filtre applicatif,
 * et on exige que PostgreSQL ne rende quand même que les lignes du tenant
 * courant.
 *
 * C'est la contrepartie technique de ce que Supabase apportait : un filet
 * en base, indépendant de la vigilance de l'ORM.
 *
 * PRÉREQUIS : le labo fidèle à la production doit tourner.
 *     make test-db-up
 * Le Postgres de développement ordinaire ne convient PAS : son rôle unique
 * est superutilisateur, et un superutilisateur contourne la RLS — tous ces
 * tests y passeraient au vert sans rien prouver. La garde ci-dessous le
 * vérifie explicitement.
 */

const LAB_URL =
  process.env.RLS_TEST_DATABASE_URL ??
  "postgresql://ecolpro_app:test_app_local_only@127.0.0.1:55433/ecolpro_test?sslmode=require";
const LAB_OWNER_URL =
  process.env.RLS_TEST_OWNER_URL ??
  "postgresql://ecolpro_owner:test_owner_local_only@127.0.0.1:55433/ecolpro_test?sslmode=require";

/** Rôle propriétaire : sert UNIQUEMENT à préparer le jeu de données. */
const owner = new PrismaClient({ datasources: { db: { url: LAB_OWNER_URL } } });

/** Rôle applicatif, exactement celui de la production, contexte RLS posé. */
const appRaw = new PrismaClient({ datasources: { db: { url: LAB_URL } } });
const app = withRlsExtension(appRaw);

const A = { tenant: "", site1: "", site2: "" };
const B = { tenant: "", site1: "" };

async function seed() {
  const now = new Date("2010-05-05");
  const ta = await owner.tenant.create({
    data: { name: "École A", slug: `rls-a-${Date.now()}`, country: "DJ" },
  });
  const tb = await owner.tenant.create({
    data: { name: "École B", slug: `rls-b-${Date.now()}`, country: "DJ" },
  });
  const a1 = await owner.site.create({ data: { tenantId: ta.id, nom: "A — Campus 1" } });
  const a2 = await owner.site.create({ data: { tenantId: ta.id, nom: "A — Campus 2" } });
  const b1 = await owner.site.create({ data: { tenantId: tb.id, nom: "B — Campus 1" } });

  A.tenant = ta.id; A.site1 = a1.id; A.site2 = a2.id;
  B.tenant = tb.id; B.site1 = b1.id;

  const eleve = (tenantId: string, siteId: string | null, nom: string) => ({
    tenantId, siteId, matricule: `M-${nom}`, nom, prenom: "Test",
    dateNaissance: now, anneeInscription: "2025-2026",
  });

  await owner.eleve.createMany({
    data: [
      eleve(ta.id, a1.id, "A1-un"),
      eleve(ta.id, a1.id, "A1-deux"),
      eleve(ta.id, a2.id, "A2-un"),
      eleve(ta.id, null, "A-sans-site"),
      eleve(tb.id, b1.id, "B1-un"),
      eleve(tb.id, null, "B-sans-site"),
    ],
  });
}

async function cleanup() {
  for (const t of [A.tenant, B.tenant].filter(Boolean)) {
    await owner.tenant.delete({ where: { id: t } }).catch(() => {});
  }
}

/** Contexte type d'un utilisateur ordinaire. */
const ctx = (tenantId: string, siteIds: string[]) => ({
  tenantId, siteId: siteIds[0] ?? null, siteIds, superAdmin: false,
});

beforeAll(async () => {
  // Garde 1 — le labo doit être joignable.
  await owner.$queryRaw`SELECT 1`.catch(() => {
    throw new Error(
      "Labo RLS injoignable. Démarrer avec :  make test-db-up"
    );
  });

  // Garde 2 — le rôle de test ne doit PAS pouvoir contourner la RLS,
  // sans quoi la suite entière serait un faux positif.
  const [role] = await appRaw.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
    SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
  `;
  if (role.rolsuper || role.rolbypassrls) {
    throw new Error(
      "Le rôle de test contourne la RLS (superuser ou BYPASSRLS) : ces tests " +
      "ne prouveraient rien. Utiliser le labo (make test-db-up), pas " +
      "docker-compose.dev.yml."
    );
  }

  // Garde 3 — les politiques doivent être en place.
  const [{ count }] = await owner.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count FROM pg_policies WHERE schemaname = 'public'
  `;
  if (Number(count) < 100) {
    throw new Error(
      `Seulement ${count} politiques RLS en base. Appliquer :  make rls-apply-test`
    );
  }

  await cleanup();
  await seed();
});

afterAll(async () => {
  await cleanup();
  await owner.$disconnect();
  await appRaw.$disconnect();
});

describe("Isolation par tenant", () => {
  it("une requête SANS filtre applicatif ne rend que les élèves du tenant courant", async () => {
    // Aucun `where: { tenantId }` — c'est tout l'intérêt : on simule la
    // requête qui a oublié son filtre.
    const vus = await withRlsContext(ctx(A.tenant, [A.site1, A.site2]), () =>
      app.eleve.findMany({ select: { nom: true, tenantId: true } })
    );

    expect(vus.length).toBeGreaterThan(0);
    expect(vus.every((e) => e.tenantId === A.tenant)).toBe(true);
    expect(vus.map((e) => e.nom).sort()).toEqual(["A-sans-site", "A1-deux", "A1-un", "A2-un"]);
  });

  it("le tenant B ne voit aucune donnée de A", async () => {
    const vus = await withRlsContext(ctx(B.tenant, [B.site1]), () =>
      app.eleve.findMany({ select: { nom: true } })
    );
    expect(vus.map((e) => e.nom).sort()).toEqual(["B-sans-site", "B1-un"]);
  });

  it("lire un élève d'un autre tenant par son identifiant exact renvoie null (anti-IDOR)", async () => {
    const cible = await owner.eleve.findFirst({ where: { nom: "B1-un" } });
    const vu = await withRlsContext(ctx(A.tenant, [A.site1]), () =>
      app.eleve.findUnique({ where: { id: cible!.id } })
    );
    expect(vu).toBeNull();
  });

  it("compter sans filtre ne compte que son propre tenant", async () => {
    const n = await withRlsContext(ctx(B.tenant, [B.site1]), () => app.eleve.count());
    expect(n).toBe(2);
  });
});

describe("Isolation par site", () => {
  it("un utilisateur rattaché au seul site 1 ne voit pas les élèves du site 2", async () => {
    const vus = await withRlsContext(ctx(A.tenant, [A.site1]), () =>
      app.eleve.findMany({ select: { nom: true } })
    );
    // Les lignes sans site (niveau tenant) restent visibles : ce sont des
    // enregistrements communs à l'établissement, pas des données de site.
    expect(vus.map((e) => e.nom).sort()).toEqual(["A-sans-site", "A1-deux", "A1-un"]);
  });

  it("un utilisateur sans aucun rattachement de site ne voit que le niveau tenant", async () => {
    const vus = await withRlsContext(ctx(A.tenant, []), () =>
      app.eleve.findMany({ select: { nom: true } })
    );
    expect(vus.map((e) => e.nom)).toEqual(["A-sans-site"]);
  });
});

describe("Protection des ÉCRITURES (WITH CHECK)", () => {
  it("impossible de créer un élève au nom d'un autre tenant", async () => {
    await expect(
      withRlsContext(ctx(A.tenant, [A.site1]), () =>
        app.eleve.create({
          data: {
            tenantId: B.tenant, // ← usurpation
            matricule: "M-INTRUS", nom: "Intrus", prenom: "Test",
            dateNaissance: new Date("2010-01-01"), anneeInscription: "2025-2026",
          },
        })
      )
    ).rejects.toThrow();

    // Et rien n'a été écrit.
    expect(await owner.eleve.count({ where: { nom: "Intrus" } })).toBe(0);
  });

  it("modifier en masse n'atteint pas les lignes d'un autre tenant", async () => {
    const res = await withRlsContext(ctx(A.tenant, [A.site1, A.site2]), () =>
      app.eleve.updateMany({ data: { prenom: "Écrasé" } }) // sans aucun filtre
    );
    expect(res.count).toBe(4); // les 4 de A, pas les 6

    const bIntact = await owner.eleve.findMany({
      where: { tenantId: B.tenant }, select: { prenom: true },
    });
    expect(bIntact.every((e) => e.prenom === "Test")).toBe(true);
  });

  it("supprimer en masse n'atteint pas les lignes d'un autre tenant", async () => {
    const res = await withRlsContext(ctx(B.tenant, [B.site1]), () =>
      app.eleve.deleteMany({}) // sans aucun filtre
    );
    expect(res.count).toBe(2);
    expect(await owner.eleve.count({ where: { tenantId: A.tenant } })).toBe(4);

    // On remet B en place pour ne pas perturber d'éventuels tests suivants.
    await owner.eleve.createMany({
      data: [
        { tenantId: B.tenant, siteId: B.site1, matricule: "M-B1-un", nom: "B1-un",
          prenom: "Test", dateNaissance: new Date("2010-05-05"), anneeInscription: "2025-2026" },
        { tenantId: B.tenant, siteId: null, matricule: "M-B-sans", nom: "B-sans-site",
          prenom: "Test", dateNaissance: new Date("2010-05-05"), anneeInscription: "2025-2026" },
      ],
    });
  });
});

describe("Échec fermé", () => {
  it("sans contexte, la base ne rend RIEN (elle ne rend surtout pas tout)", async () => {
    // On court-circuite volontairement l'extension pour interroger la base
    // telle qu'elle est, sans contexte posé.
    const lignes = await appRaw.$queryRaw<{ nom: string }[]>`SELECT nom FROM eleves`;
    expect(lignes).toHaveLength(0);
  });

  it("le contexte ne survit pas à la transaction (sécurité PgBouncer)", async () => {
    await withRlsContext(ctx(A.tenant, [A.site1]), () => app.eleve.count());
    // Nouvelle requête hors extension : la connexion a été rendue au pool,
    // le contexte doit avoir disparu avec la transaction précédente.
    const [{ tenant }] = await appRaw.$queryRaw<{ tenant: string | null }[]>`
      SELECT current_tenant_id() AS tenant
    `;
    expect(tenant).toBeNull();
  });
});

describe("Franchissement volontaire", () => {
  it("withSystemContext voit tous les tenants — et c'est explicite", async () => {
    const vus = await withSystemContext("test d'isolation", () =>
      app.eleve.findMany({ select: { tenantId: true } })
    );
    const tenants = new Set(vus.map((e) => e.tenantId));
    expect(tenants.has(A.tenant)).toBe(true);
    expect(tenants.has(B.tenant)).toBe(true);
  });
});
