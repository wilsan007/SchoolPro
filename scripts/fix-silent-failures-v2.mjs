#!/usr/bin/env node
/**
 * fix-silent-failures-v2.mjs — Corrige les failures silencieux de façon ciblée:
 *
 * 1. catch (e) { ... } sans log → ajoute console.warn("[non-fatal]", e) en première ligne
 * 2. .catch(() => ...) sans log → ajoute (e) param + console.warn
 * 3. fire-and-forget (auditFire/publishEvents/notify/sendEmail/sendSMS/sendWhatsApp sans await)
 *    → ajoute .catch((e) => console.warn("[non-fatal]", e))
 * 4. JSON.parse sans try/catch → wrap dans try/catch
 *
 * Usage: node scripts/fix-silent-failures-v2.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const SRC_DIR = join(process.cwd(), "src");
const ROOT = process.cwd();

const stats = {
  filesScanned: 0,
  filesModified: 0,
  silentCatchFixed: 0,
  catchArrowFixed: 0,
  fireForgetFixed: 0,
  jsonParseFixed: 0,
};

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

function hasLoggingInLines(lines) {
  return lines.some(
    (l) =>
      l.includes("console.") ||
      l.includes("throw ") ||
      l.includes("throw}") ||
      l.includes("audit(") ||
      l.includes("auditFire") ||
      l.includes("logger") ||
      l.includes("non-fatal")
  );
}

function fixSilentCatches(content) {
  const lines = content.split("\n");
  const result = [...lines];
  let modified = false;
  const insertions = []; // { lineIndex, text }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match: catch (varName) {  or  catch {
    const catchMatch = line.match(/^(\s*)catch\s*(?:\((\w+)\))?\s*\{?\s*$/);
    if (!catchMatch) continue;

    const indent = catchMatch[1];
    const varName = catchMatch[2] || "e";
    const braceOnSameLine = line.includes("{");
    const braceOnNextLine = !braceOnSameLine && i + 1 < lines.length && lines[i + 1].trim().startsWith("{");

    if (!braceOnSameLine && !braceOnNextLine) continue;

    // Check next 5 lines for logging
    const nextLines = lines.slice(i + 1, i + 6);
    if (hasLoggingInLines(nextLines)) continue;

    // Find the opening brace line
    let braceLineIdx = braceOnSameLine ? i : i + 1;

    // Insert console.warn after the opening brace
    const braceLine = result[braceLineIdx];
    // Check if the catch block is empty (just whitespace then })
    const afterBrace = lines.slice(braceLineIdx + 1, braceLineIdx + 3);
    const isEmptyCatch =
      afterBrace.length > 0 &&
      afterBrace[0] !== undefined &&
      (afterBrace[0].trim() === "" || afterBrace[0].trim() === "}") &&
      (afterBrace[1] === undefined || afterBrace[1].trim().startsWith("}"));

    if (isEmptyCatch) {
      // Replace empty catch body
      const closingIdx = afterBrace[0]?.trim() === "}" ? braceLineIdx + 1 : braceLineIdx + 2;
      if (result[closingIdx] !== undefined && result[closingIdx].trim().startsWith("}")) {
        result[closingIdx] = `${indent}}`;
        insertions.push({ lineIdx: braceLineIdx + 1, text: `${indent}  console.warn("[non-fatal]", ${varName});` });
        modified = true;
        stats.silentCatchFixed++;
      }
    } else {
      // Non-empty catch without logging — add log as first statement
      insertions.push({ lineIdx: braceLineIdx + 1, text: `${indent}  console.warn("[non-fatal]", ${varName});` });
      modified = true;
      stats.silentCatchFixed++;
    }
  }

  // Apply insertions in reverse order to preserve indices
  insertions.sort((a, b) => b.lineIdx - a.lineIdx);
  for (const ins of insertions) {
    result.splice(ins.lineIdx, 0, ins.text);
  }

  return modified ? result.join("\n") : content;
}

function fixCatchArrows(content) {
  // .catch(() => {}) → .catch((e) => console.warn("[non-fatal]", e))
  let count = 0;
  content = content.replace(
    /\.catch\(\(\)\s*=>\s*\{\s*\}\)/g,
    () => {
      count++;
      return `.catch((e) => console.warn("[non-fatal]", e))`;
    }
  );
  // .catch(() => null) → .catch((e) => { console.warn("[non-fatal]", e); return null; })
  content = content.replace(
    /\.catch\(\(\)\s*=>\s*null\)/g,
    () => {
      count++;
      return `.catch((e) => { console.warn("[non-fatal]", e); return null; })`;
    }
  );
  // .catch(() => undefined) → same
  content = content.replace(
    /\.catch\(\(\)\s*=>\s*undefined\)/g,
    () => {
      count++;
      return `.catch((e) => { console.warn("[non-fatal]", e); return undefined; })`;
    }
  );
  // .catch(() => { /* comment */ }) → .catch((e) => console.warn("[non-fatal]", e))
  content = content.replace(
    /\.catch\(\(\)\s*=>\s*\{\s*\/\*[^]*?\*\/\s*\}\)/g,
    () => {
      count++;
      return `.catch((e) => console.warn("[non-fatal]", e))`;
    }
  );
  // Multi-line: .catch(() => {\n})
  content = content.replace(
    /\.catch\(\(\)\s*=>\s*\{\s*\n\s*\}\)/g,
    () => {
      count++;
      return `.catch((e) => console.warn("[non-fatal]", e))`;
    }
  );

  stats.catchArrowFixed += count;
  return content;
}

