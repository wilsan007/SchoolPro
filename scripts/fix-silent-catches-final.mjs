#!/usr/bin/env node
/**
 * fix-silent-catches-final.mjs — Ajoute console.warn("[non-fatal]", e)
 * dans les catch blocks qui n'ont aucun logging/gestion d'erreur visible.
 *
 * Usage: node scripts/fix-silent-catches-final.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const SRC_DIR = join(process.cwd(), "src");
const ROOT = process.cwd();

const ERROR_HANDLING_PATTERNS = [
  "console.", "toast.", "throw ", "throw}", "setError", "alert(", "logger",
  "audit", "non-fatal", "setNotification", "setAlert", "setFeedback",
  "setToast", "showError", "notifyError", "setErrorMessage", "setErr",
  "setSaveStatus", "setStatus", "setWarning", "onError", "reject(",
  "erreurJson", "setFormError", "setSubmitError", "setGlobalError",
  "setFieldError", "setLastError", "setProblem", "setIssues",
  "captureException", "Sentry", "reportError", "logError", "handleError",
  "setLoadingError", "setFetchError", "setMutationError", "setDeleteError",
  "setUpdateError", "setCreateError", "setSaveError", "setActionError",
  "setRequestError", "setApiError", "setDataError", "setNetworkError",
  "setConnectionError", "setAuthError", "setPermissionError",
  "setValidationError", "setUploadError", "setDownloadError",
  "setImportError", "setExportError", "setSyncError", "setFormState",
  "setSubmitState", "setIsError", "setHasError", "setIsFailed",
  "setHasFailed", "setIsErrored", "setShowError", "setShowAlert",
  "setShowWarning", "setShowToast", "setShowNotification", "setShowFeedback",
  "setShowMessage", "setActionStatus", "setBulkStatus", "setEtat",
  "setStatut",
];

const stats = { filesScanned: 0, filesModified: 0, catchesFixed: 0 };

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

function findMatchingBrace(lines, startLineIdx, startCol) {
  let depth = 0;
  let inString = false;
  let stringChar = null;
  let inTemplate = false;
  let inBlockComment = false;
  let inLineComment = false;

  for (let i = startLineIdx; i < lines.length; i++) {
    const line = lines[i];
    const startJ = i === startLineIdx ? startCol : 0;
    for (let j = startJ; j < line.length; j++) {
      const ch = line[j];
      const next = line[j + 1];

      if (inLineComment) continue;
      if (inBlockComment) {
        if (ch === "*" && next === "/") { inBlockComment = false; j++; }
        continue;
      }
      if (inString) {
        if (ch === "\\") { j++; continue; }
        if (ch === stringChar) { inString = false; }
        continue;
      }
      if (ch === "/" && next === "/") { inLineComment = true; continue; }
      if (ch === "/" && next === "*") { inBlockComment = true; j++; continue; }
      if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
      if (ch === "`") { inTemplate = !inTemplate; continue; }
      if (inTemplate) continue;

      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) return { lineIdx: i, col: j };
      }
    }
    inLineComment = false;
  }
  return null;
}

function fixFile(filePath) {
  stats.filesScanned++;
  if (filePath.includes(".test.")) return;

  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const relPath = relative(ROOT, filePath);
  const insertions = []; // { lineIdx, text }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const catchMatch = line.match(/catch\s*(?:\((\w+)\))?\s*\{/);
    if (!catchMatch) continue;

    const varName = catchMatch[1] || "e";
    const braceCol = line.indexOf("{", catchMatch.index + catchMatch[0].length - 1);
    if (braceCol === -1) continue;

    const closing = findMatchingBrace(lines, i, braceCol);
    if (!closing) continue;

    // Extract body
    const bodyLines = [];
    for (let j = i; j <= closing.lineIdx; j++) {
      if (j === i && j === closing.lineIdx) {
        bodyLines.push(line.substring(braceCol + 1, closing.col));
      } else if (j === i) {
        bodyLines.push(line.substring(braceCol + 1));
      } else if (j === closing.lineIdx) {
        bodyLines.push(lines[j].substring(0, closing.col));
      } else {
        bodyLines.push(lines[j]);
      }
    }
    const body = bodyLines.join("\n").trim();

    // Check if body has error handling
    const hasHandling = ERROR_HANDLING_PATTERNS.some((p) => body.includes(p));
    const hasReturn = body.includes("return ") && (body.includes("error") || body.includes("Error") || body.includes("erreur") || body.includes("500") || body.includes("400"));
    // Skip if already has logging or returns error response
    if (hasHandling || hasReturn) continue;
    // Skip intentional ignores
    if (body.includes("/* ignore */") || body.includes("/* intentional */") || body.includes("/* empty */")) continue;

    // Determine indentation
    const lineIndent = line.match(/^(\s*)/)[1];
    const bodyIndent = bodyLines.length > 1 && bodyLines[1] ? bodyLines[1].match(/^(\s*)/)[1] : `${lineIndent}  `;
    const catchIndent = bodyIndent || `${lineIndent}  `;

    if (body === "") {
      // Empty catch — insert log line
      if (i === closing.lineIdx) {
        // Single-line: catch (e) {} → catch (e) { console.warn("[non-fatal]", e); }
        // Handle by replacing the line
        lines[i] = line.replace(/\{\s*\}/, `{ console.warn("[non-fatal]", ${varName}); }`);
      } else {
        // Multi-line empty: catch (e) {\n} → catch (e) {\n  console.warn(...);\n}
        insertions.push({ lineIdx: i + 1, text: `${catchIndent}console.warn("[non-fatal]", ${varName});` });
      }
    } else if (i === closing.lineIdx) {
      // Single-line catch with code: catch (e) { return false; }
      // → catch (e) { console.warn("[non-fatal]", e); return false; }
      lines[i] = line.replace(
        /\{(\s*)([^}]+)(\s*)\}/,
        `{ console.warn("[non-fatal]", ${varName}); $2 }`
      );
    } else {
      // Multi-line catch — insert log as first statement
      insertions.push({ lineIdx: i + 1, text: `${catchIndent}console.warn("[non-fatal]", ${varName});` });
    }

    stats.catchesFixed++;
  }

  if (insertions.length === 0 && lines.join("\n") === content) return;

  // Apply insertions in reverse order
  insertions.sort((a, b) => b.lineIdx - a.lineIdx);
  for (const ins of insertions) {
    lines.splice(ins.lineIdx, 0, ins.text);
  }

  const newContent = lines.join("\n");
  if (newContent !== content) {
    stats.filesModified++;
    if (!DRY_RUN) writeFileSync(filePath, newContent, "utf8");
    console.log(`  ${DRY_RUN ? "[DRY] " : ""}Fixed: ${relPath} (${insertions.length + (lines.length - content.split("\n").length)} insertions)`);
  }
}

console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}Fixing truly silent catch blocks...\n`);

const files = walk(SRC_DIR);
for (const f of files) fixFile(f);

console.log(`\n--- Summary ---`);
console.log(`Files scanned: ${stats.filesScanned}`);
console.log(`Files modified: ${stats.filesModified}`);
console.log(`Silent catches fixed: ${stats.catchesFixed}`);
