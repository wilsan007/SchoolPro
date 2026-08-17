#!/usr/bin/env node
/**
 * Validateur statique du seed SQL contre schema.prisma.
 * Contrôle : tables/colonnes inconnues, colonnes obligatoires manquantes,
 * NULL interdits, valeurs d'enum invalides, clés étrangères orphelines,
 * ids dupliqués, contraintes @@unique.
 *
 * Usage: node prisma/sql/generate-sql.mjs && node prisma/sql/_audit/validate.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const SCHEMA = path.join(ROOT, 'prisma/schema.prisma');
const SQL_DIR = path.join(ROOT, 'prisma/sql');

// ── 1. Parse schema.prisma ─────────────────────────────────────
function parseSchema(src) {
  const enums = new Map(); // name -> Set(values)
  const models = new Map(); // modelName -> { table, fields: [], idField }
  const implicitJoinTables = new Set(); // table names like _CompetencePrerequis
  const lines = src.split('\n');
  let mode = null, cur = null, curName = null;

  for (const raw of lines) {
    const line = raw.replace(/\/\/\/.*$/, '').replace(/(^|\s)\/\/.*$/, '').trim();
    if (!line) continue;

    if (mode === null) {
      let m = line.match(/^model\s+([\wÀ-ÿ]+)\s*\{/);
      if (m) { mode = 'model'; curName = m[1]; cur = { name: curName, table: curName, fields: [], uniques: [] }; continue; }
      m = line.match(/^enum\s+([\wÀ-ÿ]+)\s*\{/);
      if (m) { mode = 'enum'; curName = m[1]; cur = new Set(); continue; }
      continue;
    }

    if (line === '}') {
      if (mode === 'model') models.set(curName, cur);
      else enums.set(curName, cur);
      mode = null; cur = null; curName = null;
      continue;
    }

    if (mode === 'enum') {
      const m = line.match(/^(\w+)/);
      if (m) cur.add(m[1]);
      continue;
    }

    // model body
    if (line.startsWith('@@')) {
      let m = line.match(/^@@map\("([^"]+)"\)/);
      if (m) { cur.table = m[1]; continue; }
      m = line.match(/^@@unique\(\[([^\]]+)\]/);
      if (m) { cur.uniques.push(m[1].split(',').map(s => s.trim())); continue; }
      continue;
    }

    const fm = line.match(/^([\wÀ-ÿ]+)\s+([\wÀ-ÿ]+)(\[\])?(\?)?\s*(.*)$/);
    if (!fm) continue;
    const [, name, type, isList, optional, attrs] = fm;
    const f = {
      name, type,
      isList: !!isList,
      optional: !!optional,
      attrs: attrs || '',
      column: name,
      hasDefault: /@default\(/.test(attrs || ''),
      isId: /@id\b/.test(attrs || ''),
      isUpdatedAt: /@updatedAt/.test(attrs || ''),
      relation: null,
    };
    const cm = (attrs || '').match(/@map\("([^"]+)"\)/);
    if (cm) f.column = cm[1];
    const rm = (attrs || '').match(/@relation\(([^)]*)\)/);
    if (rm) {
      const inner = rm[1];
      const fm2 = inner.match(/fields:\s*\[([^\]]+)\]/);
      const rm2 = inner.match(/references:\s*\[([^\]]+)\]/);
      const dm = inner.match(/onDelete:\s*(\w+)/);
      f.relation = {
        target: type,
        fields: fm2 ? fm2[1].split(',').map(s => s.trim()) : [],
        references: rm2 ? rm2[1].split(',').map(s => s.trim()) : [],
        onDelete: dm ? dm[1] : null,
      };
      // Detect implicit m-n join table: @relation("Name") on a list field without fields/references
      const nm = inner.match(/"([^"]+)"/);
      if (nm && f.isList && !fm2) {
        implicitJoinTables.add(`_${nm[1]}`);
      }
    }
    cur.fields.push(f);
  }
  return { enums, models, implicitJoinTables };
}

const { enums, models, implicitJoinTables } = parseSchema(fs.readFileSync(SCHEMA, 'utf8'));

// table -> model
const byTable = new Map();
for (const m of models.values()) byTable.set(m.table, m);

// FK descriptors: table -> [{ column, targetTable, targetColumn, onDelete, optional, viaModel }]
const fksByTable = new Map();
for (const m of models.values()) {
  const list = [];
  for (const f of m.fields) {
    if (!f.relation || f.relation.fields.length === 0) continue;
    const target = models.get(f.relation.target);
    if (!target) continue;
    for (let i = 0; i < f.relation.fields.length; i++) {
      const localField = m.fields.find(x => x.name === f.relation.fields[i]);
      const targetField = target.fields.find(x => x.name === f.relation.references[i]);
      if (!localField || !targetField) continue;
      list.push({
        column: localField.column,
        optional: localField.optional,
        targetTable: target.table,
        targetColumn: targetField.column,
        onDelete: f.relation.onDelete,
        relName: f.name,
      });
    }
  }
  if (list.length) fksByTable.set(m.table, list);
}

// ── 2. Parse SQL ──────────────────────────────────────────────
function splitTopLevel(s) {
  const out = [];
  let depth = 0, inStr = false, buf = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      buf += c;
      if (c === "'") {
        if (s[i + 1] === "'") { buf += s[++i]; } else inStr = false;
      }
      continue;
    }
    if (c === "'") { inStr = true; buf += c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; buf += c; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; buf += c; continue; }
    if (c === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim() !== '') out.push(buf.trim());
  return out;
}

function decode(tok) {
  const t = tok.trim();
  if (/^NULL$/i.test(t)) return { kind: 'null', value: null };
  if (/^TRUE$/i.test(t)) return { kind: 'bool', value: true };
  if (/^FALSE$/i.test(t)) return { kind: 'bool', value: false };
  if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(t)) return { kind: 'num', value: Number(t) };
  const m = t.match(/^'((?:[^']|'')*)'(::\w+)?$/);
  if (m) return { kind: m[2] ? 'cast' : 'str', value: m[1].replace(/''/g, "'"), cast: m[2] };
  return { kind: 'raw', value: t };
}

const tables = new Map(); // table -> { cols:Set, rows:[{col:val}], files:Set, count }
function ingest(file, sql) {
  const re = /INSERT\s+INTO\s+"?([A-Za-z_][\w]*)"?\s*\(([^)]*)\)\s*VALUES\s*/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const table = m[1];
    const cols = m[2].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    // read tuples from end of match until terminating ';'
    let i = re.lastIndex;
    const tuples = [];
    while (i < sql.length) {
      while (i < sql.length && /[\s,\n]/.test(sql[i])) i++;
      if (sql[i] !== '(') break;
      let depth = 0, inStr = false, start = i;
      for (; i < sql.length; i++) {
        const c = sql[i];
        if (inStr) { if (c === "'") { if (sql[i + 1] === "'") i++; else inStr = false; } continue; }
        if (c === "'") { inStr = true; continue; }
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) { i++; break; } }
      }
      tuples.push(sql.slice(start + 1, i - 1));
    }
    re.lastIndex = i;
    let t = tables.get(table);
    if (!t) { t = { cols: new Set(cols), colList: cols, rows: [], files: new Set() }; tables.set(table, t); }
    t.files.add(path.basename(file));
    for (const tup of tuples) {
      const parts = splitTopLevel(tup);
      const row = {};
      for (let k = 0; k < cols.length; k++) row[cols[k]] = parts[k] === undefined ? undefined : decode(parts[k]);
      row.__arity = parts.length;
      row.__cols = cols.length;
      row.__file = path.basename(file);
      t.rows.push(row);
    }
  }
}

