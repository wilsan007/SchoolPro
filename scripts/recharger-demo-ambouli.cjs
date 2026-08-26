/**
 * Rechargement complet du jeu de démonstration « Cité Scolaire Ambouli ».
 *
 *   node scripts/recharger-demo-ambouli.cjs
 *
 * DESTRUCTIF, mais borné : seul le tenant `tenant-ambouli` est effacé puis
 * réinséré. Les autres établissements de la base ne sont pas touchés.
 *
 * POURQUOI UNE PURGE AVANT LE CHARGEMENT
 * Les fichiers du seed portent chacun leur propre bloc de nettoyage, mais dans
 * l'ordre de chargement : le fichier 02 supprime les périodes avant que le
 * fichier 06 n'ait supprimé les évaluations qui les référencent. Le seed sait
 * donc remplir une base vide, pas en remplacer une pleine. On vide d'abord.
 *
 * POURQUOI PAS `cleanup-tenant.cjs`
 * Ce script-là, quand une table n'a pas de colonne `tenantId` (paiements,
 * échéanciers, sanctions, table de liaison des prérequis…), retombe sur un
 * `DELETE` SANS filtre : il effacerait les données des autres établissements.
 * Ici, on supprime la ligne `tenants` et on laisse la base propager la cascade
 * déclarée au schéma — rien ne peut déborder du tenant visé.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const TENANT = 'tenant-ambouli';
const DOSSIER = path.join(RACINE, 'prisma/sql/_to-load');

function urlBase() {
  const env = fs.readFileSync(path.join(RACINE, '.env'), 'utf8');
  const m = env.match(/^DATABASE_URL="([^"]+)"/m);
  if (!m) throw new Error('DATABASE_URL introuvable dans .env');
  return m[1];
}

/**
 * Recopie les fichiers 01→14 dans `_to-load` en les préfixant d'un numéro
 * d'ordre : un tri alphabétique sur les noms d'origine placerait `04-users`
 * avant `04-calendrier`, et surtout mélangerait les parties au-delà de 99.
 */
function preparerDossier() {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });

  const source = path.join(RACINE, 'prisma/sql');
  const fichiers = fs.readdirSync(source)
    .filter((f) => /^(0[1-9]|1[0-4])-.*\.sql$/.test(f))
    .sort();

  fs.copyFileSync(
    path.join(source, 'MANUAL-01-create-remises-caisse.sql'),
    path.join(DOSSIER, '000-MANUAL-01.sql')
  );
  fichiers.forEach((f, i) => {
    fs.copyFileSync(path.join(source, f), path.join(DOSSIER, `${String(i + 1).padStart(3, '0')}-${f}`));
  });
  return fichiers.length + 1;
}

async function main() {
  const client = new Client({
    connectionString: urlBase(),
    connectionTimeoutMillis: 20000,
    statement_timeout: 900000,
  });
  await client.connect();

  const avant = await client.query(`SELECT
    (SELECT COUNT(*) FROM eleves WHERE "tenantId"=$1)::int eleves,
    (SELECT COUNT(*) FROM notes  WHERE "tenantId"=$1)::int notes`, [TENANT]);
  console.log('Avant purge :', JSON.stringify(avant.rows[0]));

  // Quinze clés étrangères sont en RESTRICT et bloquent la cascade : une note
  // retient sa classe, sa matière et son évaluation ; un message retient son
  // expéditeur. On retire ces enfants d'abord, dans l'ordre de la chaîne, et
  // toujours bornés au tenant — jamais un DELETE sans filtre.
  const PREALABLES = [
    ['notes', `"tenantId"='${TENANT}'`],
    ['bulletin_matieres', `"tenantId"='${TENANT}'`],
    ['bulletins', `"tenantId"='${TENANT}'`],
    ['evaluations', `"tenantId"='${TENANT}'`],
    ['remplacements_cours', `"tenantId"='${TENANT}'`],
    ['emplois_temps', `"tenantId"='${TENANT}'`],
    ['devoirs', `"tenantId"='${TENANT}'`],
    // Ces deux-là n'ont pas de colonne tenantId : on passe par le parent.
    ['learnos_exercices_assignes',
      `"feuilleId" IN (SELECT id FROM learnos_feuilles_exercices WHERE "tenantId"='${TENANT}')`],
    ['messages',
      `"conversationId" IN (SELECT id FROM conversations WHERE "tenantId"='${TENANT}')`],
    ['conversations', `"tenantId"='${TENANT}'`],
  ];
  for (const [table, filtre] of PREALABLES) {
    const r = await client.query(`DELETE FROM "${table}" WHERE ${filtre}`);
    if (r.rowCount) console.log(`  ${table} : ${r.rowCount}`);
  }

  // Le reste part par le `ON DELETE CASCADE` déclaré au schéma.
  const purge = await client.query('DELETE FROM tenants WHERE id=$1', [TENANT]);
  console.log(`Purge : ${purge.rowCount} tenant supprimé (cascade)\n`);

  const total = preparerDossier();
  console.log(`Chargement de ${total} fichiers…\n`);

  const fichiers = fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.sql')).sort();
  const debut = Date.now();
  let ok = 0;
  const echecs = [];

  for (let i = 0; i < fichiers.length; i++) {
    const contenu = fs.readFileSync(path.join(DOSSIER, fichiers[i]), 'utf8');
    try {
      await client.query(contenu);
      ok++;
      if (i % 20 === 0 || i === fichiers.length - 1) {
        console.log(`[${i + 1}/${fichiers.length}] ${fichiers[i]} — ${Math.round((Date.now() - debut) / 1000)}s`);
      }
    } catch (e) {
      // MANUAL-01 est une DDL : rejouée sur une base déjà migrée, elle échoue
      // parce que la contrainte existe. Ce n'est pas une erreur de données.
      if (/already exists/.test(e.message)) {
        console.log(`[${i + 1}/${fichiers.length}] ${fichiers[i]} — déjà appliqué, ignoré`);
        ok++;
        continue;
      }
      echecs.push(`${fichiers[i]} : ${String(e.message).slice(0, 160)}`);
      console.log(`[${i + 1}/${fichiers.length}] ${fichiers[i]} — ÉCHEC`);
    }
  }

  console.log(`\n${ok}/${fichiers.length} fichiers chargés en ${Math.round((Date.now() - debut) / 1000)}s`);
  if (echecs.length) {
    console.log(`\n${echecs.length} échec(s) :`);
    for (const e of echecs.slice(0, 20)) console.log('  ' + e);
  }

  const apres = await client.query(`SELECT
    (SELECT COUNT(*) FROM eleves    WHERE "tenantId"=$1)::int eleves,
    (SELECT COUNT(*) FROM notes     WHERE "tenantId"=$1)::int notes,
    (SELECT COUNT(*) FROM bulletins WHERE "tenantId"=$1)::int bulletins,
    (SELECT COUNT(*) FROM factures  WHERE "tenantId"=$1)::int factures`, [TENANT]);
  console.log('\nAprès chargement :', JSON.stringify(apres.rows[0]));

  await client.end();
  process.exitCode = echecs.length ? 1 : 0;
}

main().catch((e) => {
  console.error('ERREUR', e.message);
  process.exit(1);
});
