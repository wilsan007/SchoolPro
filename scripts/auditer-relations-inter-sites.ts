/**
 * Audit : quelles relations OBLIGATOIRES pointent vers une ligne qu'une session
 * bornée à un site ne voit pas ?
 *
 *   npx tsx --env-file=.env --env-file=.env.local scripts/auditer-relations-inter-sites.ts [--tenant=<id>]
 *
 * Lecture seule (transaction annulée). Sous filtrage par site effectif, charger
 * une relation obligatoire dont la cible est masquée fait échouer TOUTE la
 * requête Prisma (« required relation is null »). Ce script les trouve dans
 * les données réelles : pour chaque clé étrangère obligatoire vers une table
 * filtrée par site, il compte les lignes visibles dont le parent ne l'est pas.
 */
import { Prisma } from "@prisma/client";
import { Client } from "pg";

const TENANT = (process.argv.find((a) => a.startsWith("--tenant=")) ?? "--tenant=tenant-ambouli").split("=")[1];
const ROLE = "authenticated";

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("BEGIN");
  try {
    await c.query("SET LOCAL statement_timeout = '120s'");
    const filtrees = new Set(
      (await c.query(`select distinct tablename from pg_policies where schemaname='public' and permissive='RESTRICTIVE'`)).rows.map((r) => r.tablename)
    );
    const lisibles = new Set(
      (await c.query(`select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and has_table_privilege($1, oid, 'select')`, [ROLE])).rows.map((r) => r.relname)
    );
    const sites = (await c.query(`select id, nom from sites where "tenantId"=$1 order by id`, [TENANT])).rows;

    const modeles = Prisma.dmmf.datamodel.models;
    const table = new Map(modeles.map((m) => [m.name, m.dbName ?? m.name]));
    const relations: { enfant: string; modele: string; champ: string; fk: string; parent: string }[] = [];
    for (const m of modeles) {
      for (const f of m.fields) {
        if (f.kind !== "object" || f.isList || !f.isRequired) continue;
        const fk = f.relationFromFields?.[0];
        const parent = table.get(f.type);
        if (!fk || !parent || !filtrees.has(parent)) continue;
        relations.push({ enfant: table.get(m.name)!, modele: m.name, champ: f.name, fk, parent });
      }
    }

    const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
    const trouves: Record<string, unknown>[] = [];
    for (const r of relations) {
      if (!lisibles.has(r.enfant) || !lisibles.has(r.parent)) continue;
      const ligne: Record<string, unknown> = { relation: `${r.modele}.${r.champ}`, enfant: r.enfant, parent: r.parent };
      let total = 0;
      for (const s of sites) {
        const res = (await c.query(
          `SET LOCAL ROLE ${ROLE}; select set_app_context(${lit(TENANT)}, ${lit(s.id)}, ${lit(s.id)}, false, 'sites');
           select count(*)::int n from "${r.enfant}" e where not exists (select 1 from "${r.parent}" p where p.id = e."${r.fk}"); RESET ROLE;`
        )) as unknown as { rows: { n: number }[] }[];
        ligne[`masqués vus depuis ${s.nom}`] = res[2].rows[0].n;
        total += res[2].rows[0].n;
      }
      if (total > 0) trouves.push(ligne);
    }
    console.log(`${relations.length} relations obligatoires vers une table filtrée par site, examinées pour ${TENANT}.`);
    if (trouves.length === 0) console.log("Aucune ne pointe vers une ligne masquée.");
    else console.table(trouves);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
  }
})().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });
