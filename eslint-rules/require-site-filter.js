/**
 * ESLint rule: force le filtre de site sur les requêtes Prisma
 *
 * @fileoverview
 * Détecte les requêtes Prisma qui manquent de filtrage par site.
 *
 * Règle 1 — Modèle racine sans filtre :
 *   prisma.eleve.findMany({ where: { tenantId } })
 *   → ERREUR si aucun siteFilterForModel / siteFilterFromSession / siteFilterForRelation
 *     n'est étalé dans le where.
 *
 * Règle 2 — include sans filtre de site :
 *   prisma.classe.findMany({ include: { eleves: true } })
 *   → ERREUR : la relation "eleves" doit avoir un where avec filtre de site.
 *
 * Règle 3 — prismaSiteScoped exempt :
 *   scoped.eleve.findMany({ where: {} })
 *   → OK : le Proxy injecte automatiquement le filtre.
 *
 * @example .eslintrc.js
 * rules: { "ecolpro/require-site-filter": "error" }
 */

"use strict";

// Modèles qui nécessitent un filtre de site (tout sauf "tenant" dans SITE_PATHS)
const SITE_SCOPED_MODELS = new Set([
  "eleve", "classe", "matiere", "note", "absence", "evaluation",
  "examen", "facture", "incident", "parent", "enseignant",
  "notification", "alumni", "candidature", "evenement", "salle",
  "cours", "itemInventaire", "emploiTemps", "dispenseMatiere",
  "disponibiliteEnseignant", "structure", "enseignantSite",
  "userSite", "user", "eleveParent", "parcoursScolaire",
  "progressionEleve", "paiement", "sessionExamen", "ficheRH",
  "sanction", "bulletinMatiere", "contenuCours",
  "absencePersonnel", "congePersonnel", "bulletinPaie",
  "bulletin",
]);

// Modèles tenant-wide (pas de filtre de site requis)
const TENANT_WIDE_MODELS = new Set([
  "periode", "anneesScolaires", "reglesAppreciation", "document",
  "tenant", "site", "userTenant", "deviceToken", "conversation",
  "conversationParticipant", "message", "account", "session",
  "verificationToken",
]);

// Méthodes de lecture qui nécessitent un filtre
const READ_METHODS = new Set([
  "findMany", "findFirst", "findUnique", "count", "groupBy", "aggregate",
]);

// Identifiers qui satisfont le filtre de site
const SITE_FILTER_IDENTIFIERS = new Set([
  "siteFilterForModel",
  "siteFilterFromSession",
  "siteFilterForRelation",
  "siteFilter",
  "siteWhere",
  "eleveScopeFilter",
  "classeScopeFilter",
  "personalScopeFilter",
]);

function hasSiteFilterInObject(objNode) {
  if (!objNode) return false;

  // Unwrap TSAsExpression: { ... } as Prisma.XWhereInput
  if (objNode.type === "TSAsExpression") {
    return hasSiteFilterInObject(objNode.expression);
  }

  // Direct call: where: siteFilterForModel(...) or where: siteFilterFromSession(...)
  if (objNode.type === "CallExpression") {
    const calleeName = objNode.callee.name || (objNode.callee.property && objNode.callee.property.name);
    if (SITE_FILTER_IDENTIFIERS.has(calleeName)) return true;
  }

  if (objNode.type !== "ObjectExpression") return false;

  for (const prop of objNode.properties) {
    // SpreadElement: ...siteFilter ou ...siteFilterForModel(...)
    // Must be checked before the !prop.key guard, since SpreadElement has no key.
    if (prop.type === "SpreadElement") {
      const spreadArg = prop.argument;
      if (spreadArg.type === "Identifier" && SITE_FILTER_IDENTIFIERS.has(spreadArg.name)) {
        return true;
      }
      if (spreadArg.type === "CallExpression") {
        const calleeName = spreadArg.callee.name || (spreadArg.callee.property && spreadArg.callee.property.name);
        if (SITE_FILTER_IDENTIFIERS.has(calleeName)) {
          return true;
        }
      }
    }

    if (!prop.key) continue;

    const keyName = prop.key.name || prop.key.value;

    // AND encapsule souvent le filtre de site
    if (keyName === "AND" && prop.value.type === "ArrayExpression") {
      for (const element of prop.value.elements) {
        if (hasSiteFilterInObject(element)) return true;
      }
    }

    // Direct identifier: siteFilter: siteFilterForModel(...)
    if (prop.value && prop.value.type === "CallExpression") {
      const calleeName = prop.value.callee.name || (prop.value.callee.property && prop.value.callee.property.name);
      if (SITE_FILTER_IDENTIFIERS.has(calleeName)) {
        return true;
      }
    }
  }

  return false;
}

