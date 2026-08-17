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
  // LEARNOS (docs/learnos-integration-plan.md)
  "chapitre", "competence", "learningEvidence",
  "studentLearningProfile", "studentIntervention", "aiDecisionLog",
  "learnosEvent", "evaluationCompetence",
  "seuilsRecommandation", "recommandation",
  "planProgression", "etapePlan", "planificationChapitre",
  "kpiSnapshot",
  // Budget & dépenses (portent siteId)
  "budget", "depense",
  // Plans de leçon & grilles d'évaluation IA (portent siteId)
  "planLecon", "rubriqueEvaluation",
]);

// Modèles tenant-wide (pas de filtre de site requis)
const TENANT_WIDE_MODELS = new Set([
  "periode", "anneesScolaires", "reglesAppreciation", "document",
  "tenant", "site", "userTenant", "deviceToken", "conversation",
  "conversationParticipant", "message", "account", "session",
  "verificationToken",
  "aiCache",
]);

// Méthodes de lecture qui nécessitent un filtre
const READ_METHODS = new Set([
  "findMany", "findFirst", "findUnique", "count", "groupBy", "aggregate",
]);

// Fonctions qui produisent un filtre de site.
const SITE_FILTER_FUNCTIONS = new Set([
  "siteFilterForModel",
  "siteFilterFromSession",
  "siteFilterForRelation",
]);

// Noms de variables historiquement reconnus tels quels, conservés pour les
// cas où la déclaration est hors du fichier analysé (import, paramètre).
const SITE_FILTER_IDENTIFIERS = new Set([
  ...SITE_FILTER_FUNCTIONS,
  "siteFilter",
  "siteWhere",
  "eleveScopeFilter",
  "classeScopeFilter",
  "personalScopeFilter",
]);

/**
 * Remonte à la valeur d'initialisation d'une variable locale.
 *
 * POURQUOI
 * --------
 * La règle ne reconnaissait le filtre que si la variable portait l'un des
 * noms ci-dessus. Or les filtres sont nommés d'après leur modèle dans tout le
 * code — `notifFilter`, `absenceWhere`, `baseWhere`… :
 *
 *   const notifFilter = siteFilterForModel("notification", session.user);
 *   prisma.notification.findMany({ where: { tenantId, ...notifFilter } });
 *
 * Ce code est correct et était pourtant signalé. On résout donc la variable
 * jusqu'à son initialisation, au lieu de spéculer sur son nom.
 */
function resolveInit(node, scope) {
  if (!scope || !node || node.type !== "Identifier") return null;
  for (let s = scope; s; s = s.upper) {
    const variable = s.set && s.set.get(node.name);
    if (!variable) continue;
    for (const def of variable.defs) {
      if (def.node && def.node.type === "VariableDeclarator" && def.node.init) {
        return def.node.init;
      }
    }
    return null;
  }
  return null;
}

function isSiteFilterCall(node, scope, depth = 0) {
  if (!node || node.type !== "CallExpression" || depth > 6) return false;
  const callee = node.callee.name || (node.callee.property && node.callee.property.name);

  if (SITE_FILTER_FUNCTIONS.has(callee)) return true;

  // `mergeFilters(a, b, …)` propage : il suffit qu'un argument porte le
  // filtre. Les arguments sont souvent des variables (`siteFilter`, `extra`),
  // d'où la résolution complète plutôt qu'un simple test sur l'appel.
  if (callee === "mergeFilters") {
    return node.arguments.some((a) => hasSiteFilterInObject(a, scope, depth + 1));
  }

  // Helper local (`recipientBaseFilter(...)`) : on l'accepte seulement si
  // *toutes* ses sorties portent le filtre — une seule branche non filtrée
  // suffirait à faire fuiter, et la règle doit rester fail-closed.
  const fn = resolveFunction(node.callee, scope);
  if (fn) {
    const sorties = returnExpressions(fn);
    if (sorties.length > 0) {
      return sorties.every((s) => hasSiteFilterInObject(s, scope, depth + 1));
    }
  }
  return false;
}

/** Résout un identifiant vers la fonction qu'il désigne, si elle est locale. */
function resolveFunction(node, scope) {
  if (!scope || !node || node.type !== "Identifier") return null;
  for (let s = scope; s; s = s.upper) {
    const variable = s.set && s.set.get(node.name);
    if (!variable) continue;
    for (const def of variable.defs) {
      const d = def.node;
      if (!d) continue;
      if (d.type === "FunctionDeclaration") return d;
      if (
        d.type === "VariableDeclarator" &&
        d.init &&
        (d.init.type === "ArrowFunctionExpression" || d.init.type === "FunctionExpression")
      ) {
        return d.init;
      }
    }
    return null;
  }
  return null;
}

/** Expressions renvoyées par une fonction (corps concis ou `return`). */
function returnExpressions(fn) {
  if (!fn.body) return [];
  if (fn.body.type !== "BlockStatement") return [fn.body];

  const sorties = [];
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    // Ne pas descendre dans une fonction imbriquée : ses `return` sont à elle.
    if (
      node !== fn &&
      (node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression")
    ) {
      return;
    }
    if (node.type === "ReturnStatement" && node.argument) sorties.push(node.argument);
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child.type === "string") visit(child);
    }
  };
  visit(fn.body);
  return sorties;
}

