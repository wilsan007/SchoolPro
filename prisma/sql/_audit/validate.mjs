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
import bcrypt from 'bcryptjs';

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

// ── 3 bis. Hash bcrypt des comptes ─────────────────────────────
// Un hash syntaxiquement valide mais qui ne vérifie AUCUN mot de passe passe
// tous les autres contrôles : le chargement réussit, les comptes existent,
// `isActive` est vrai — et pourtant plus personne ne peut se connecter, avec
// pour seul symptôme « Identifiants invalides ». C'est exactement ce qui
// s'était produit (digest de coût 10 recollé derrière un préfixe `$2a$12$`).
// On vérifie donc que chaque hash distinct correspond bien au mot de passe
// de démonstration documenté.
const MOT_DE_PASSE_DEMO = 'Ambouli@2026!';
const usersTable = tables.get('users');
if (usersTable) {
  const hashes = new Map(); // hash -> nombre de lignes
  for (const r of usersTable.rows) {
    const v = r['password'];
    if (!v || v.kind === 'null') continue;
    const h = String(v.value);
    hashes.set(h, (hashes.get(h) || 0) + 1);
  }
  for (const [h, n] of hashes) {
    if (!/^\$2[aby]\$\d{2}\$[A-Za-z0-9./]{53}$/.test(h)) {
      add('ERROR', 'users', 'HASH_MALFORME', `${n} ligne(s) avec un hash bcrypt malformé`, h.slice(0, 20) + '…');
      continue;
    }
    if (!bcrypt.compareSync(MOT_DE_PASSE_DEMO, h)) {
      add('ERROR', 'users', 'HASH_INVALIDE',
        `${n} ligne(s) portent un hash qui ne vérifie pas le mot de passe "${MOT_DE_PASSE_DEMO}" — ces comptes seraient impossibles à connecter`,
        h.slice(0, 20) + '…');
    }
  }
}

// ══════════════════════════════════════════════════════════════
// CONTRÔLES SÉMANTIQUES
// ══════════════════════════════════════════════════════════════
// POURQUOI ILS EXISTENT
// Ce validateur annonçait « 0 problème » sur un jeu qui comportait 7 137 rangs
// de bulletin faux, 85 % des lignes de matière en désaccord avec les notes, et
// des scores de maîtrise à 20 sur une échelle 0–1 — parce qu'il ne vérifiait
// que des volumes, des clés étrangères et des types. Les contrôles ci-dessous
// portent sur le SENS des valeurs : c'est le seul niveau auquel ces défauts
// étaient visibles.

/** Valeurs numériques d'une colonne, NULL exclus. */
function nombres(table, col) {
  const t = tables.get(table);
  if (!t) return [];
  const out = [];
  for (const r of t.rows) {
    const v = r[col];
    if (v && v.kind === 'num' && Number.isFinite(v.value)) out.push(v.value);
  }
  return out;
}

// ── 3a. Colonnes bornées à l'intervalle [0 ; 1] ─────────────────
// Le défaut d'origine : la compilation des preuves lisait `maxScore`
// (constamment 20) au lieu du signal de maîtrise. Tout ce qui en dérivait
// sortait de l'échelle sans qu'aucun contrôle ne s'en aperçoive.
const COLONNES_0_1 = [
  ['learnos_learning_evidences', ['masterySignal', 'confidence']],
  ['learnos_student_learning_profiles', ['masteryScore', 'confidenceScore']],
  ['learnos_predictions', ['probaReussite', 'masteryAvant', 'confidenceAvant', 'masteryApres', 'ecart']],
  ['learnos_patterns_pedago', ['masteryMoyenne', 'confidenceMoyenne', 'ecartType', 'tauxEchec']],
  ['learnos_calibration_seuils', ['seuilCritique', 'seuilFragile', 'seuilConsolide', 'seuilAvance', 'confianceMinimale']],
  ['learnos_seuils_recommandation', ['seuilCritique', 'seuilFragile', 'seuilConsolide', 'seuilAvance', 'confianceMinimale']],
  ['learnos_plans_progression', ['masteryAvant', 'masteryApres']],
  ['learnos_student_interventions', ['masteryBefore', 'masteryAfter']],
];
for (const [table, cols] of COLONNES_0_1) {
  for (const col of cols) {
    const vals = nombres(table, col);
    const hors = vals.filter(v => v < 0 || v > 1);
    if (hors.length) {
      add('ERROR', table, 'ECHELLE_0_1',
        `${hors.length} valeur(s) de "${col}" hors de l'intervalle [0 ; 1] — indice d'une confusion d'échelle (note sur 20 lue comme un score de maîtrise)`,
        `max observé ${Math.max(...hors)}`);
    }
  }
}

