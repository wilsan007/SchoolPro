#!/usr/bin/env node
/**
 * Audit PL/pgSQL — utilise plpgsql_check pour analyser statiquement
 * toutes les fonctions PL/pgSQL de la base Supabase.
 *
 * Détecte : variables non utilisées, paramètres shadowés, SQL injection,
 * types incompatibles, fonctions sans RETURN, etc.
 *
 * Usage:
 *   node scripts/audit-plpgsql.mjs                    # Audit complet
 *   node scripts/audit-plpgsql.mjs --json              # Sortie JSON
 *   node scripts/audit-plpgsql.mjs --function set_tenant_context  # Fonction spécifique
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const REPORTS_DIR = join(ROOT, 'audit-reports');
mkdirSync(REPORTS_DIR, { recursive: true });

const args = process.argv.slice(2);
const isJson = args.includes('--json');
const funcArg = args.find(a => a.startsWith('--function='));
const specificFunction = funcArg ? funcArg.split('=')[1] : null;

// Charger l'URL de connexion depuis .env
function getDbUrl() {
  try {
    const envContent = execSync('cat .env', { encoding: 'utf-8' });
    const match = envContent.match(/DIRECT_URL="([^"]+)"/);
    if (match) {
      // Nettoyer les paramètres d'URL que psql n'aime pas
      return match[1].replace(/\?connection_limit=\d+&pool_timeout=\d+/, '').replace(/\?pool_timeout=\d+/, '');
    }
  } catch (e) {
    // .env might not exist, try .env.local
  }
  try {
    const envContent = execSync('cat .env.local', { encoding: 'utf-8' });
    const match = envContent.match(/DIRECT_URL="([^"]+)"/);
    if (match) {
      return match[1].replace(/\?connection_limit=\d+&pool_timeout=\d+/, '').replace(/\?pool_timeout=\d+/, '');
    }
  } catch (e) {
    // ignore
  }
  console.error('❌ DIRECT_URL non trouvé dans .env ou .env.local');
  process.exit(1);
}

const DB_URL = getDbUrl();
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

console.log('🔍 Audit PL/pgSQL — plpgsql_check');
console.log(`   Base: ${DB_URL.replace(/:[^:@]+@/, ':<redacted>@')}`);
console.log('');

// Étape 1 : Lister toutes les fonctions PL/pgSQL
const listSql = `
SELECT
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.oid::text AS oid
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_language l ON p.prolang = l.oid
WHERE l.lanname = 'plpgsql'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, p.proname;
`;

let functions = [];
try {
  const output = execSync(
    `docker exec schoolpro-pg-tools psql "${DB_URL}" -t -A -F '|' -c "${listSql.replace(/\n/g, ' ')}"`,
    { encoding: 'utf-8', timeout: 30000, maxBuffer: 5 * 1024 * 1024 }
  );
  functions = output.trim().split('\n').filter(l => l.trim()).map(line => {
    const [schema, name, args, oid] = line.split('|');
    return { schema, name, args, oid, fullName: `${schema}.${name}(${args})` };
  });
} catch (e) {
  console.error('❌ Erreur lors de la liste des fonctions:', e.message);
  process.exit(1);
}

console.log(`📋 ${functions.length} fonctions PL/pgSQL trouvées`);

if (specificFunction) {
  functions = functions.filter(f => f.name === specificFunction || f.fullName.includes(specificFunction));
  console.log(`   Filtré sur: ${specificFunction} (${functions.length} fonctions)`);
}

if (functions.length === 0) {
  console.log('⚠️  Aucune fonction PL/pgSQL à analyser');
  process.exit(0);
}

// Étape 2 : Vérifier que plpgsql_check est installé
try {
  execSync(
    `docker exec schoolpro-pg-tools psql "${DB_URL}" -c "CREATE EXTENSION IF NOT EXISTS plpgsql_check;"`,
    { encoding: 'utf-8', timeout: 15000 }
  );
  console.log('✓ plpgsql_check installé');
} catch (e) {
  console.error('❌ Impossible d\'installer plpgsql_check:', e.message);
  process.exit(1);
}

// Étape 3 : Analyser chaque fonction
console.log('');
console.log('Analyse en cours...');

const results = [];
let errors = 0;
let warnings = 0;
let ok = 0;

for (const func of functions) {
  // Utiliser l'OID directement — plpgsql_check_function accepte un OID
  // ce qui évite les erreurs de parsing des types dans la signature
  const checkSql = `SELECT * FROM plpgsql_check_function(${func.oid}::regprocedure);`;
  try {
    const output = execSync(
      `docker exec schoolpro-pg-tools psql "${DB_URL}" -t -A -F '|' -c "${checkSql.replace(/\n/g, ' ')}"`,
      { encoding: 'utf-8', timeout: 15000, maxBuffer: 2 * 1024 * 1024 }
    );

    const lines = output.trim().split('\n').filter(l => l.trim());

    if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
      ok++;
      results.push({ function: func.fullName, status: 'ok', issues: [] });
    } else {
      const issues = lines.map(line => {
        const parts = line.split('|');
        return {
          level: parts[0] || 'error',
          message: parts.slice(1).join(' ') || line,
        };
      });

      const hasErrors = issues.some(i => i.level === 'error' || i.level === 'ERROR');
      const hasWarnings = issues.some(i => i.level === 'warning' || i.level === 'WARNING');

      if (hasErrors) errors++;
      if (hasWarnings) warnings++;
      if (!hasErrors && !hasWarnings) ok++;

      results.push({ function: func.fullName, status: hasErrors ? 'error' : 'warning', issues });
    }
  } catch (e) {
    // plpgsql_check peut retourner une erreur si la fonction n'existe pas ou a des problèmes
    errors++;
    results.push({ function: func.fullName, status: 'error', issues: [{ level: 'error', message: e.message.split('\n')[0] }] });
  }
}

// Étape 4 : Afficher le résumé
console.log('');
console.log('═'.repeat(60));
console.log('📋 RÉSUMÉ AUDIT PL/pgSQL');
console.log('═'.repeat(60));
console.log(`  Fonctions analysées : ${functions.length}`);
console.log(`  ✓ OK                : ${ok}`);
console.log(`  ⚠ Warnings          : ${warnings}`);
console.log(`  ✗ Erreurs           : ${errors}`);
console.log('');

// Afficher les détails des fonctions avec problèmes
const problematic = results.filter(r => r.status !== 'ok');
if (problematic.length > 0) {
  console.log('═'.repeat(60));
  console.log('❌ Fonctions avec problèmes:');
  console.log('═'.repeat(60));

  for (const r of problematic) {
    console.log(`\n  ${r.status === 'error' ? '✗' : '⚠'} ${r.function}`);
    for (const issue of r.issues) {
      const icon = issue.level === 'error' || issue.level === 'ERROR' ? '  ✗' : '  ⚠';
      console.log(`${icon} [${issue.level}] ${issue.message}`);
      if (issue.detail) console.log(`     ${issue.detail}`);
    }
  }
}

// Étape 5 : Sauvegarder le rapport
const reportFile = join(REPORTS_DIR, `${TIMESTAMP}-plpgsql-check.txt`);
const jsonFile = join(REPORTS_DIR, `${TIMESTAMP}-plpgsql-check.json`);

if (isJson) {
  writeFileSync(jsonFile, JSON.stringify({ timestamp: new Date().toISOString(), total: functions.length, ok, warnings, errors, results }, null, 2));
  console.log(`\n📄 Rapport JSON: ${jsonFile}`);
} else {
  let report = `Audit PL/pgSQL — ${new Date().toISOString()}\n`;
  report += `Fonctions analysées: ${functions.length} | OK: ${ok} | Warnings: ${warnings} | Erreurs: ${errors}\n\n`;
  for (const r of results) {
    report += `${r.status === 'ok' ? '✓' : r.status === 'error' ? '✗' : '⚠'} ${r.function}\n`;
    if (r.issues.length > 0) {
      for (const issue of r.issues) {
        report += `  [${issue.level}] ${issue.message}\n`;
        if (issue.detail) report += `  ${issue.detail}\n`;
      }
    }
    report += '\n';
  }
  writeFileSync(reportFile, report);
  console.log(`\n📄 Rapport: ${reportFile}`);
}

process.exit(errors > 0 ? 1 : 0);
