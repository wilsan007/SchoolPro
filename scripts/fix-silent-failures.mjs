#!/usr/bin/env node
/**
 * fix-silent-failures.mjs — Corrige automatiquement les failures silencieux:
 * 1. .catch(() => {})  →  .catch((e) => console.warn("[non-fatal]", e))
 * 2. catch (e) {} / catch {}  →  catch (e) { console.warn("[non-fatal]", e) }
 *    (gère aussi les variantes multi-lignes et avec commentaires seulement)
 *
 * Usage: node scripts/fix-silent-failures.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const SRC_DIR = join(process.cwd(), "src");

const stats = { filesScanned: 0, filesModified: 0, catchEmpty: 0, catchArrow: 0 };

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) results.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(extname(full))) results.push(full);
  }
  return results;
}

function fixFile(filePath) {
  stats.filesScanned++;
  let content = readFileSync(filePath, "utf8");
  const original = content;
  const relPath = filePath.replace(process.cwd() + "/", "");

  // 1. Fix .catch(() => {}) — single line
  content = content.replace(
    /\.catch\(\(\)\s*=>\s*\{\s*\}\)/g,
    () => {
      stats.catchArrow++;
      return `.catch((e) => console.warn("[non-fatal]", e))`;
    }
  );

  // 1b. Fix .catch(() => { /* comment */ }) — with comment only
  content = content.replace(
    /\.catch\(\(\)\s*=>\s*\{\s*\/\*[^]*?\*\/\s*\}\)/g,
    () => {
      stats.catchArrow++;
      return `.catch((e) => console.warn("[non-fatal]", e))`;
    }
  );

  // 1c. Fix .catch(() => {\n}) — multiline empty
  content = content.replace(
    /\.catch\(\(\)\s*=>\s*\{\s*\n\s*\}\)/g,
    () => {
      stats.catchArrow++;
      return `.catch((e) => console.warn("[non-fatal]", e))`;
    }
  );

  // 2. Fix empty catch blocks with variable: catch (e) {} — single line
  content = content.replace(
    /catch\s*\((\w+)\)\s*\{\s*\}/g,
    (_m, varName) => {
      stats.catchEmpty++;
      return `catch (${varName}) { console.warn("[non-fatal]", ${varName}) }`;
    }
  );

  // 2b. catch (e) { /* comment */ } — comment only
  content = content.replace(
    /catch\s*\((\w+)\)\s*\{\s*\/\*[^]*?\*\/\s*\}/g,
    (_m, varName) => {
      stats.catchEmpty++;
      return `catch (${varName}) { console.warn("[non-fatal]", ${varName}) }`;
    }
  );

  // 2c. catch (e) {\n} — multiline empty with variable
  content = content.replace(
    /catch\s*\((\w+)\)\s*\{\s*\n\s*\}/g,
    (_m, varName) => {
      stats.catchEmpty++;
      return `catch (${varName}) { console.warn("[non-fatal]", ${varName}) }`;
    }
  );

  // 3. Fix empty catch without variable: catch {} — single line (optional catch binding)
  content = content.replace(
    /catch\s*\{\s*\}/g,
    () => {
      stats.catchEmpty++;
      return `catch (e) { console.warn("[non-fatal]", e) }`;
    }
  );

  // 3b. catch {\n} — multiline empty without variable
  content = content.replace(
    /catch\s*\{\s*\n\s*\}/g,
    () => {
      stats.catchEmpty++;
      return `catch (e) { console.warn("[non-fatal]", e) }`;
    }
  );

  if (content !== original) {
    stats.filesModified++;
    if (!DRY_RUN) writeFileSync(filePath, content, "utf8");
    console.log(`  ${DRY_RUN ? "[DRY] " : ""}Fixed: ${relPath}`);
  }
}

console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}Fixing silent failures in ${SRC_DIR}...\n`);

const files = walk(SRC_DIR);
for (const f of files) fixFile(f);

console.log(`\n--- Summary ---`);
console.log(`Files scanned: ${stats.filesScanned}`);
console.log(`Files modified: ${stats.filesModified}`);
console.log(`Empty catch blocks fixed: ${stats.catchEmpty}`);
console.log(`Empty .catch() arrow fixed: ${stats.catchArrow}`);