// ── 3b. Ordre des seuils de maîtrise ────────────────────────────
// Des seuils mélangeant deux échelles (19,8 / 19,95 / 0,85 / 0,95) rangeaient
// tous les élèves dans la même bande : le classement n'ordonnait plus rien.
for (const table of ['learnos_calibration_seuils', 'learnos_seuils_recommandation']) {
  const t = tables.get(table);
  if (!t) continue;
  let desordre = 0, exemple = null;
  for (const r of t.rows) {
    const s = ['seuilCritique', 'seuilFragile', 'seuilConsolide', 'seuilAvance']
      .map(c => (r[c] && r[c].kind === 'num') ? r[c].value : null);
    if (s.some(v => v === null)) continue;
    if (!(s[0] < s[1] && s[1] < s[2] && s[2] < s[3])) {
      desordre++;
      exemple = exemple || s.join(' / ');
    }
  }
  if (desordre) {
    add('ERROR', table, 'SEUILS_DESORDONNES',
      `${desordre} ligne(s) où les seuils ne sont pas strictement croissants (critique < fragile < consolidé < avancé)`,
      exemple);
  }
}

// ── 3c. Cohérence des prédictions ───────────────────────────────
// `predictionCorrecte` doit être la conséquence de `ecart`, pas une valeur
// indépendante : c'est ce découplage qui laissait passer 3 % de justesse.
const SEUIL_JUSTESSE = 0.15;
const predTable = tables.get('learnos_predictions');
if (predTable) {
  let incoherentes = 0, verifiees = 0, justes = 0, exemple = null;
  for (const r of predTable.rows) {
    const ecart = r['ecart'], correcte = r['predictionCorrecte'];
    if (!ecart || ecart.kind !== 'num' || !correcte || correcte.kind !== 'bool') continue;
    verifiees++;
    if (correcte.value) justes++;
    const attendu = ecart.value < SEUIL_JUSTESSE;
    if (attendu !== correcte.value) {
      incoherentes++;
      exemple = exemple || `ecart ${ecart.value} → ${correcte.value}`;
    }
  }
  if (incoherentes) {
    add('ERROR', 'learnos_predictions', 'JUSTESSE_INCOHERENTE',
      `${incoherentes} prédiction(s) où predictionCorrecte ne découle pas de ecart < ${SEUIL_JUSTESSE}`, exemple);
  }
  // Un taux de justesse effondré n'est pas une erreur de structure, mais il
  // trahit presque toujours un défaut de calcul en amont — et il s'affiche tel
  // quel sur l'écran « Intelligence pédagogique ».
  if (verifiees >= 20) {
    const taux = justes / verifiees;
    if (taux < 0.4) {
      add('ERROR', 'learnos_predictions', 'JUSTESSE_ABERRANTE',
        `Taux de justesse de ${(taux * 100).toFixed(1)} % sur ${verifiees} prédictions vérifiées — invraisemblable pour un modèle calibré`,
        `${justes}/${verifiees}`);
    } else if (taux > 0.95) {
      add('WARN', 'learnos_predictions', 'JUSTESSE_SUSPECTE',
        `Taux de justesse de ${(taux * 100).toFixed(1)} % — trop parfait pour être crédible devant un acheteur`,
        `${justes}/${verifiees}`);
    }
  }
}

