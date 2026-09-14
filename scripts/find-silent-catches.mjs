#!/usr/bin/env node
/**
 * find-silent-catches.mjs — Trouve les VRAIS catch blocks silencieux.
 * Un catch est silencieux si son corps ne contient NI:
 *   console.*, toast.*, throw, setError*, alert(, logger, audit, non-fatal,
 *   setNotification, setAlert, setFeedback, setToast, showError, notifyError,
 *   setErrorMessage, setErr, setSaveStatus, setStatus, setWarning, onError,
 *   reject(, return erreurJson, return NextResponse.json(...error...),
 *   setFormError, setSubmitError, setGlobalError, setFieldError
 *
 * Usage: node scripts/find-silent-catches.mjs
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";

const SRC_DIR = join(process.cwd(), "src");
const ROOT = process.cwd();

const ERROR_HANDLING_PATTERNS = [
  "console.",
  "toast.",
  "throw ",
  "throw}",
  "setError",
  "alert(",
  "logger",
  "audit",
  "non-fatal",
  "setNotification",
  "setAlert",
  "setFeedback",
  "setToast",
  "showError",
  "notifyError",
  "setErrorMessage",
  "setErr",
  "setSaveStatus",
  "setStatus",
  "setWarning",
  "onError",
  "reject(",
  "erreurJson",
  "setFormError",
  "setSubmitError",
  "setGlobalError",
  "setFieldError",
  "setLastError",
  "setProblem",
  "setIssues",
  "captureException",
  "Sentry",
  "reportError",
  "logError",
  "handleError",
  "dispatchError",
  "emitError",
  "callback(",
  "cb(",
  "reject",
  "setLoadingError",
  "setFetchError",
  "setMutationError",
  "setDeleteError",
  "setUpdateError",
  "setCreateError",
  "setSaveError",
  "setActionError",
  "setRequestError",
  "setApiError",
  "setDataError",
  "setNetworkError",
  "setConnectionError",
  "setAuthError",
  "setPermissionError",
  "setValidationError",
  "setUploadError",
  "setDownloadError",
  "setImportError",
  "setExportError",
  "setSyncError",
  "setImportWarning",
  "setFormState",
  "setSubmitState",
  "setResult",
  "setResponse",
  "setOutcome",
  "setFailure",
  "setFailed",
  "setIsError",
  "setHasError",
  "setIsFailed",
  "setHasFailed",
  "setIsErrored",
  "setHasIssue",
  "setHasProblem",
  "setHasWarning",
  "setHasAlert",
  "setShowError",
  "setShowAlert",
  "setShowWarning",
  "setShowToast",
  "setShowNotification",
  "setShowFeedback",
  "setShowMessage",
  "setShowIssue",
  "setShowProblem",
  "setShowFailure",
  "setShowFailed",
  "setShowException",
  "setShowException",
];

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
  // Find the closing brace that matches the opening brace at startLineIdx, startCol
  let depth = 0;
  let inString = false;
  let stringChar = null;
  let inTemplate = false;
  let inComment = false;
  let inLineComment = false;

  for (let i = startLineIdx; i < lines.length; i++) {
    let line = lines[i];
    let startJ = i === startLineIdx ? startCol : 0;
    for (let j = startJ; j < line.length; j++) {
      const ch = line[j];
      const next = line[j + 1];

      if (inLineComment) {
        if (ch === "\n") { inLineComment = false; }
        continue;
      }
      if (inComment) {
        if (ch === "*" && next === "/") { inComment = false; j++; }
        continue;
      }
      if (inString) {
        if (ch === "\\") { j++; continue; }
        if (ch === stringChar) { inString = false; }
        continue;
      }
      if (ch === "/" && next === "/") { inLineComment = true; continue; }
      if (ch === "/" && next === "*") { inComment = true; j++; continue; }
      if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
      if (ch === "`") { inTemplate = !inTemplate; continue; }
      if (inTemplate) continue;

      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) return { lineIdx: i, col: j };
      }
    }
  }
  return null;
}

function analyzeFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const findings = [];
  const relPath = relative(ROOT, filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match catch blocks: } catch (varName) {  or  catch (varName) {
    const catchMatch = line.match(/catch\s*(?:\((\w+)\))?\s*\{/);
    if (!catchMatch) continue;

    const varName = catchMatch[1] || "e";
    // Find the opening brace position
    const braceCol = line.indexOf("{", catchMatch.index + catchMatch[0].length - 1);
    if (braceCol === -1) continue;

    // Find matching closing brace
    const closing = findMatchingBrace(lines, i, braceCol);
    if (!closing) continue;

    // Extract catch body
    const bodyLines = [];
    for (let j = i; j <= closing.lineIdx; j++) {
      if (j === i && j === closing.lineIdx) {
        // Single line catch
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

    // Check if body has any error handling
    const hasHandling = ERROR_HANDLING_PATTERNS.some((p) => body.includes(p));
    // Also check for return statements that return error responses
    const hasReturn = body.includes("return ") && (body.includes("error") || body.includes("Error") || body.includes("erreur") || body.includes("500") || body.includes("400"));

    if (!hasHandling && !hasReturn && body !== "") {
      // Has code but no error handling
      findings.push({
        file: relPath,
        line: i + 1,
        varName,
        type: "NO_LOGGING",
        bodyPreview: body.substring(0, 100),
      });
    } else if (body === "") {
      // Empty catch
      findings.push({
        file: relPath,
        line: i + 1,
        varName,
        type: "EMPTY",
        bodyPreview: "",
      });
    }
  }

  return findings;
}

console.log("\nSearching for truly silent catch blocks...\n");

const files = walk(SRC_DIR);
const allFindings = [];
for (const f of files) {
  if (f.includes(".test.")) continue;
  const findings = analyzeFile(f);
  allFindings.push(...findings);
}

const empty = allFindings.filter((f) => f.type === "EMPTY");
const noLogging = allFindings.filter((f) => f.type === "NO_LOGGING");

console.log(`Total truly silent catches: ${allFindings.length}`);
console.log(`  Empty catch blocks: ${empty.length}`);
console.log(`  Catch with code but no logging: ${noLogging.length}`);

console.log("\n--- EMPTY catch blocks ---");
for (const f of empty) {
  console.log(`  ${f.file}:${f.line} — catch (${f.varName}) {}`);
}

console.log("\n--- NO LOGGING catch blocks ---");
for (const f of noLogging.slice(0, 50)) {
  console.log(`  ${f.file}:${f.line} — catch (${f.varName}) { ${f.bodyPreview}... }`);
}
if (noLogging.length > 50) {
  console.log(`  ... and ${noLogging.length - 50} more`);
}
