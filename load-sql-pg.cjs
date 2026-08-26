const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// ⚠️  Aucun identifiant en dur : la chaîne de connexion vient de
//     l'environnement. Exemple d'exécution :
//       DATABASE_URL="postgresql://user:pass@host:5432/db" node load-sql-pg.cjs
const CONNECTION_STRING = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!CONNECTION_STRING) {
  console.error('ERREUR : définir DIRECT_URL (ou DATABASE_URL) avant de lancer ce script.');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: CONNECTION_STRING, connectionTimeoutMillis: 15000 });
  
  console.log('Connecting to Supabase (direct connection)...');
  await client.connect();
  console.log('Connected!\n');
  
  const dir = 'prisma/sql/_to-load';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  
  console.log(`Loading ${files.length} chunks...\n`);
  
  let totalOk = 0, totalErr = 0;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    
    try {
      await client.query(content);
      totalOk++;
      console.log(`[${i+1}/${files.length}] ${file} — OK`);
    } catch (e) {
      totalErr++;
      const msg = e.message.slice(0, 120);
      if (msg.includes('duplicate key') || msg.includes('does not exist') || msg.includes('already exists')) {
        console.log(`[${i+1}/${files.length}] ${file} — SKIP (${msg.slice(0, 60)})`);
      } else {
        console.error(`[${i+1}/${files.length}] ${file} — ERROR: ${msg}`);
      }
    }
  }
  
  console.log(`\n✅ Done: ${totalOk} OK, ${totalErr} errors`);
  
  // Verify
  console.log('\n── Verification ──');
  const abs2024 = await client.query("SELECT count(*) FROM absences WHERE \"tenantId\"='tenant-ambouli' AND date >= '2024-09-01' AND date <= '2025-07-31'");
  const abs2025 = await client.query("SELECT count(*) FROM absences WHERE \"tenantId\"='tenant-ambouli' AND date >= '2025-09-01' AND date <= '2026-07-31'");
  console.log(`Absences 2024: ${abs2024.rows[0].count}, Absences 2025: ${abs2025.rows[0].count}`);
  
  const eval2024 = await client.query("SELECT count(*) FROM evaluations WHERE \"tenantId\"='tenant-ambouli' AND date >= '2024-09-01' AND date <= '2025-07-31'");
  const eval2025 = await client.query("SELECT count(*) FROM evaluations WHERE \"tenantId\"='tenant-ambouli' AND date >= '2025-09-01' AND date <= '2026-07-31'");
  console.log(`Evaluations 2024: ${eval2024.rows[0].count}, Evaluations 2025: ${eval2025.rows[0].count}`);
  
  const inc2024 = await client.query("SELECT count(*) FROM incidents WHERE \"tenantId\"='tenant-ambouli' AND date >= '2024-09-01' AND date <= '2025-07-31'");
  const inc2025 = await client.query("SELECT count(*) FROM incidents WHERE \"tenantId\"='tenant-ambouli' AND date >= '2025-09-01' AND date <= '2026-07-31'");
  console.log(`Incidents 2024: ${inc2024.rows[0].count}, Incidents 2025: ${inc2025.rows[0].count}`);
  
  const notes2024 = await client.query("SELECT count(*) FROM notes WHERE \"tenantId\"='tenant-ambouli' AND date >= '2024-09-01' AND date <= '2025-07-31'");
  const notes2025 = await client.query("SELECT count(*) FROM notes WHERE \"tenantId\"='tenant-ambouli' AND date >= '2025-09-01' AND date <= '2026-07-31'");
  console.log(`Notes 2024: ${notes2024.rows[0].count}, Notes 2025: ${notes2025.rows[0].count}`);
  
  const dev2024 = await client.query("SELECT count(*) FROM devoirs WHERE \"tenantId\"='tenant-ambouli' AND \"dateDonne\" >= '2024-09-01' AND \"dateDonne\" <= '2025-07-31'");
  const dev2025 = await client.query("SELECT count(*) FROM devoirs WHERE \"tenantId\"='tenant-ambouli' AND \"dateDonne\" >= '2025-09-01' AND \"dateDonne\" <= '2026-07-31'");
  console.log(`Devoirs 2024: ${dev2024.rows[0].count}, Devoirs 2025: ${dev2025.rows[0].count}`);
  
  await client.end();
  console.log('\n✅ Connection closed');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