// ── 3d. Diversité de la difficulté prédite ──────────────────────
// 322 prédictions sur 326 en « FACILE » : le panneau n'ordonnait plus rien.
if (predTable) {
  const dist = new Map();
  for (const r of predTable.rows) {
    const v = r['difficultePredite'];
    if (!v || v.kind === 'null') continue;
    dist.set(v.value, (dist.get(v.value) || 0) + 1);
  }
  const total = [...dist.values()].reduce((a, b) => a + b, 0);
  if (total >= 50) {
    const [dominante, n] = [...dist.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n / total > 0.85) {
      add('ERROR', 'learnos_predictions', 'DIFFICULTE_ECRASEE',
        `${((n / total) * 100).toFixed(0)} % des prédictions portent la même difficulté ("${dominante}") — la répartition n'informe plus`,
        [...dist.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
    }
  }
}

// ── 3e. Bulletins : rang, moyenne, effectif ─────────────────────
const bullTable = tables.get('bulletins');
if (bullTable) {
  let rangHorsEffectif = 0, moyHorsBareme = 0, exemple = null;
  for (const r of bullTable.rows) {
    const rang = r['rang'], eff = r['effectifClasse'], moy = r['moyenneGenerale'];
    if (rang && rang.kind === 'num' && eff && eff.kind === 'num' && (rang.value < 1 || rang.value > eff.value)) {
      rangHorsEffectif++;
      exemple = exemple || `rang ${rang.value} sur ${eff.value}`;
    }
    if (moy && moy.kind === 'num' && (moy.value < 0 || moy.value > 20)) moyHorsBareme++;
  }
  if (rangHorsEffectif) {
    add('ERROR', 'bulletins', 'RANG_HORS_EFFECTIF',
      `${rangHorsEffectif} bulletin(s) avec un rang hors de l'effectif de la classe`, exemple);
  }
  if (moyHorsBareme) {
    add('ERROR', 'bulletins', 'MOYENNE_HORS_BAREME',
      `${moyHorsBareme} bulletin(s) avec une moyenne générale hors de l'intervalle [0 ; 20]`);
  }
}

// ── 3f. Bulletins : colonnes structurantes jamais renseignées ───
// `moyenneClasse`, `moyennePremier`, l'appréciation et le nom du professeur
// étaient NULL sur 100 % des lignes : le bulletin imprimé affichait « — »
// partout où le lecteur attend une comparaison.
const COLONNES_ATTENDUES = [
  ['bulletins', ['moyenneClasse', 'moyennePremier', 'appreciation']],
  ['bulletin_matieres', ['moyenneEleve', 'moyenneMax', 'moyenneMin', 'appreciation', 'nomProfesseur']],
];
for (const [table, cols] of COLONNES_ATTENDUES) {
  const t = tables.get(table);
  if (!t || t.rows.length < 20) continue;
  for (const col of cols) {
    if (!t.cols.has(col)) continue;
    const remplies = t.rows.filter(r => r[col] && r[col].kind !== 'null').length;
    if (remplies === 0) {
      add('ERROR', table, 'COLONNE_TOUJOURS_NULLE',
        `"${col}" est NULL sur les ${t.rows.length} lignes — la colonne est affichée dans le bulletin et resterait vide`);
    }
  }
}

// ── 3g. Coefficients du bulletin alignés sur le référentiel ─────
const matieresTable = tables.get('matieres');
const bmTable = tables.get('bulletin_matieres');
if (matieresTable && bmTable) {
  const coefRef = new Map();
  for (const r of matieresTable.rows) {
    const id = r['id'], coef = r['coefficient'];
    if (id && coef && coef.kind === 'num') coefRef.set(String(id.value), coef.value);
  }
  let faux = 0, exemple = null;
  for (const r of bmTable.rows) {
    const mid = r['matiereId'], coef = r['coefficient'];
    if (!mid || !coef || coef.kind !== 'num') continue;
    const attendu = coefRef.get(String(mid.value));
    if (attendu !== undefined && attendu !== coef.value) {
      faux++;
      exemple = exemple || `${mid.value} : ${coef.value} au lieu de ${attendu}`;
    }
  }
  if (faux) {
    add('ERROR', 'bulletin_matieres', 'COEFFICIENT_DIVERGENT',
      `${faux} ligne(s) dont le coefficient diffère de celui de la matière`, exemple);
  }
}

// ── 3h. Emploi du temps : conflits et spécialité ────────────────
const edtTable = tables.get('emplois_temps');
const ensTable = tables.get('enseignants');
if (edtTable) {
  const vuProf = new Set(), vuSalle = new Set(), vuClasse = new Set();
  let cProf = 0, cSalle = 0, cClasse = 0;
  for (const r of edtTable.rows) {
    const k = (...cs) => cs.map(c => (r[c] ? String(r[c].value) : '')).join('|');
    const kp = k('annee', 'jour', 'heureDebut', 'enseignantId');
    const ks = k('annee', 'jour', 'heureDebut', 'salle');
    const kc = k('annee', 'jour', 'heureDebut', 'classeId');
    if (r['enseignantId'] && r['enseignantId'].kind !== 'null') { if (vuProf.has(kp)) cProf++; else vuProf.add(kp); }
    if (r['salle'] && r['salle'].kind !== 'null') { if (vuSalle.has(ks)) cSalle++; else vuSalle.add(ks); }
    if (vuClasse.has(kc)) cClasse++; else vuClasse.add(kc);
  }
  if (cProf) add('ERROR', 'emplois_temps', 'CONFLIT_ENSEIGNANT', `${cProf} créneau(x) placent un enseignant sur deux classes à la même heure`);
  if (cClasse) add('ERROR', 'emplois_temps', 'CONFLIT_CLASSE', `${cClasse} créneau(x) placent une classe sur deux cours à la même heure`);
  if (cSalle) add('ERROR', 'emplois_temps', 'CONFLIT_SALLE', `${cSalle} créneau(x) placent deux classes dans la même salle`);

  // Spécialité de l'enseignant : 92 % des créneaux affichaient un professeur
  // hors de sa matière — un professeur de physique-chimie en cours d'anglais.
  if (ensTable && matieresTable) {
    const specialite = new Map();
    for (const r of ensTable.rows) {
      if (r['id'] && r['specialite'] && r['specialite'].kind !== 'null') specialite.set(String(r['id'].value), String(r['specialite'].value));
    }
    const codeMatiere = new Map();
    for (const r of matieresTable.rows) {
      if (r['id'] && r['code']) codeMatiere.set(String(r['id'].value), String(r['code'].value));
    }
    let hors = 0, total = 0, exemple = null;
    for (const r of edtTable.rows) {
      const eid = r['enseignantId'], mid = r['matiereId'];
      if (!eid || eid.kind === 'null' || !mid) continue;
      const sp = specialite.get(String(eid.value));
      const code = codeMatiere.get(String(mid.value));
      if (!sp || !code) continue;
      total++;
      if (sp !== code) { hors++; exemple = exemple || `spécialité ${sp} sur un cours de ${code}`; }
    }
    if (total >= 20 && hors / total > 0.1) {
      add('ERROR', 'emplois_temps', 'ENSEIGNANT_HORS_SPECIALITE',
        `${((hors / total) * 100).toFixed(0)} % des créneaux (${hors}/${total}) affichent un enseignant hors de sa spécialité`, exemple);
    }
  }

  // Une matière enseignée à toute l'école à la même heure trahit un emploi du
  // temps généré sans contrainte : 26 créneaux réunissaient 40 classes.
  const parCreneauMatiere = new Map();
  for (const r of edtTable.rows) {
    const k = ['annee', 'jour', 'heureDebut', 'matiereId'].map(c => (r[c] ? String(r[c].value) : '')).join('|');
    parCreneauMatiere.set(k, (parCreneauMatiere.get(k) || 0) + 1);
  }
  const massifs = [...parCreneauMatiere.values()].filter(n => n > 12).length;
  if (massifs) {
    add('WARN', 'emplois_temps', 'MATIERE_SIMULTANEE_MASSIVE',
      `${massifs} créneau(x) placent plus de 12 classes sur la même matière à la même heure`,
      `max ${Math.max(...parCreneauMatiere.values())} classes`);
  }
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
