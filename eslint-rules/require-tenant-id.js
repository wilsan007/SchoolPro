/**
 * ESLint rule: force tenantId sur les requêtes Prisma
 *
 * @fileoverview Empêche les requêtes Prisma sans tenantId dans le where clause.
 * Détecte: prisma.eleve.findMany({ where: { ... } }) sans tenantId
 *
 * @example .eslintrc.js
 * rules: { "ecolpro/require-tenant-id": "error" }
 */

"use strict";

/**
 * Modèles portant un champ `tenantId`, lus dans schema.prisma.
 *
 * La liste était auparavant écrite à la main et avait dérivé : elle exigeait
 * un `tenantId` sur `message`, qui n'a pas ce champ (l'isolation y passe par
 * la conversation), et nommait quatre modèles inexistants. Voir
 * `prisma-schema.js`.
 */
const { TENANT_SCOPED_MODELS, SCHEMA_MISSING } = require("./prisma-schema");

/** Méthodes de lecture : le `where` accepte n'importe quel filtre. */
const READ_METHODS = ["findMany", "findFirst", "count", "aggregate", "groupBy"];
/** Écritures en masse : le `where` accepte aussi n'importe quel filtre. */
const BULK_WRITE_METHODS = ["updateMany", "deleteMany"];
/**
 * Opérations exigeant un sélecteur *unique*. Prisma y refuse `tenantId` s'il
 * ne fait pas partie d'un index unique — la protection passe donc par une
 * lecture d'appartenance préalable, pas par le `where` de l'écriture.
 */
const UNIQUE_SELECTOR_METHODS = ["update", "delete", "findUnique"];

/**
 * `tenantId` est-il présent dans ce `where` ?
 *
 * Renvoie `true` dès que la clause n'est pas un objet littéral analysable
 * (`mergeFilters(...)`, `...unWhere`) : le filtre est alors composé ailleurs
 * et la règle ne peut pas conclure. Mieux vaut se taire que produire une
 * alerte fausse sur du code correct.
 */
function whereHasTenantId(whereValue) {
  if (!whereValue) return false;
  if (whereValue.type !== "ObjectExpression") return true;

  for (const p of whereValue.properties) {
    if (p.type === "SpreadElement") return true;
    if (!p.key) continue;
    const key = p.key.name || p.key.value;
    if (key === "tenantId") return true;
    // Le filtre de tenant est parfois encapsulé : where: { AND: [{ tenantId }] }
    if (key === "AND" && p.value.type === "ArrayExpression") {
      if (p.value.elements.some((el) => whereHasTenantId(el))) return true;
    }
  }
  return false;
}

/** Remonte à la fonction englobante (corps de la route, de l'action…). */
function enclosingFunction(ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const t = ancestors[i].type;
    if (
      t === "FunctionDeclaration" ||
      t === "FunctionExpression" ||
      t === "ArrowFunctionExpression"
    ) {
      return ancestors[i];
    }
  }
  return null;
}

/**
 * La fonction contient-elle une lecture de `model` bornée par `tenantId` ?
 * C'est le contrôle d'appartenance qui précède les écritures par identifiant :
 *
 *   const existing = await prisma.examen.findFirst({ where: { id, tenantId } });
 *   if (!existing) return 404;
 *   await prisma.examen.update({ where: { id }, data });
 */
function hasOwnershipCheck(fnNode, model) {
  let found = false;

  const visit = (node) => {
    if (found || !node || typeof node.type !== "string") return;

    if (
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      node.callee.object.type === "MemberExpression" &&
      node.callee.object.object.type === "Identifier" &&
      node.callee.object.object.name === "prisma" &&
      node.callee.object.property.name === model &&
      READ_METHODS.includes(node.callee.property.name)
    ) {
      const arg = node.arguments[0];
      if (arg && arg.type === "ObjectExpression") {
        const where = arg.properties.find((p) => p.key && p.key.name === "where");
        if (where && whereHasTenantId(where.value)) {
          found = true;
          return;
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child.type === "string") visit(child);
    }
  };

  visit(fnNode.body);
  return found;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Force tenantId dans les requêtes Prisma",
    },
    messages: {
      missingTenantId:
        "Requête Prisma sur {{model}} sans tenantId — risque de fuite de données entre tenants",
      missingOwnershipCheck:
        "Écriture sur {{model}} par identifiant sans contrôle d'appartenance — précédez-la d'un prisma.{{model}}.findFirst({ where: { id, tenantId } })",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        // Détecter: prisma.<model>.<method>({ where: { ... } })
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "MemberExpression" &&
          node.callee.object.object.type === "Identifier" &&
          node.callee.object.object.name === "prisma"
        ) {
          const model = node.callee.object.property.name;
          const method = node.callee.property.name;

          // Schéma illisible : on se tait plutôt que de statuer à l'aveugle.
          if (SCHEMA_MISSING) return;
          if (!TENANT_SCOPED_MODELS.has(model)) return;

          const isUniqueSelector = UNIQUE_SELECTOR_METHODS.includes(method);
          const filtrable =
            READ_METHODS.includes(method) || BULK_WRITE_METHODS.includes(method);
          if (!filtrable && !isUniqueSelector) return;

          // Vérifier le premier argument (options avec where)
          const arg = node.arguments[0];
          if (!arg || arg.type !== "ObjectExpression") return;

          const whereProp = arg.properties.find(
            (p) => p.key && p.key.name === "where"
          );

          // `update`, `delete`, `findUnique` : Prisma n'accepte ici que des
          // champs uniques, `tenantId` n'y est pas exprimable. On exige à la
          // place le contrôle d'appartenance qui doit les précéder.
          if (isUniqueSelector) {
            if (whereProp && whereHasTenantId(whereProp.value)) return;
            const fn = enclosingFunction(context.getAncestors());
            if (fn && hasOwnershipCheck(fn, model)) return;
            context.report({
              node,
              messageId: "missingOwnershipCheck",
              data: { model },
            });
            return;
          }

          if (!whereProp) {
            // Pas de where du tout — findMany sans where = danger
            if (method === "findMany" || method === "count") {
              context.report({
                node,
                messageId: "missingTenantId",
                data: { model },
              });
            }
            return;
          }

          if (!whereHasTenantId(whereProp.value)) {
            context.report({
              node,
              messageId: "missingTenantId",
              data: { model },
            });
          }
        }
      },
    };
  },
};
