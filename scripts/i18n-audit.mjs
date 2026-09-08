#!/usr/bin/env node
// Audit i18n: compare t("...") / getTranslations / useTranslations references against locale JSON files.
// Usage: node scripts/i18n-audit.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const I18N = path.join(ROOT, "src", "i18n");
const LOCALES = ["fr", "en", "so"];
const localeData = {};
for (const l of LOCALES) {
  localeData[l] = JSON.parse(fs.readFileSync(path.join(I18N, `${l}.json`), "utf8"));
}

// Flatten nested JSON into a Set of dotted paths.
function flatten(obj, prefix = "") {
  const out = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const sub of flatten(v, key)) out.add(sub);
    } else {
      out.add(key);
    }
  }
  return out;
}

// Recursively walk src/ (excluding tests, i18n, .audit-20260907)
function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "i18n" || entry.name === "node_modules" || entry.name.startsWith(".audit")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const files = walk(SRC);

// Patterns:
//   const <var> = useTranslations("ns") -> var -> ns
//   const <var> = useTranslations("ns.sub") -> var -> ns.sub
//   const <var> = getTranslations("ns") -> var -> ns
//   const <var> = getTranslations({ namespace: "ns" }) -> var -> ns
//   <var>("key")  -> resolved against <var>'s namespace
//   <var>(`template.${x}`) -> dynamic, skipped
//   <var>("a.b.c", { ... }) -> a.b.c under namespace
//
// We also handle bare t() calls (legacy) by resolving against the last namespace
// declared as `t` (or the only one if there's just one).
const NS_DECL =
  /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:useTranslations|getTranslations)\s*\(\s*(?:"([^"]+)"|'([^']+)'|\{\s*namespace:\s*"([^"]+)"\s*\})/g;
// Match any identifier followed by ( with a string/template arg
const CALL = /\b([A-Za-z_$][\w$]*)\s*\(\s*("([^"]+)"|'([^']+)'|`([^`]+)`)/g;

// Collect (namespace, key) pairs referenced in code.
const referenced = new Set(); // dotted full keys like "ns.sub.key"
const dynamicRefs = []; // for reporting
const unresolvedCalls = []; // calls with no matching namespace var

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  // Build map of varName -> namespace
  const varToNs = new Map();
  let m;
  NS_DECL.lastIndex = 0;
  while ((m = NS_DECL.exec(src)) !== null) {
    const varName = m[1];
    const ns = m[2] || m[3] || m[4];
    if (!ns) continue;
    varToNs.set(varName, ns);
  }
  if (varToNs.size === 0) continue;

  // For each call, resolve against the var's namespace
  CALL.lastIndex = 0;
  while ((m = CALL.exec(src)) !== null) {
    const varName = m[1];
    const key = m[3] || m[4] || m[5];
    if (key === undefined) continue;
    const isTemplate = !!m[5];
    const line = src.slice(0, m.index).split("\n").length;
    // Dynamic template literal with ${...}? skip
    if (isTemplate && /\$\{/.test(key)) {
      dynamicRefs.push({ file, line, key });
      continue;
    }
    const ns = varToNs.get(varName);
    if (!ns) continue; // not a translation call (e.g. setState("..."))
    // Resolve: if key already contains the namespace prefix, use as-is; otherwise prepend
    const full = key.startsWith(ns + ".") ? key : `${ns}.${key}`;
    referenced.add(full);
  }
}

// Flatten locale files
const localeKeys = {};
for (const l of LOCALES) localeKeys[l] = flatten(localeData[l]);

// 1. Referenced keys missing from fr.json
const frMissing = [...referenced].filter((k) => !localeKeys.fr.has(k)).sort();
// 2. fr.json keys missing from en.json
const enMissing = [...localeKeys.fr].filter((k) => !localeKeys.en.has(k)).sort();
// 3. fr.json keys missing from so.json
const soMissing = [...localeKeys.fr].filter((k) => !localeKeys.so.has(k)).sort();
// 4. en.json keys missing from fr.json (extra in en)
const enExtra = [...localeKeys.en].filter((k) => !localeKeys.fr.has(k)).sort();
// 5. so.json keys missing from fr.json (extra in so)
const soExtra = [...localeKeys.so].filter((k) => !localeKeys.fr.has(k)).sort();

console.log("=== REFERENCED KEYS MISSING FROM fr.json ===");
console.log(`Total: ${frMissing.length}`);
for (const k of frMissing) console.log("  " + k);

console.log("\n=== fr.json KEYS MISSING FROM en.json ===");
console.log(`Total: ${enMissing.length}`);
for (const k of enMissing) console.log("  " + k);

console.log("\n=== fr.json KEYS MISSING FROM so.json ===");
console.log(`Total: ${soMissing.length}`);
for (const k of soMissing) console.log("  " + k);

console.log("\n=== en.json EXTRA KEYS (not in fr.json) ===");
console.log(`Total: ${enExtra.length}`);
for (const k of enExtra.slice(0, 50)) console.log("  " + k);
if (enExtra.length > 50) console.log(`  ... and ${enExtra.length - 50} more`);

console.log("\n=== so.json EXTRA KEYS (not in fr.json) ===");
console.log(`Total: ${soExtra.length}`);
for (const k of soExtra.slice(0, 50)) console.log("  " + k);
if (soExtra.length > 50) console.log(`  ... and ${soExtra.length - 50} more`);

console.log(`\n=== DYNAMIC TEMPLATE-LITERAL t() CALLS (skipped, manual review) ===`);
console.log(`Total: ${dynamicRefs.length}`);
for (const r of dynamicRefs.slice(0, 30)) console.log(`  ${r.file.replace(ROOT + "/", "")}:${r.line}  \`${r.key}\``);
if (dynamicRefs.length > 30) console.log(`  ... and ${dynamicRefs.length - 30} more`);

// Write full report to file
const reportPath = path.join(ROOT, "scripts", "i18n-audit-report.txt");
const lines = [
  `SchoolPro i18n audit — ${new Date().toISOString()}`,
  "",
  `Referenced keys missing from fr.json: ${frMissing.length}`,
  ...frMissing.map((k) => "  " + k),
  "",
  `fr.json keys missing from en.json: ${enMissing.length}`,
  ...enMissing.map((k) => "  " + k),
  "",
  `fr.json keys missing from so.json: ${soMissing.length}`,
  ...soMissing.map((k) => "  " + k),
  "",
  `en.json extra keys (not in fr.json): ${enExtra.length}`,
  ...enExtra.map((k) => "  " + k),
  "",
  `so.json extra keys (not in fr.json): ${soExtra.length}`,
  ...soExtra.map((k) => "  " + k),
  "",
  `Dynamic template-literal t() calls (manual review): ${dynamicRefs.length}`,
  ...dynamicRefs.map((r) => `  ${r.file.replace(ROOT + "/", "")}:${r.line}  \`${r.key}\``),
];
fs.writeFileSync(reportPath, lines.join("\n"));
console.log(`\nFull report written to: ${reportPath}`);
