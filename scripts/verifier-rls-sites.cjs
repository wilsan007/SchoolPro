/**
 * Vérifie que le filtrage par site est EFFECTIF en base, table par table.
 *
 *   node --env-file=.env --env-file=.env.local scripts/verifier-rls-sites.cjs [--repetition] [--tenant=<id>]
 *
 * Lecture seule. Pour chaque table rattachée à un site, compare ce qu'un rôle
 * SOUMIS à la RLS voit dans chaque périmètre avec le compte de référence :
 *   hérité (ancien contexte) et 'all' → tout le tenant ;
 *   'sites' [A]                       → lignes du site A + lignes sans site ;
 *   'sites' [A, B]                    → tout ;
 *   'none'                            → rien.
 * Tout s'exécute dans des transactions annulées.
 *
 * --repetition : applique d'abord migration_rls_site_scope.sql DANS la
 * transaction (annulée à la fin) — pour valider la migration avant de l'écrire.
 * ATTENTION : la transaction verrouille les tables concernées le temps de la
 * vérification. À réserver à une base sans trafic.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const REPETITION = process.argv.includes("--repetition");
const TENANT = (process.argv.find((a) => a.startsWith("--tenant=")) ?? "--tenant=tenant-ambouli").split("=")[1];
const ROLE = "authenticated";

// Tables sans colonne siteId : le site est celui du parent.
const PAR_RELATION = {
  absences: `(select e."siteId" from eleves e where e.id = t."eleveId")`,
  bulletins: `(select e."siteId" from eleves e where e.id = t."eleveId")`,
  bulletin_matieres: `(select e."siteId" from bulletins b join eleves e on e.id = b."eleveId" where b.id = t."bulletinId")`,
  dispenses_matiere: `(select e."siteId" from eleves e where e.id = t."eleveId")`,
  documents: `(select e."siteId" from eleves e where e.id = t."eleveId")`,
  emplois_temps: `(select c."siteId" from classes c where c.id = t."classeId")`,
  evaluations: `(select c."siteId" from classes c where c.id = t."classeId")`,
  incidents: `(select e."siteId" from eleves e where e.id = t."eleveId")`,
  notes: `(select e."siteId" from eleves e where e.id = t."eleveId")`,
  parcours_scolaires: `(select e."siteId" from eleves e where e.id = t."eleveId")`,
  contenus_cours: `(select c."siteId" from cours c where c.id = t."coursId")`,
  progressions_eleves: `(select c."siteId" from cours c where c.id = t."coursId")`,
  paiements: `(select f."siteId" from factures f where f.id = t."factureId")`,
  sanctions: `(select e."siteId" from incidents i join eleves e on e.id = i."eleveId" where i.id = t."incidentId")`,
  sessions_examen: `(select ex."siteId" from examens ex where ex.id = t."examId")`,
};
// Tenant d'une ligne quand la table n'a pas de colonne tenantId.
const TENANT_DU_PARENT = {
  contenus_cours: `(select c."tenantId" from cours c where c.id = t."coursId")`,
  progressions_eleves: `(select c."tenantId" from cours c where c.id = t."coursId")`,
  paiements: `(select f."tenantId" from factures f where f.id = t."factureId")`,
  sanctions: `(select i."tenantId" from incidents i where i.id = t."incidentId")`,
  sessions_examen: `(select ex."tenantId" from examens ex where ex.id = t."examId")`,
};

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("BEGIN");
  try {
    await c.query("SET LOCAL statement_timeout = '240s'");
    if (REPETITION) {
      await c.query(fs.readFileSync(path.join(__dirname, "..", "migration_rls_site_scope.sql"), "utf8"));
      console.log("Répétition : migration appliquée dans la transaction (sera annulée).");
    }
    const sites = (await c.query(`select id from sites where "tenantId" = $1 order by id`, [TENANT])).rows.map((r) => r.id);
    if (sites.length < 2) throw new Error(`le tenant ${TENANT} doit avoir au moins deux sites`);
    const [A, B] = sites;

    const cols = (await c.query(`
      select k.relname nom, k.relrowsecurity rls,
             exists (select 1 from information_schema.columns x where x.table_schema='public' and x.table_name=k.relname and x.column_name='siteId') a_site,
             exists (select 1 from information_schema.columns x where x.table_schema='public' and x.table_name=k.relname and x.column_name='tenantId') a_tenant,
             has_table_privilege($1, k.oid, 'select') lisible
        from pg_class k where k.relnamespace='public'::regnamespace and k.relkind='r' order by 1`, [ROLE])).rows;

    const cibles = cols.filter((t) => (t.a_site || PAR_RELATION[t.nom]) && !["users", "user_sites", "enseignant_sites"].includes(t.nom));
    const resultats = [];
    const ecarts = [];
    const ignorees = [];
    let vides = 0;

    for (const t of cibles) {
      const site = t.a_site ? `t."siteId"` : PAR_RELATION[t.nom];
      const tenant = t.a_tenant ? `t."tenantId"` : TENANT_DU_PARENT[t.nom];
      if (!t.rls || !t.lisible || !tenant) { ignorees.push(`${t.nom} (${!t.rls ? "RLS désactivée" : !t.lisible ? "non lisible par " + ROLE : "tenant indéterminé"})`); continue; }

      // Référence, lue sans RLS.
      const ref = (await c.query(`select count(*)::int total,
          count(*) filter (where s = $2)::int sur_a, count(*) filter (where s = $3)::int sur_b,
          count(*) filter (where s is null)::int sans_site
        from (select ${site} s from "${t.nom}" t where ${tenant} = $1) x`, [TENANT, A, B])).rows[0];

      if (ref.total === 0) { vides++; continue; }
      const lit = (v) => (v === null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
      // Un seul aller-retour par cas : rôle soumis à la RLS, contexte, compte, retour au rôle d'origine.
      const voir = async (ctx) => {
        const r = await c.query(`SET LOCAL ROLE ${ROLE}; ${ctx}; select count(*)::int n from "${t.nom}"; RESET ROLE;`);
        return r[2].rows[0].n;
      };
      const T = lit(TENANT);
      const cas = {
        herite: [`select set_app_context(${T}, null, '', false)`, ref.total],
        all: [`select set_app_context(${T}, null, '', false, 'all')`, ref.total],
        sites_A: [`select set_app_context(${T}, ${lit(A)}, ${lit(A)}, false, 'sites')`, ref.sur_a + ref.sans_site],
        sites_AB: [`select set_app_context(${T}, null, ${lit(sites.join(","))}, false, 'sites')`, ref.total],
        none: [`select set_app_context(${T}, null, '', false, 'none')`, 0],
        inconnu: [`select set_app_context(${T}, null, '', false, 'nimporte')`, 0],
        autre_tenant: [`select set_app_context('tenant-inexistant', null, '', false, 'all')`, 0],
      };
      const ligne = { table: t.nom, total: ref.total, site_A: ref.sur_a, site_B: ref.sur_b, sans_site: ref.sans_site };
      for (const [nom, [ctx, attendu]] of Object.entries(cas)) {
        const vu = await voir(ctx);
        ligne[nom] = vu;
        if (vu !== attendu) ecarts.push(`${t.nom} [${nom}] : vu ${vu}, attendu ${attendu}`);
      }
      resultats.push(ligne);
    }

    const discriminantes = resultats.filter((r) => r.site_A > 0 && r.site_B > 0);
    console.log(`Tenant ${TENANT} — sites A=${A}, B=${B} — rôle soumis à la RLS : ${ROLE}`);
    console.table(discriminantes);
    console.log(`${resultats.length} tables vérifiées (${vides} autres sont vides pour ce tenant), dont ${discriminantes.length} portent des lignes sur les deux sites (les seules où le filtrage se voit).`);
    if (ignorees.length) console.log("Non vérifiables :", ignorees.join(" ; "));
    if (ecarts.length) { console.log(`ÉCARTS (${ecarts.length}) :\n  ` + ecarts.slice(0, 40).join("\n  ")); process.exitCode = 1; }
    else console.log("Aucun écart : chaque périmètre voit exactement ce qu'il doit voir.");
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
  }
})().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });
