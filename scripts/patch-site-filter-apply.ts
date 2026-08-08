#!/usr/bin/env tsx
/**
 * Patch automatique: ajoute siteFilterFromSession aux fichiers qui utilisent
 * auth() + tenantId dans des requêtes Prisma sans filtrage par site.
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const ROOT = path.join(__dirname, "..");

// Find candidate files
const cmd = `grep -rl 'from "@/lib/auth"' src/app --include="*.ts" --include="*.tsx" | xargs grep -L 'siteFilterFromSession' 2>/dev/null | xargs grep -l 'tenantId' 2>/dev/null | xargs grep -l 'where:' 2>/dev/null`;
const result = execSync(cmd, { encoding: "utf-8", cwd: ROOT });
const files = result.trim().split("\n").filter(Boolean);

console.log(`Found ${files.length} files to patch`);

let patched = 0;
let skipped = 0;

for (const relFile of files) {
  const absFile = path.join(ROOT, relFile);
  let content = fs.readFileSync(absFile, "utf-8");

  // Skip tests
  if (relFile.includes(".test.")) continue;

  // Skip if already has site filter
  if (content.includes("siteFilterFromSession") || content.includes("getTenantContext")) {
    skipped++;
    continue;
  }

  // Find the line that extracts tenantId from session
  // Common patterns:
  //   const tenantId = session.user.tenantId;
  //   const { tenantId } = session.user;
  const tenantIdPatterns = [
    /const tenantId = session\.user\.tenantId;/,
    /const tenantId = session\.user\.tenantId as string;/,
  ];

  let matched = false;
  for (const pattern of tenantIdPatterns) {
    if (pattern.test(content)) {
      // Add import
      const importLine = `import { siteFilterFromSession } from "@/lib/site-filter";`;
      
      // Find a good place to add the import - after the last import
      const importMatch = content.match(/^import[^\n]+;/gm);
      if (importMatch) {
        const lastImport = importMatch[importMatch.length - 1];
        const lastImportIndex = content.lastIndexOf(lastImport);
        content = content.slice(0, lastImportIndex + lastImport.length) + 
          "\n" + importLine + 
          content.slice(lastImportIndex + lastImport.length);
      }

      // Add siteFilter extraction after tenantId line
      const siteFilterCode = `
  const siteId = (session.user as { siteId?: string | null }).siteId ?? null;
  const siteIds = (session.user as { siteIds?: string[] }).siteIds;
  const siteFilter = siteFilterFromSession(session.user.role, siteId, siteIds);`;

      content = content.replace(
        pattern,
        (match) => match + siteFilterCode
      );

      // Now replace `where: { tenantId` with `where: { tenantId, ...siteFilter`
      // and `where: { tenantId,` with `where: { tenantId, ...siteFilter,`
      content = content.replace(
        /where:\s*\{\s*tenantId\s*\}/g,
        "where: { tenantId, ...siteFilter }"
      );
      content = content.replace(
        /where:\s*\{\s*tenantId\s*,/g,
        "where: { tenantId, ...siteFilter,"
      );

      // Also handle patterns like `{ tenantId,` in spread contexts
      content = content.replace(
        /\{\s*tenantId,\s*\.\.\./g,
        "{ tenantId, ...siteFilter, ..."
      );

      fs.writeFileSync(absFile, content, "utf-8");
      patched++;
      matched = true;
      break;
    }
  }

  if (!matched) {
    skipped++;
  }
}

console.log(`\nPatched: ${patched}`);
console.log(`Skipped: ${skipped}`);
