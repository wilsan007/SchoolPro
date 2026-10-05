/**
 * Applique migration_numerotation_factures.sql (compteur de factures sous
 * verrou + index unique). Aperçu par défaut ; écrit avec --apply.
 *
 *   node --env-file=.env --env-file=.env.local scripts/appliquer-migration-numerotation-factures.cjs [--apply]
 *
 * Pilote `pg` et non Prisma : le pooler coupe les écritures massives passées
 * par Prisma. Tout s'exécute dans UNE transaction — en cas d'erreur (doublon
 * résiduel refusé par l'index, par exemple), rien n'est appliqué.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
const DOUBLONS = `select "tenantId", count(*)::int factures, (count(*) - count(distinct numero))::int en_double from factures group by 1 order by 1`;

(async () => {
  const url = process.env.DIRECT_URL_MIGRATION ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL requis");
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    console.log("Avant :"); console.table((await c.query(DOUBLONS)).rows);
    if (!APPLY) {
      const r = await c.query(`select count(*)::int n from factures where id like 'fact-2026-%' and numero ~ '^F-\\d{4}-\\d{4}$'`);
      console.log(`Aperçu : ${r.rows[0].n} factures de démonstration seraient renumérotées. Relancer avec --apply.`);
      return;
    }
    const sql = fs.readFileSync(path.join(__dirname, "..", "migration_numerotation_factures.sql"), "utf8");
    await c.query("BEGIN");
    await c.query("SET LOCAL statement_timeout = '120s'");
    await c.query(sql);
    await c.query("COMMIT");
    console.log("Après :"); console.table((await c.query(DOUBLONS)).rows);
    console.table((await c.query(`select indexname, indexdef from pg_indexes where indexname = 'factures_tenantId_numero_key'`)).rows);
    console.table((await c.query(`select to_regprocedure('next_facture_numeros(text,text,integer)') is not null fonction,
      has_table_privilege('anon','facture_sequences','select') table_anon,
      has_function_privilege('anon','next_facture_numeros(text,text,integer)','execute') fonction_anon,
      has_function_privilege('authenticated','next_facture_numeros(text,text,integer)','execute') fonction_authenticated`)).rows);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
})().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });
