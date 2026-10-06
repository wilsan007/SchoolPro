/**
 * Supprime les tâches automatiques en doublon.
 *
 * Jusqu'au correctif de `syncLot` (src/lib/tache-engine.ts), chaque
 * synchronisation recréait toutes les tâches sans classe (factures en retard,
 * bulletins, devoirs, incidents) : la table `taches` a accumulé des centaines
 * de copies d'une même tâche. Ce script garde la plus ancienne tâche ouverte
 * par (tenant, source, assigné) et supprime les autres, par lots.
 *
 * Usage :
 *   node --env-file=.env scripts/dedoublonner-taches-auto.cjs            # compte seulement
 *   node --env-file=.env scripts/dedoublonner-taches-auto.cjs --appliquer # supprime
 */
const { Client } = require("pg");

const APPLIQUER = process.argv.includes("--appliquer");
const LOT = 20000;

const DOUBLONS = `
  select id from (
    select id, row_number() over (
      partition by "tenantId", "sourceType", "sourceId", "assigneeAId"
      order by "createdAt", id
    ) rn
    from public.taches
    where "sourceType" is not null and statut in ('A_FAIRE', 'EN_COURS')
  ) x
  where rn > 1`;

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL.replace(/\?.*$/, ""),
    connectionTimeoutMillis: 45000,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    const total = async () => (await client.query(`select count(*)::int n from public.taches`)).rows[0].n;
    const aSupprimer = (await client.query(`select count(*)::int n from (${DOUBLONS}) d`)).rows[0].n;
    console.log(`taches : ${await total()} lignes, dont ${aSupprimer} doublons à supprimer`);

    if (!APPLIQUER) {
      console.log("Mode lecture seule. Relancer avec --appliquer pour supprimer.");
      return;
    }

    let supprimees = 0;
    for (;;) {
      const r = await client.query(
        `with d as (${DOUBLONS} limit ${LOT}) delete from public.taches t using d where t.id = d.id`,
      );
      if (r.rowCount === 0) break;
      supprimees += r.rowCount;
      console.log(`  lot supprimé : ${r.rowCount} (cumul ${supprimees})`);
    }
    await client.query(`analyze public.taches`);
    console.log(`terminé : ${supprimees} supprimées, ${await total()} lignes restantes`);
  } catch (e) {
    console.error("Échec :", e.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
})();
