/**
 * Rattrapage : rattache à leur site les comptes du personnel créés avec
 * `User.siteId` mais sans ligne `UserSite` (ni `EnseignantSite`). Ces comptes
 * se connectent avec un périmètre vide et ne voient rien.
 *
 *   node --env-file=.env --env-file=.env.local scripts/rattacher-personnel-sites.cjs [--apply]
 *
 * Aperçu par défaut. Avec --apply, une seule transaction : UserSite pour
 * chaque compte, et EnseignantSite pour les enseignants. N'écrit que si
 * `User.siteId` désigne un site du même établissement.
 */
const { Client } = require("pg");
const { randomUUID } = require("crypto");
const APPLY = process.argv.includes("--apply");

const CIBLES = `
  select u.id, u.email, u.role::text as role, u."tenantId", u."siteId", s.nom as site, e.id as "enseignantId"
    from users u
    join sites s on s.id = u."siteId" and s."tenantId" = u."tenantId"
    left join enseignants e on e."userId" = u.id and e."tenantId" = u."tenantId"
   where u."isActive"
     and u.role::text not in ('SUPER_ADMIN', 'TENANT_ADMIN', 'PARENT', 'STUDENT')
     and not exists (select 1 from user_sites us where us."userId" = u.id)
     and not exists (select 1 from enseignant_sites es where es."enseignantId" = e.id)
   order by u."tenantId", u.role`;

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const cibles = (await c.query(CIBLES)).rows;
    console.table(cibles.map(({ email, role, tenantId, site, enseignantId }) => ({ email, role, tenantId, site, enseignant: !!enseignantId })));
    if (cibles.length === 0) { console.log("Aucun compte à rattacher."); return; }
    if (!APPLY) { console.log(`Aperçu : ${cibles.length} compte(s) seraient rattachés. Relancer avec --apply.`); return; }
    await c.query("BEGIN");
    for (const u of cibles) {
      await c.query(`insert into user_sites (id, "userId", "siteId") values ($1, $2, $3)`, [randomUUID(), u.id, u.siteId]);
      if (u.enseignantId) {
        await c.query(`insert into enseignant_sites (id, "enseignantId", "siteId") values ($1, $2, $3) on conflict do nothing`, [randomUUID(), u.enseignantId, u.siteId]);
      }
    }
    await c.query("COMMIT");
    console.log(`${cibles.length} compte(s) rattaché(s).`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
})().catch((e) => { console.error("ÉCHEC, rien n'a été modifié :", e.message); process.exit(1); });