// Tous les fichiers SQL du seed : générés (04-13) + écrits à la main (01-03, 14, 15).
const sqlFiles = fs.readdirSync(SQL_DIR).filter(f => f.endsWith('.sql') && !f.startsWith('00-')).sort();
for (const f of sqlFiles) ingest(f, fs.readFileSync(path.join(SQL_DIR, f), 'utf8'));

// ── 3. Checks ─────────────────────────────────────────────────
const problems = [];
const add = (sev, table, kind, msg, sample) => problems.push({ sev, table, kind, msg, sample });

// index of values per table+column (for FK targets)
const valueIndex = new Map();
function idxKey(t, c) { return `${t}.${c}`; }
function getIndex(t, c) {
  const k = idxKey(t, c);
  if (valueIndex.has(k)) return valueIndex.get(k);
  const set = new Set();
  const tt = tables.get(t);
  if (tt) for (const r of tt.rows) { const v = r[c]; if (v && v.value !== null && v.value !== undefined) set.add(String(v.value)); }
  valueIndex.set(k, set);
  return set;
}

for (const [table, t] of tables) {
  const model = byTable.get(table);
  if (!model) {
    if (implicitJoinTables.has(table)) continue; // implicit m-n join table (e.g. _CompetencePrerequis)
    add('ERROR', table, 'TABLE_INCONNUE', `Aucun modèle Prisma avec @@map("${table}")`, [...t.files][0]);
    continue;
  }

  const colByName = new Map(model.fields.filter(f => !f.isList && !(f.relation && f.relation.fields.length)).map(f => [f.column, f]));
  // Include scalar list fields (String[], Int[]) but exclude relation list fields (Competence[])
  const scalarCols = new Map(model.fields.filter(f => (!f.isList || !models.has(f.type)) && f.type !== model.name).map(f => [f.column, f]));

  // arity
  for (const r of t.rows.slice(0, 5)) {
    if (r.__arity !== r.__cols) add('ERROR', table, 'ARITE', `Nombre de valeurs (${r.__arity}) != nombre de colonnes (${r.__cols})`, r.__file);
  }

  // unknown columns
  for (const c of t.colList) {
    if (!scalarCols.has(c)) add('ERROR', table, 'COLONNE_INCONNUE', `Colonne "${c}" absente du modèle ${model.name}`, [...t.files][0]);
  }

  // missing required columns
  for (const f of model.fields) {
    if (f.isList) continue;
    if (f.relation && f.relation.fields.length) continue; // relation object, not a column
    if (models.has(f.type)) continue; // relation without fields (back-ref)
    if (f.optional || f.hasDefault || f.isUpdatedAt) continue;
    if (!t.cols.has(f.column)) add('ERROR', table, 'COLONNE_OBLIGATOIRE_MANQUANTE', `"${f.column}" (${f.type}) requis sans @default et absent de l'INSERT`, [...t.files][0]);
  }

  // NULL in non-optional / enum / duplicate id
  const seenId = new Set();
  const uniqSeen = model.uniques.map(() => new Set());
  const nullBad = new Map(), enumBad = new Map(), dupIds = [];
  const fkMiss = new Map();
  const fks = (fksByTable.get(table) || []).filter(fk => t.cols.has(fk.column));

  for (const r of t.rows) {
    for (const c of t.colList) {
      const f = scalarCols.get(c);
      if (!f) continue;
      const v = r[c];
      if (!v) continue;
      if (v.kind === 'null' && !f.optional && !f.hasDefault) {
        nullBad.set(c, (nullBad.get(c) || 0) + 1);
      }
      if (v.kind !== 'null' && enums.has(f.type)) {
        if (!enums.get(f.type).has(String(v.value))) {
          const k = `${c}=${v.value} (enum ${f.type})`;
          enumBad.set(k, (enumBad.get(k) || 0) + 1);
        }
      }
    }
    const idField = model.fields.find(f => f.isId);
    if (idField && r[idField.column] && r[idField.column].kind !== 'null') {
      const v = String(r[idField.column].value);
      if (seenId.has(v)) dupIds.push(v); else seenId.add(v);
    }
    model.uniques.forEach((u, ui) => {
      const cols = u.map(n => (model.fields.find(f => f.name === n) || {}).column).filter(Boolean);
      if (cols.length !== u.length || !cols.every(c => t.cols.has(c))) return;
      // Postgres : un NULL dans la clé neutralise la contrainte UNIQUE.
      if (cols.some(c => !r[c] || r[c].kind === 'null')) return;
      const key = cols.map(c => String(r[c].value)).join('|');
      if (uniqSeen[ui].has(key)) {
        add('ERROR', table, 'UNIQUE_VIOLE', `@@unique([${u.join(',')}]) dupliqué: ${key}`, r.__file);
      } else uniqSeen[ui].add(key);
    });
    for (const fk of fks) {
      const v = r[fk.column];
      if (!v || v.kind === 'null') continue;
      const target = getIndex(fk.targetTable, fk.targetColumn);
      if (target.size === 0) continue; // cible non couverte par le SQL statique -> vérifiée en base
      if (!target.has(String(v.value))) {
        const k = `${fk.column} -> ${fk.targetTable}.${fk.targetColumn}`;
        const e = fkMiss.get(k) || { n: 0, ex: [] };
        e.n++; if (e.ex.length < 3) e.ex.push(String(v.value));
        fkMiss.set(k, e);
      }
    }
  }

  for (const [c, n] of nullBad) add('ERROR', table, 'NULL_INTERDIT', `${n} ligne(s) avec NULL dans la colonne NOT NULL "${c}"`, null);
  for (const [k, n] of enumBad) add('ERROR', table, 'ENUM_INVALIDE', `${n} ligne(s): ${k}`, null);
  if (dupIds.length) add('ERROR', table, 'ID_DUPLIQUE', `${dupIds.length} id(s) dupliqué(s)`, dupIds.slice(0, 3).join(', '));
  for (const [k, e] of fkMiss) add('ERROR', table, 'FK_ORPHELINE', `${e.n} ligne(s): ${k} introuvable`, e.ex.join(', '));
}