function checkIncludesForSiteFilter(includeNode, context, parentModel) {
  if (!includeNode) return;

  // include: true — pas de filtre possible, mais c'est une relation simple
  if (includeNode.type === "BooleanLiteral") return;

  if (includeNode.type !== "ObjectExpression") return;

  for (const prop of includeNode.properties) {
    if (!prop.key) continue;
    const relationName = prop.key.name || prop.key.value;

    // Skip non-relation keys like orderBy, take, skip
    if (["orderBy", "take", "skip", "cursor", "distinct"].includes(relationName)) continue;

    if (prop.value.type === "BooleanLiteral") {
      // include: { eleves: true } — pas de filtre
      // On signale seulement pour les modèles site-scoped connus
      if (SITE_SCOPED_MODELS.has(relationName)) {
        context.report({
          node: prop,
          messageId: "missingIncludeFilter",
          data: { relation: relationName, parentModel },
        });
      }
      continue;
    }

    if (prop.value.type === "ObjectExpression") {
      // Vérifier si la relation a un where avec filtre de site
      const whereProp = prop.value.properties.find(
        (p) => p.key && (p.key.name === "where" || p.key.value === "where")
      );

      if (!whereProp && SITE_SCOPED_MODELS.has(relationName)) {
        context.report({
          node: prop,
          messageId: "missingIncludeFilter",
          data: { relation: relationName, parentModel },
        });
        continue;
      }

      if (whereProp && !hasSiteFilterInObject(whereProp.value) && SITE_SCOPED_MODELS.has(relationName)) {
        context.report({
          node: prop,
          messageId: "missingIncludeFilter",
          data: { relation: relationName, parentModel },
        });
      }

      // Récursion: vérifier les include imbriqués
      const nestedInclude = prop.value.properties.find(
        (p) => p.key && (p.key.name === "include" || p.key.value === "include")
      );
      if (nestedInclude) {
        checkIncludesForSiteFilter(nestedInclude.value, context, relationName);
      }
    }
  }
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Force le filtrage par site sur les requêtes Prisma et les include",
    },
    messages: {
      missingSiteFilter:
        "Requête Prisma sur {{model}} sans filtre de site — utilisez siteFilterForModel(\"{{model}}\", session.user) ou prismaSiteScoped()",
      missingIncludeFilter:
        "include '{{relation}}' sans filtre de site dans {{parentModel}} — ajoutez where: siteFilterForModel(\"{{relation}}\", session.user)",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        // Détecter: prisma.<model>.<method>(...)
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "MemberExpression"
        ) {
          const model = node.callee.object.property.name;
          const method = node.callee.property.name;

          // Vérifier si c'est le client prisma ou un client scoped
          const rootObj = node.callee.object.object;
          const isPrisma = rootObj.type === "Identifier" && rootObj.name === "prisma";
          const isScoped = rootObj.type === "Identifier" && rootObj.name === "scoped";

          // prismaSiteScoped() injecte automatiquement le filtre → pas d'erreur
          if (isScoped) return;

          if (!isPrisma) return;
          if (!READ_METHODS.has(method)) return;
          if (TENANT_WIDE_MODELS.has(model)) return;
          if (!SITE_SCOPED_MODELS.has(model)) return;

          const arg = node.arguments[0];
          if (!arg || arg.type !== "ObjectExpression") {
            // findMany sans argument = pas de filtre du tout
            if (method === "findMany" || method === "count") {
              context.report({
                node,
                messageId: "missingSiteFilter",
                data: { model },
              });
            }
            return;
          }

          const whereProp = arg.properties.find(
            (p) => p.key && (p.key.name === "where" || p.key.value === "where")
          );

          if (!whereProp) {
            context.report({
              node,
              messageId: "missingSiteFilter",
              data: { model },
            });
            return;
          }

          if (!hasSiteFilterInObject(whereProp.value)) {
            context.report({
              node,
              messageId: "missingSiteFilter",
              data: { model },
            });
          }

          // Vérifier les include pour les relations sans filtre
          const includeProp = arg.properties.find(
            (p) => p.key && (p.key.name === "include" || p.key.value === "include")
          );
          if (includeProp) {
            checkIncludesForSiteFilter(includeProp.value, context, model);
          }
        }
      },
    };
  },
};
