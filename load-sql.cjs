const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

function natSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// Split SQL into individual statements, respecting string literals
function splitSql(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  let stringChar = null;
  
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];
    
    if (!inString) {
      if (c === "'") {
        inString = true;
        stringChar = "'";
      } else if (c === '"') {
        inString = true;
        stringChar = '"';
      }
      current += c;
      
      if (c === ';' && (next === '\n' || next === '\r' || next === undefined || next === ' ')) {
        const trimmed = current.trim();
        if (trimmed && !trimmed.startsWith('--')) {
          statements.push(trimmed);
        }
        current = '';
      }
    } else {
      current += c;
      if (c === stringChar) {
        if (next === stringChar) {
          // Escaped quote
          current += next;
          i++;
        } else {
          inString = false;
          stringChar = null;
        }
      }
    }
  }
  
  const last = current.trim();
  if (last && !last.startsWith('--')) statements.push(last);
  return statements;
}

async function main() {
  const sqlDir = 'prisma/sql';
  const files = fs.readdirSync(sqlDir)
    .filter(f => f.endsWith('.sql') && !f.includes('00-run-all'))
    .sort(natSort);

  console.log(`Found ${files.length} SQL files to load\n`);

  let totalStmts = 0;
  let totalErrors = 0;
  let totalOk = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(sqlDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    if (!content.trim()) {
      console.log(`[${i+1}/${files.length}] ${file} — EMPTY`);
      continue;
    }

    // Remove comment-only lines
    const lines = content.split('\n').filter(l => !l.trim().startsWith('--'));
    const cleanContent = lines.join('\n');
    
    const statements = splitSql(cleanContent);
    totalStmts += statements.length;
    
    let fileErrors = 0;
    let fileOk = 0;
    
    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt);
        fileOk++;
      } catch (e) {
        fileErrors++;
        totalErrors++;
        // Only log first error per file
        if (fileErrors === 1) {
          const msg = e.message.slice(0, 100);
          // Suppress common idempotent errors
          if (!msg.includes('duplicate key') && !msg.includes('does not exist') && !msg.includes('already exists')) {
            console.error(`  ERROR: ${msg}`);
          }
        }
      }
    }
    
    totalOk += fileOk;
    console.log(`[${i+1}/${files.length}] ${file} — ${fileOk} OK, ${fileErrors} errors`);
  }

  console.log(`\n✅ Done: ${totalOk} statements OK, ${totalErrors} errors out of ${totalStmts} total`);
  
  // Verify
  const abs2024 = await prisma.absence.count({ where: { tenantId: 'tenant-ambouli', date: { gte: new Date('2024-09-01'), lte: new Date('2025-07-31') } } });
  const abs2025 = await prisma.absence.count({ where: { tenantId: 'tenant-ambouli', date: { gte: new Date('2025-09-01'), lte: new Date('2026-07-31') } } });
  console.log(`\nVerification:`);
  console.log(`  Absences cohorte 2024: ${abs2024}`);
  console.log(`  Absences cohorte 2025: ${abs2025}`);
  
  const eval2024 = await prisma.evaluation.count({ where: { tenantId: 'tenant-ambouli', date: { gte: new Date('2024-09-01'), lte: new Date('2025-07-31') } } });
  const eval2025 = await prisma.evaluation.count({ where: { tenantId: 'tenant-ambouli', date: { gte: new Date('2025-09-01'), lte: new Date('2026-07-31') } } });
  console.log(`  Evaluations cohorte 2024: ${eval2024}`);
  console.log(`  Evaluations cohorte 2025: ${eval2025}`);
  
  const inc2024 = await prisma.incident.count({ where: { tenantId: 'tenant-ambouli', date: { gte: new Date('2024-09-01'), lte: new Date('2025-07-31') } } });
  const inc2025 = await prisma.incident.count({ where: { tenantId: 'tenant-ambouli', date: { gte: new Date('2025-09-01'), lte: new Date('2026-07-31') } } });
  console.log(`  Incidents cohorte 2024: ${inc2024}`);
  console.log(`  Incidents cohorte 2025: ${inc2025}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