// tables du schéma jamais alimentées (learnos + toutes)
const learnosNeverSeeded = [];
for (const m of models.values()) {
  if (!tables.has(m.table)) learnosNeverSeeded.push(`${m.name} (${m.table})`);
}

// ── 4. Report ─────────────────────────────────────────────────
console.log('='.repeat(78));
console.log('VOLUMÉTRIE PAR TABLE (SQL généré + statique)');
console.log('='.repeat(78));
const rowsByTable = [...tables.entries()].map(([k, v]) => ({ table: k, lignes: v.rows.length }))
  .sort((a, b) => a.table.localeCompare(b.table));
console.log(rowsByTable.filter(r => r.table.startsWith('learnos') || r.table.startsWith('_')).map(r => `  ${r.table.padEnd(46)} ${String(r.lignes).padStart(7)}`).join('\n'));

console.log('\n' + '='.repeat(78));
console.log(`PROBLÈMES DÉTECTÉS : ${problems.length}`);
console.log('='.repeat(78));
const byKind = new Map();
for (const p of problems) { const a = byKind.get(p.kind) || []; a.push(p); byKind.set(p.kind, a); }
for (const [kind, arr] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n### ${kind} (${arr.length})`);
  for (const p of arr) console.log(`  [${p.table}] ${p.msg}${p.sample ? `  ex: ${p.sample}` : ''}`);
}

console.log('\n' + '='.repeat(78));
console.log(`MODÈLES PRISMA JAMAIS ALIMENTÉS PAR LE SEED : ${learnosNeverSeeded.length}`);
console.log('='.repeat(78));
const lo = learnosNeverSeeded.filter(s => /learnos/.test(s));
console.log('\n-- LEARNOS --\n' + (lo.length ? lo.map(s => '  ' + s).join('\n') : '  (aucun)'));
const other = learnosNeverSeeded.filter(s => !/learnos/.test(s));
console.log(`\n-- AUTRES (${other.length}) --\n` + other.map(s => '  ' + s).join('\n'));

const errorCount = problems.filter(p => p.sev === 'ERROR').length;
if (errorCount > 0) {
  console.log(`\n${'='.repeat(78)}`);
  console.log(`ÉCHEC : ${errorCount} erreur(s) de niveau ERROR — le seed ne peut pas être chargé.`);
  console.log(`${'='.repeat(78)}`);
  process.exit(1);
}
