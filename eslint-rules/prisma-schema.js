/**
 * Lecture de `prisma/schema.prisma` pour les règles ecolpro.
 *
 * POURQUOI
 * --------
 * Les deux règles décidaient à partir de listes de modèles écrites à la main.
 * Ces listes avaient dérivé du schéma : `require-tenant-id` réclamait un
 * `tenantId` sur `message` — un modèle qui n'a pas ce champ — et citait quatre
 * modèles inexistants (`inventaire`, `dispensabilite`, `regleAppreciation`,
 * `dispense`). Une règle de sécurité qui exige l'impossible finit ignorée.
 *
 * Le schéma est la source de vérité : on l'y lit une fois, au chargement.
 */

"use strict";

const fs = require("fs");
const path = require("path");

/** Nom de modèle Prisma → accesseur du client (`Eleve` → `eleve`). */
const toAccessor = (name) => name.charAt(0).toLowerCase() + name.slice(1);

function findSchema() {
  for (let dir = __dirname; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "prisma", "schema.prisma");
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, "utf8");
    if (dir === path.dirname(dir)) return null;
  }
}

const schema = findSchema();

/** Modèles bruts : nom PascalCase → Map<champ, {model, isList}>. */
const rawModels = new Map();
if (schema) {
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const fields = new Map();
    for (const line of m[2].split("\n")) {
      const f = line.trim().match(/^(\w+)\s+(\w+)(\[\])?/);
      if (f) fields.set(f[1], { model: f[2], isList: !!f[3] });
    }
    rawModels.set(m[1], fields);
  }
}

/**
 * Relations par accesseur : `classe` → { eleves: { model: "eleve", isList: true } }.
 * Seules les relations vers un autre modèle sont retenues (pas les scalaires).
 * @type {Map<string, Map<string, {model: string, isList: boolean}>>}
 */
const RELATIONS = new Map();
for (const [model, fields] of rawModels) {
  const resolved = new Map();
  for (const [fname, f] of fields) {
    if (rawModels.has(f.model)) {
      resolved.set(fname, { model: toAccessor(f.model), isList: f.isList });
    }
  }
  RELATIONS.set(toAccessor(model), resolved);
}

/**
 * Modèles portant réellement un champ `tenantId` — les seuls sur lesquels on
 * puisse exiger un filtre de tenant.
 * @type {Set<string>}
 */
const TENANT_SCOPED_MODELS = new Set();
for (const [model, fields] of rawModels) {
  if (fields.has("tenantId")) TENANT_SCOPED_MODELS.add(toAccessor(model));
}

/** Vrai si le schéma n'a pas pu être lu : les règles se taisent alors. */
const SCHEMA_MISSING = !schema;

module.exports = { RELATIONS, TENANT_SCOPED_MODELS, SCHEMA_MISSING };