function hasSiteFilterInObject(objNode, scope, depth = 0) {
  if (!objNode || depth > 6) return false;

  // Unwrap TSAsExpression: { ... } as Prisma.XWhereInput
  if (objNode.type === "TSAsExpression") {
    return hasSiteFilterInObject(objNode.expression, scope, depth + 1);
  }

  // Direct call: where: siteFilterForModel(...) ou where: mergeFilters(..., siteFilterForModel(...))
  if (objNode.type === "CallExpression") {
    if (isSiteFilterCall(objNode, scope, depth)) return true;
    const calleeName = objNode.callee.name || (objNode.callee.property && objNode.callee.property.name);
    if (SITE_FILTER_IDENTIFIERS.has(calleeName)) return true;
  }

  // where: cond ? base : mergeFilters(base, …) — motif courant quand la
  // portée module le filtre. Fail-closed : toutes les branches doivent porter
  // le filtre, une seule branche nue suffirait à faire fuiter.
  if (objNode.type === "ConditionalExpression") {
    return (
      hasSiteFilterInObject(objNode.consequent, scope, depth + 1) &&
      hasSiteFilterInObject(objNode.alternate, scope, depth + 1)
    );
  }

  // where: absenceWhere — on suit la variable jusqu'à sa définition.
  if (objNode.type === "Identifier") {
    if (SITE_FILTER_IDENTIFIERS.has(objNode.name)) return true;
    const init = resolveInit(objNode, scope);
    return init ? hasSiteFilterInObject(init, scope, depth + 1) : false;
  }

  if (objNode.type !== "ObjectExpression") return false;

  for (const prop of objNode.properties) {
    // SpreadElement: ...siteFilter ou ...siteFilterForModel(...)
    // Must be checked before the !prop.key guard, since SpreadElement has no key.
    if (prop.type === "SpreadElement") {
      if (hasSiteFilterInObject(prop.argument, scope, depth + 1)) return true;
      continue;
    }

    if (!prop.key) continue;

    const keyName = prop.key.name || prop.key.value;

    // AND encapsule souvent le filtre de site
    if (keyName === "AND" && prop.value.type === "ArrayExpression") {
      for (const element of prop.value.elements) {
        if (hasSiteFilterInObject(element, scope, depth + 1)) return true;
      }
    }

    // Direct identifier: siteFilter: siteFilterForModel(...)
    if (prop.value && prop.value.type === "CallExpression" && isSiteFilterCall(prop.value, scope, depth)) {
      return true;
    }
  }

  return false;
}

/**
 * Relations déclarées dans schema.prisma, lues une seule fois.
 *
 * POURQUOI
 * --------
 * La règle décidait auparavant à partir du *nom du champ* d'include : elle
 * signalait `include: { eleve: true }` parce que « eleve » figure dans
 * SITE_SCOPED_MODELS. Or `note.eleve` est une relation to-one, et Prisma
 * n'accepte pas de `where` dessus :
 *
 *   prisma.note.findMany({ include: { eleve: { where: {...} } } })
 *   → TS2353 'where' does not exist in type 'EleveDefaultArgs'
 *
 * La règle exigeait donc du code qui ne compile pas — 70 des 72 signalements
 * sur les include étaient dans ce cas. On ne peut filtrer que les relations
 * to-many ; pour une to-one, c'est le `where` racine qui porte l'isolation.
 *
 * Le nom du champ ne donne pas non plus le modèle cible (`parents` pointe sur
 * EleveParent) : on résout la cible via le schéma.
 *
 * Le schéma est lu par `prisma-schema.js`, partagé avec `require-tenant-id`.
 */
const { RELATIONS } = require("./prisma-schema");

function checkIncludesForSiteFilter(includeNode, context, parentModel, scope) {
  if (!includeNode) return;

  // include: true — pas de filtre possible, mais c'est une relation simple
  if (includeNode.type === "BooleanLiteral") return;

  if (includeNode.type !== "ObjectExpression") return;

  const parentRelations = RELATIONS.get(parentModel);

  for (const prop of includeNode.properties) {
    if (!prop.key) continue;
    const relationName = prop.key.name || prop.key.value;

    // Skip non-relation keys like orderBy, take, skip
    if (["orderBy", "take", "skip", "cursor", "distinct"].includes(relationName)) continue;

    const relation = parentRelations && parentRelations.get(relationName);

    // Relation inconnue du schéma, ou to-one : dans les deux cas il n'y a rien
    // à exiger. Une relation to-one n'admet pas de `where` en Prisma ; son
    // isolation vient du `where` racine de la requête.
    const filtrable = !!relation && relation.isList && SITE_SCOPED_MODELS.has(relation.model);

    if (prop.value.type === "BooleanLiteral") {
      // include: { eleves: true } — relation to-many sans aucun filtre
      if (filtrable) {
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

      if (filtrable && (!whereProp || !hasSiteFilterInObject(whereProp.value, scope))) {
        context.report({
          node: prop,
          messageId: "missingIncludeFilter",
          data: { relation: relationName, parentModel },
        });
      }

      // Récursion: vérifier les include imbriqués, sous le modèle réellement
      // ciblé par la relation (et non son nom de champ).
      const nestedInclude = prop.value.properties.find(
        (p) => p.key && (p.key.name === "include" || p.key.value === "include")
      );
      if (nestedInclude && relation) {
        checkIncludesForSiteFilter(nestedInclude.value, context, relation.model, scope);
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

          // Portée du site d'appel : sert à remonter aux variables de filtre
          // (`const notifFilter = siteFilterForModel(...)`).
          const scope = context.sourceCode
            ? context.sourceCode.getScope(node)
            : context.getScope();

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

          if (!hasSiteFilterInObject(whereProp.value, scope)) {
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
            checkIncludesForSiteFilter(includeProp.value, context, model, scope);
          }
        }
      },
    };
  },
};
