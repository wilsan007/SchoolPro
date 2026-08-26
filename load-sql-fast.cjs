const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

function splitSql(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  let stringChar = null;
  
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];
    
    if (!inString) {
      if (c === "'") { inString = true; stringChar = "'"; }
      else if (c === '"') { inString = true; stringChar = '"'; }
      current += c;
      if (c === ';' && (next === '\n' || next === '\r' || next === undefined || next === ' ')) {
        const t = current.trim();
        if (t && !t.startsWith('--')) statements.push(t);
        current = '';
      }
    } else {
      current += c;
      if (c === stringChar) {
        if (next === stringChar) { current += next; i++; }
        else { inString = false; stringChar = null; }
      }
    }
  }
  const last = current.trim();
  if (last && !last.startsWith('--')) statements.push(last);
  return statements;
}

async function main() {
  const dir = 'prisma/sql/_to-load';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  
  console.log(`Loading ${files.length} chunks (batch mode)...\n`);
  
  let totalOk = 0, totalErr = 0;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    const stmts = splitSql(content);
    
    let fileOk = 0, fileErr = 0;
    // Execute in batches of 50 statements using $transaction
    const BATCH = 50;
    for (let j = 0; j < stmts.length; j += BATCH) {
      const batch = stmts.slice(j, j + BATCH);
      try {
        await prisma.$transaction(batch.map(s => prisma.$executeRawUnsafe(s)));
        fileOk += batch.length;
      } catch (e) {
        // If batch fails, try individually
        for (const s of batch) {
          try {
            await prisma.$executeRawUnsafe(s);
            fileOk++;
          } catch (e2) {
            fileErr++;
          }
        }
      }
    }
    
    totalOk += fileOk;
    totalErr += fileErr;
    console.log(`[${i+1}/${files.length}] ${file} — ${fileOk} OK, ${fileErr} err`);
  }
  
  console.log(`\nTotal: ${totalOk} OK, ${totalErr} errors`);
  
  // Verify
  console.log('\n── Verification ──');
  const abs2024 = await prisma.absence.count({ where: { tenantId: 'tenant-ambouli', date: { gte: new Date('2024-09-01'), lte: new Date('2025-07-31') } } });
  const abs2025 = await prisma.absence.count({ where: { tenantId: 'tenant-ambouli', date: { gte: new Date('2025-09-01'), lte: new Date('2026-07-31') } } });
  console.log(`Absences 2024: ${abs2024}, Absences 2025: ${abs2025}`);
  
  const eval2024 = await prisma.evaluation.count({ where: { tenantId: 'tenant-ambouli', date: { gte: new Date('2024-09-01'), lte: new Date('2025-07-31') } } });
  const eval2025 = await prisma.evaluation.count({ where: { tenantId: 'tenant-ambouli', date: { gte: new Date('2025-09-01'), lte: new Date('2026-07-31') } } });
  console.log(`Evaluations 2024: ${eval2024}, Evaluations 2025: ${eval2025}`);
  
  const inc2024 = await prisma.incident.count({ where: { tenantId: 'tenant-ambouli', date: { gte: new Date('2024-09-01'), lte: new Date('2025-07-31') } } });
  const inc2025 = await prisma.incident.count({ where: { tenantId: 'tenant-ambouli', date: { gte: new Date('2025-09-01'), lte: new Date('2026-07-31') } } });
  console.log(`Incidents 2024: ${inc2024}, Incidents 2025: ${inc2025}`);
  
  const notes2024 = await prisma.note.count({ where: { tenantId: 'tenant-ambouli', date: { gte: new Date('2024-09-01'), lte: new Date('2025-07-31') } } });
  const notes2025 = await prisma.note.count({ where: { tenantId: 'tenant-ambouli', date: { gte: new Date('2025-09-01'), lte: new Date('2026-07-31') } } });
  console.log(`Notes 2024: ${notes2024}, Notes 2025: ${notes2025}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
