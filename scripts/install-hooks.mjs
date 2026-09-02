#!/usr/bin/env node
/**
 * Installation du pre-commit hook.
 *
 * Crée .git/hooks/pre-commit qui exécute scripts/pre-commit.mjs.
 * Idempotent : peut être relancé sans risque.
 *
 * Usage : node scripts/install-hooks.mjs
 */
import { writeFileSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";

const hookPath = join(process.cwd(), ".git", "hooks", "pre-commit");
const hookContent = `#!/bin/sh
# Pre-commit hook — installé par scripts/install-hooks.mjs
# Ne pas éditer manuellement : exécuter 'node scripts/install-hooks.mjs' pour réinstaller.
exec node "$(git rev-parse --show-toplevel)/scripts/pre-commit.mjs"
`;

try {
  writeFileSync(hookPath, hookContent, { mode: 0o755 });
  chmodSync(hookPath, 0o755);
  console.log("✅ Pre-commit hook installé : .git/hooks/pre-commit");
  console.log("   Pour bypasser : git commit --no-verify");
  console.log("   Pour réinstaller : node scripts/install-hooks.mjs");
} catch (err) {
  console.error("❌ Échec de l'installation du hook :", err.message);
  process.exit(1);
}
