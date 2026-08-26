const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
// ⚠️  Aucun identifiant en dur : la chaîne de connexion vient de
//     l'environnement. Exemple d'exécution :
//       DATABASE_URL="postgresql://user:pass@host:5432/db" node reload-failed.cjs
const CONNECTION_STRING = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!CONNECTION_STRING) {
  console.error('ERREUR : définir DIRECT_URL (ou DATABASE_URL) avant de lancer ce script.');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: CONNECTION_STRING, connectionTimeoutMillis: 15000 });
  await client.connect();
  console.log('Connected — reloading failed chunks...\n');

  // Tous les chunks qui ont échoué au dernier run
  const failed = [
    85, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156,
    160, 161, 162, 163, 164, 165, 167, 168, 172, 173, 177, 183, 184,
    207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 219, 221, 222
  ];

  let ok = 0, err = 0;
  for (const num of failed) {
    const file = `chunk-${String(num).padStart(3, '0')}.sql`;
    const content = fs.readFileSync(path.join('prisma/sql/_to-load', file), 'utf8');
    try {
      await client.query(content);
      ok++;
      console.log(`[${file}] OK`);
    } catch (e) {
      err++;
      console.error(`[${file}] ERROR: ${e.message.slice(0, 120)}`);
    }
  }

  console.log(`\n${ok} OK, ${err} errors`);

  // Verification
  console.log('\n── Verification ──');
  const abs2024 = await client.query("SELECT count(*) FROM absences WHERE \"tenantId\"='tenant-ambouli' AND date >= '2024-09-01' AND date <= '2025-07-31'");
  const abs2025 = await client.query("SELECT count(*) FROM absences WHERE \"tenantId\"='tenant-ambouli' AND date >= '2025-09-01' AND date <= '2026-07-31'");
  console.log(`Absences 2024: ${abs2024.rows[0].count}, 2025: ${abs2025.rows[0].count}`);

  const ev2024 = await client.query("SELECT count(*) FROM learnos_learning_evidences WHERE \"tenantId\"='tenant-ambouli' AND \"occurredAt\" >= '2024-09-01' AND \"occurredAt\" <= '2025-07-31'");
  const ev2025 = await client.query("SELECT count(*) FROM learnos_learning_evidences WHERE \"tenantId\"='tenant-ambouli' AND \"occurredAt\" >= '2025-09-01' AND \"occurredAt\" <= '2026-07-31'");
  console.log(`Evidences 2024: ${ev2024.rows[0].count}, 2025: ${ev2025.rows[0].count}`);

  const sp2024 = await client.query("SELECT count(*) FROM learnos_student_learning_profiles WHERE \"tenantId\"='tenant-ambouli' AND \"computedAt\" >= '2024-09-01' AND \"computedAt\" <= '2025-07-31'");
  const sp2025 = await client.query("SELECT count(*) FROM learnos_student_learning_profiles WHERE \"tenantId\"='tenant-ambouli' AND \"computedAt\" >= '2025-09-01' AND \"computedAt\" <= '2026-07-31'");
  console.log(`Profiles 2024: ${sp2024.rows[0].count}, 2025: ${sp2025.rows[0].count}`);

  const inc2024 = await client.query("SELECT count(*) FROM incidents WHERE \"tenantId\"='tenant-ambouli' AND date >= '2024-09-01' AND date <= '2025-07-31'");
  const inc2025 = await client.query("SELECT count(*) FROM incidents WHERE \"tenantId\"='tenant-ambouli' AND date >= '2025-09-01' AND date <= '2026-07-31'");
  console.log(`Incidents 2024: ${inc2024.rows[0].count}, 2025: ${inc2025.rows[0].count}`);

  const dev2024 = await client.query("SELECT count(*) FROM devoirs WHERE \"tenantId\"='tenant-ambouli' AND \"dateDonne\" >= '2024-09-01' AND \"dateDonne\" <= '2025-07-31'");
  const dev2025 = await client.query("SELECT count(*) FROM devoirs WHERE \"tenantId\"='tenant-ambouli' AND \"dateDonne\" >= '2025-09-01' AND \"dateDonne\" <= '2026-07-31'");
  console.log(`Devoirs 2024: ${dev2024.rows[0].count}, 2025: ${dev2025.rows[0].count}`);

  const isCurrent = await client.query("SELECT id, libelle, \"isCurrent\" FROM annees_scolaires WHERE \"tenantId\"='tenant-ambouli' AND \"isCurrent\"=true");
  console.log(`isCurrent=true:`, isCurrent.rows.map(r => r.libelle));

  await client.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
