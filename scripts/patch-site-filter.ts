#!/usr/bin/env tsx
/**
 * Script pour ajouter automatiquement le siteFilter aux fichiers qui utilisent
 * `const tenantId = session.user.tenantId` sans appliquer de filtre par site.
 *
 * Stratégie:
 * 1. Trouver tous les fichiers .ts/.tsx dans src/app qui contiennent `auth()`
 * 2. Vérifier s'ils utilisent `tenantId` sans `siteFilterFromSession`
 * 3. Ajouter l'import et le code du siteFilter
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const SRC_DIR = path.join(__dirname, "..", "src");

// Find all .ts/.tsx files that import auth from "@/lib/auth" but don't import siteFilterFromSession
const result = execSync(
  `grep -rl 'from "@/lib/auth"' ${SRC_DIR} --include="*.ts" --include="*.tsx" | xargs grep -L 'siteFilterFromSession' 2>/dev/null || true`,
  { encoding: "utf-8" }
);

const files = result.trim().split("\n").filter(Boolean);

console.log(`Found ${files.length} files to check...`);

let patched = 0;

for (const file of files) {
  let content = fs.readFileSync(file, "utf-8");

  // Skip if already has siteFilter
  if (content.includes("siteFilterFromSession") || content.includes("getTenantContext")) {
    continue;
  }

  // Skip test files
  if (file.includes(".test.") || file.includes("seed-")) {
    continue;
  }

  // Check if the file uses `session.user.tenantId` or `const tenantId = session.user.tenantId`
  if (!content.includes("tenantId")) {
    continue;
  }

  // Check if it has a Prisma query with tenantId
  if (!content.includes("where:") && !content.includes("Where:")) {
    continue;
  }

  // Check if it already imports from site-filter
  if (content.includes("@/lib/site-filter")) {
    continue;
  }

  console.log(`Would patch: ${file}`);
  patched++;
}

console.log(`\nTotal files that would need patching: ${patched}`);
console.log("Run with --apply to actually patch files.");