function fixFireAndForget(content) {
  // Add .catch() to unawaited calls to auditFire, publishEvents, notify, sendEmail, sendSMS, sendWhatsApp
  const patterns = [
    /\bauditFire\(/g,
    /\bpublishEvents\(/g,
    /\bnotify\(/g,
    /\bsendEmail\(/g,
    /\bsendSMS\(/g,
    /\bsendWhatsApp\(/g,
  ];
  let count = 0;
  const lines = content.split("\n");
  const result = [...lines];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip if already awaited, assigned, returned, or in import/function declaration
    if (
      line.includes("await ") ||
      line.includes("const ") ||
      line.includes("let ") ||
      line.includes("function ") ||
      line.includes("import ") ||
      line.includes("return ") ||
      line.includes("=>") ||
      line.includes(".catch(") ||
      line.includes("void ")
    ) {
      continue;
    }

    // Check if any of our target patterns exist on this line
    const hasPattern = patterns.some((p) => p.test(line));
    if (!hasPattern) continue;

    // Skip multi-line statement starts (line ends with opening paren and no closing)
    // We need to find the end of the statement
    // Simple approach: if the line ends with `;` or the call is complete, add .catch()
    // For lines that end with `(` or `,` (multi-line calls), skip — too complex for auto-fix
    const trimmed = line.trimEnd();
    if (trimmed.endsWith("(") || trimmed.endsWith(",")) continue;

    // Find the closing `)` and `;` of the call — if the line ends with `);` or `)`, add .catch before the `;`
    // Pattern: someCall(args);  →  someCall(args).catch((e) => console.warn("[non-fatal]", e));
    // Pattern: someCall(args)   →  someCall(args).catch((e) => console.warn("[non-fatal]", e))

    // Check if line ends with ); or )
    if (trimmed.endsWith(");")) {
      result[i] = trimmed.replace(/\);$/, ").catch((e) => console.warn(\"[non-fatal]\", e));");
      count++;
    } else if (trimmed.endsWith(")") && !trimmed.endsWith(").catch(")) {
      result[i] = trimmed.replace(/\)$/, ").catch((e) => console.warn(\"[non-fatal]\", e))");
      count++;
    }
  }

  stats.fireForgetFixed += count;
  return count > 0 ? result.join("\n") : content;
}

function fixJsonParseNoTry(content) {
  // This is complex to do automatically — skip for now, handle manually
  return content;
}

function fixFile(filePath) {
  stats.filesScanned++;
  let content = readFileSync(filePath, "utf8");
  const original = content;
  const relPath = relative(ROOT, filePath);

  // Apply fixes in order
  content = fixCatchArrows(content);
  content = fixSilentCatches(content);
  content = fixFireAndForget(content);
  content = fixJsonParseNoTry(content);

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
console.log(`Silent catch blocks fixed: ${stats.silentCatchFixed}`);
console.log(`Empty .catch() arrow fixed: ${stats.catchArrowFixed}`);
console.log(`Fire-and-forget fixed: ${stats.fireForgetFixed}`);
console.log(`JSON.parse wrapped: ${stats.jsonParseFixed}`);
