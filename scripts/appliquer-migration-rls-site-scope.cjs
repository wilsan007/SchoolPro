/**
 * Applique migration_rls_site_scope.sql (filtrage par site effectif en base).
 * Aperçu par défaut ; écrit avec --apply, dans UNE transaction.
 *
 *   node --env-file=.env --env-file=.env.local scripts/appliquer-migration-rls-site-scope.cjs [--apply]
 *
 * Avant d'écrire, l'état actuel (politiques et fonctions touchées) est
 * sauvegardé dans migration_rls_site_scope.rollback.sql : l'exécuter rétablit
 * exactement la situation d'avant.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
const RACINE = path.join(__dirname, "..");
const ETAT = `
  select permissive, count(*)::int politiques, count(distinct tablename)::int tables,
         count(*) filter (where qual ilike '%site_matches%' or qual ilike '%site_scope_unrestricted%')::int de_site
    from pg_policies where schemaname = 'public' group by 1 order by 1`;

async function sauvegarde(c) {
  const fonctions = await c.query(`select pg_get_functiondef(p.oid) def from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname in ('site_matches', 'set_app_context')
       and pg_get_function_identity_arguments(p.oid) not like '%p_site_scope%'`);
  const politiques = await c.query(`select tablename, policyname, permissive, cmd, roles, qual, with_check
     from pg_policies where schemaname = 'public' order by tablename, policyname`);
  const lignes = [
    "-- Retour arrière de migration_rls_site_scope.sql — état relevé le " + new Date().toISOString(),
    "BEGIN;",
    "-- Politiques : on retire tout, puis on recrée l'état d'origine.",
    `DO $$ DECLARE p RECORD; BEGIN FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename); END LOOP; END $$;`,
    ...politiques.rows.map((p) =>
      `CREATE POLICY "${p.policyname}" ON public."${p.tablename}" AS ${p.permissive} FOR ${p.cmd} TO ${String(p.roles).replace(/[{}]/g, "")}` +
      (p.qual ? ` USING (${p.qual})` : "") + (p.with_check ? ` WITH CHECK (${p.with_check})` : "") + ";"),
    ...fonctions.rows.map((f) => f.def.trim() + ";"),
    "DROP FUNCTION IF EXISTS public.set_app_context(TEXT, TEXT, TEXT, BOOLEAN, TEXT);",
    "DROP FUNCTION IF EXISTS public.site_scope_unrestricted();",
    "DROP FUNCTION IF EXISTS public.current_site_scope();",
    "COMMIT;",
  ];
  const fichier = path.join(RACINE, "migration_rls_site_scope.rollback.sql");
  fs.writeFileSync(fichier, lignes.join("\n") + "\n");
  return { fichier, politiques: politiques.rows.length };
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    console.log("Avant :"); console.table((await c.query(ETAT)).rows);
    if (!APPLY) { console.log("Aperçu seulement. Relancer avec --apply."); return; }
    if (fs.existsSync(path.join(RACINE, "migration_rls_site_scope.rollback.sql"))) {
      console.log("Sauvegarde déjà présente : conservée (elle décrit l'état d'origine).");
    } else {
      const s = await sauvegarde(c);
      console.log(`Sauvegarde : ${path.basename(s.fichier)} (${s.politiques} politiques)`);
    }
    const sql = fs.readFileSync(path.join(RACINE, "migration_rls_site_scope.sql"), "utf8");
    await c.query("BEGIN");
    await c.query("SET LOCAL statement_timeout = '120s'");
    await c.query(sql);
    await c.query("COMMIT");
    console.log("Après :"); console.table((await c.query(ETAT)).rows);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
})().catch((e) => { console.error("ÉCHEC, rien n'a été appliqué :", e.message); process.exit(1); });
