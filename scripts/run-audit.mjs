#!/usr/bin/env node
/**
 * Script d'orchestration des outils de contrôle qualité SchoolPro.
 * Lance tous les outils et capture les résultats dans audit-reports/.
 *
 * Usage:
 *   node scripts/run-audit.mjs              # Tout lancer
 *   node scripts/run-audit.mjs --quick       # Version rapide (lint + tsc + knip + type-coverage)
 *   node scripts/run-audit.mjs --security   # Sécurité seulement (semgrep + gitleaks + trivy)
 *   node scripts/run-audit.mjs --sql        # SQL seulement (squawk + sqlfluff)
 *   node scripts/run-audit.mjs --deps       # Dépendances seulement (knip + madge + dependency-cruiser)
 */

import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const REPORTS_DIR = join(ROOT, 'audit-reports');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

mkdirSync(REPORTS_DIR, { recursive: true });

const args = process.argv.slice(2);
const isQuick = args.includes('--quick');
const isSecurity = args.includes('--security');
const isSql = args.includes('--sql');
const isDeps = args.includes('--deps');
const isAll = !isQuick && !isSecurity && !isSql && !isDeps;

const results = [];

function runTool(name, command, options = {}) {
  const { timeout = 120000, cwd = ROOT, skipIfMissing = false } = options;
  const startTime = Date.now();
  const reportFile = join(REPORTS_DIR, `${TIMESTAMP}-${name}.txt`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`▶ ${name}`);
  console.log(`${'='.repeat(60)}`);

  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout,
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      maxBuffer: 10 * 1024 * 1024,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✓ ${name} — ${duration}s`);
    writeFileSync(reportFile, output);
    results.push({ name, status: 'pass', duration, report: reportFile });
    return output;
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const output = error.stdout || error.stderr || error.message || '';
    console.log(`✗ ${name} — ${duration}s (exit ${error.status || 'N/A'})`);
    writeFileSync(reportFile, output);
    results.push({ name, status: error.status === 1 && skipIfMissing ? 'skip' : 'fail', duration, report: reportFile, exitCode: error.status });
    return output;
  }
}

// === TOOLS ===

const tools = {
  // Quick (toujours)
  'lint': () => runTool('lint', 'pnpm lint', { timeout: 60000 }),
  'tsc': () => runTool('tsc', 'pnpm tsc --noEmit', { timeout: 120000 }),
  'knip': () => runTool('knip', 'npx knip --no-progress', { timeout: 60000 }),
  'type-coverage': () => runTool('type-coverage', 'npx type-coverage --strict --at-least 80 --detail', { timeout: 60000 }),

  // Security
  'semgrep': () => runTool('semgrep', 'semgrep --config .semgrep.yml --json --output audit-reports/semgrep.json .', { timeout: 120000 }),
  'gitleaks': () => runTool('gitleaks', 'gitleaks detect --source . --config .gitleaks.toml --no-banner --verbose', { timeout: 60000 }),
  'trivy-fs': () => runTool('trivy-fs', 'trivy fs --severity HIGH,CRITICAL --no-progress .', { timeout: 120000, skipIfMissing: true }),
  'trivy-config': () => runTool('trivy-config', 'trivy config --severity HIGH,CRITICAL .', { timeout: 60000, skipIfMissing: true }),

  // SQL
  'squawk': () => runTool('squawk', 'npx squawk prisma/migrations/', { timeout: 30000 }),
  'sqlfluff': () => runTool('sqlfluff', 'sqlfluff lint --config .sqlfluff prisma/migrations/ supabase/', { timeout: 30000 }),
  'plpgsql-check': () => runTool('plpgsql-check', 'node scripts/audit-plpgsql.mjs', { timeout: 120000, skipIfMissing: true }),

  // Dependencies
  'madge-circular': () => runTool('madge-circular', 'npx madge --circular --extensions ts,tsx src/', { timeout: 60000 }),
  'dependency-cruiser': () => runTool('dependency-cruiser', 'npx dependency-cruiser src --config .dependency-cruiser.cjs', { timeout: 60000 }),
  'npm-audit': () => runTool('npm-audit', 'pnpm audit --prod', { timeout: 30000 }),

  // Supabase
  'supabase-lint': () => runTool('supabase-lint', 'supabase db lint', { timeout: 30000, skipIfMissing: true }),

  // Lighthouse (nécessite serveur running)
  'lighthouse': () => runTool('lighthouse', 'npx lhci autorun --config=./lighthouserc.js', { timeout: 120000, skipIfMissing: true }),
};

// === RUN ===

const quickTools = ['lint', 'tsc', 'knip', 'type-coverage'];
const securityTools = ['semgrep', 'gitleaks', 'trivy-fs', 'trivy-config'];
const sqlTools = ['squawk', 'sqlfluff', 'plpgsql-check'];
const depsTools = ['madge-circular', 'dependency-cruiser', 'npm-audit'];
const allTools = [...quickTools, ...securityTools, ...sqlTools, ...depsTools, 'supabase-lint'];

let toolsToRun = allTools;
if (isQuick) toolsToRun = quickTools;
if (isSecurity) toolsToRun = securityTools;
if (isSql) toolsToRun = sqlTools;
if (isDeps) toolsToRun = depsTools;

console.log(`\n🛡️  SchoolPro Audit Runner — ${new Date().toISOString()}`);
console.log(`Mode: ${isQuick ? 'quick' : isSecurity ? 'security' : isSql ? 'sql' : isDeps ? 'deps' : 'all'}`);
console.log(`Outils: ${toolsToRun.join(', ')}`);

for (const tool of toolsToRun) {
  if (tools[tool]) {
    tools[tool]();
  }
}

// === SUMMARY ===

console.log(`\n${'='.repeat(60)}`);
console.log('📋 RÉSUMÉ AUDIT');
console.log(`${'='.repeat(60)}`);

const passed = results.filter(r => r.status === 'pass');
const failed = results.filter(r => r.status === 'fail');
const skipped = results.filter(r => r.status === 'skip');

for (const r of results) {
  const icon = r.status === 'pass' ? '✓' : r.status === 'skip' ? '⊘' : '✗';
  console.log(`  ${icon} ${r.name.padEnd(25)} ${r.duration}s`);
}

console.log(`\nTotal: ${results.length} | Pass: ${passed.length} | Fail: ${failed.length} | Skip: ${skipped.length}`);
console.log(`Rapports: ${REPORTS_DIR}/`);

if (failed.length > 0) {
  console.log('\n❌ Outils en échec:');
  for (const f of failed) {
    console.log(`   ${f.name} — voir ${f.report}`);
  }
}

// Write summary JSON
const summary = {
  timestamp: new Date().toISOString(),
  mode: isQuick ? 'quick' : isSecurity ? 'security' : isSql ? 'sql' : isDeps ? 'deps' : 'all',
  total: results.length,
  passed: passed.length,
  failed: failed.length,
  skipped: skipped.length,
  tools: results.map(r => ({ name: r.name, status: r.status, duration: parseFloat(r.duration) })),
};
writeFileSync(join(REPORTS_DIR, `${TIMESTAMP}-summary.json`), JSON.stringify(summary, null, 2));

process.exit(failed.length > 0 ? 1 : 0);
