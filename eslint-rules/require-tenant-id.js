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

const TENANT_MODELS = [
  "eleve", "classe", "matiere", "note", "absence", "evaluation",
  "examen", "facture", "incident", "parent", "enseignant",
  "notification", "message", "conversation", "alumni", "inventaire",
  "candidature", "evenement", "salle", "site", "periode",
  "emploiTemps", "dispensabilite", "regleAppreciation", "dispense",
  "dispenseMatiere", "disponibiliteEnseignant", "anneesScolaires",
];

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Force tenantId dans les requêtes Prisma",
    },
    messages: {
      missingTenantId:
        "Requête Prisma sur {{model}} sans tenantId — risque de fuite de données entre tenants",
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

          if (!TENANT_MODELS.includes(model)) return;

          // Méthodes qui nécessitent un where avec tenantId
          const queryMethods = [
            "findMany", "findFirst", "findUnique",
            "update", "updateMany", "delete", "deleteMany",
            "count", "aggregate", "groupBy",
          ];
          if (!queryMethods.includes(method)) return;

          // Vérifier le premier argument (options avec where)
          const arg = node.arguments[0];
          if (!arg || arg.type !== "ObjectExpression") return;

          const whereProp = arg.properties.find(
            (p) => p.key && p.key.name === "where"
          );
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

          // Vérifier si tenantId est dans le where
          const whereValue = whereProp.value;
          if (whereValue.type === "ObjectExpression") {
            const hasTenantId = whereValue.properties.some(
              (p) => p.key && p.key.name === "tenantId"
            );
            if (!hasTenantId) {
              context.report({
                node,
                messageId: "missingTenantId",
                data: { model },
              });
            }
          }
        }
      },
    };
  },
};
