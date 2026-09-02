#!/usr/bin/env node
/**
 * Pre-commit hook — vérification rapide avant le commit.
 *
 * Inspiré de GOSE 2.0 : la dette technique doit rétrécir, jamais grandir.
 * Ce hook exécute les vérifications les plus rapides (tsc + lint) pour
 * empêcher l'introduction d'erreurs de type ou de style.
 *
 * Les tests complets (vitest) et l'audit sont exécutés par `pnpm verify`
 * en CI, pas ici — ils sont trop lents pour un pre-commit.
 *
 * Installation : voir scripts/install-hooks.mjs
 */
import { execSync } from "node:child_process";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function log(msg, color = RESET) {
  console.log(`${color}${msg}${RESET}`);
}

function run(cmd, label) {
  try {
    execSync(cmd, { stdio: "pipe", cwd: process.cwd() });
    log(`  ✓ ${label}`, GREEN);
    return true;
  } catch (err) {
    log(`  ✗ ${label}`, RED);
    if (err.stdout) console.log(err.stdout.toString());
    if (err.stderr) console.log(err.stderr.toString());
    return false;
  }
}

console.log("\n🔍 Vérification pre-commit...\n");

const checks = [
  ["npx tsc --noEmit --pretty false 2>&1 | head -50", "TypeScript (tsc --noEmit)"],
  ["npx next lint --quiet 2>&1 | tail -5", "ESLint (next lint)"],
];

let allPassed = true;
for (const [cmd, label] of checks) {
  if (!run(cmd, label)) allPassed = false;
}

if (allPassed) {
  log("\n✅ Toutes les vérifications pre-commit ont passé.\n", GREEN);
  process.exit(0);
} else {
  log("\n❌ Des vérifications ont échoué. Corrigez les erreurs avant de committer.", RED);
  log("   Pour bypasser (non recommandé) : git commit --no-verify\n", YELLOW);
  process.exit(1);
}
