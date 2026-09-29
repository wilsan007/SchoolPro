/**
 * ESLint rule: force le filtre d'ANNÉE SCOLAIRE sur les requêtes Prisma
 * ====================================================================
 *
 * POURQUOI CETTE RÈGLE EXISTE
 * Règle non négociable n°2 (AGENTS.md) : « Aucune requête de données scoping
 * sans `anneeCourante` ». Son non-respect est la cause du bug d'août 2026, qui
 * a touché 42 fichiers : les données de toutes les années se mélangeaient dans
 * les mêmes écrans, sans erreur ni message.
 *
 * Cette règle transforme ce risque en signal VISIBLE au moment où le code est
 * écrit, plutôt qu'en incident découvert des mois plus tard.
 *
 * CE QU'EST UN « FILTRE D'ANNÉE » ICI
 *   1. une clé `annee`, `anneeId` ou `anneeScolaireId` DANS le `where` —
 *      y compris imbriquée dans une relation :
 *        prisma.devoir.findMany({ where: { tenantId, classe: { annee: "2025-2026" } } })
 *   2. un appel à `scopedWhere(...)` / `scopedWhereAnnee(...)`
 *      (`src/lib/domain/scoped-where.ts`), éventuellement via une variable.
 *   3. un helper local dont TOUTES les sorties portent le filtre (fail-closed :
 *      une seule branche nue suffirait à mélanger les années).
 *
 * La recherche est RÉCURSIVE à dessein : chez SchoolPro, `devoir`, `note` et
 * `evaluation` n'ont pas de champ `annee` — leur année vient de la classe ou de
 * la période. Un test qui ne regarderait que la clé de premier niveau
 * signalerait ces requêtes correctes, et la règle serait désactivée par
 * lassitude : c'est ainsi qu'un garde-fou meurt.
 *
 * MODÈLE EXEMPTÉ
 *   `parcoursScolaire` — l'historique de l'élève couvre PAR CONSTRUCTION
 *   plusieurs années ; le filtrer sur l'année courante le viderait de son sens.
 *
 * ÉTAT DE L'APPLICATION (mesuré le 29/09/2026 par la règle elle-même)
 * 380 appels de lecture sans filtre d'année. La règle est donc activée en
 * « warn » : elle guide la relecture sans bloquer le développement — les
 * corriger mécaniquement serait pire que la dette, chaque requête devant être
 * relue (lecture inter-années légitime, ou oubli réel).
 * Objectif : la passer en « error » quand `pnpm audit:annee` annonce 0.
 * Cette métrique est un RATCHET : `scripts/audit-annee-filter.mjs` échoue si
 * le nombre remonte, donc la dette ne peut que décroître.
 *
 * Règle 4 — exemption explicite et motivée :
 *   // eslint-disable-next-line ecolpro/require-annee-filter -- lecture
 *   inter-années assumée (comparaison N / N-1)
 */

"use strict";

// Doit rester aligné sur `modeleFiltrableParAnnee` (src/lib/domain/scoped-where.ts).
const MODELES_ANNEE = new Set([
  // année portée directement par le modèle
  "classe",
  "emploiTemps",
  // année portée par la classe
  "devoir",
  "evaluation",
  "note",
  "tache",
  "seancePedagogique",
  "affectationEnseignant",
  // année portée par l'élève (via sa classe)
  "absence",
  "incident",
  "passageInfirmerie",
  "recommandation",
  "historiqueClasse",
  // année portée par la période
  "bulletin",
  "bulletinMatiere",
]);

/** Historique inter-années légitime (voir l'en-tête). */
const MODELES_EXEMPTS = new Set(["parcoursScolaire"]);

const METHODES_LECTURE = new Set([
  "findMany", "findFirst", "findUnique", "count", "groupBy", "aggregate",
]);

/** Clés de `where` qui portent un filtre d'année. */
const CLES_ANNEE = ["annee", "anneeId", "anneeScolaireId", "anneeCible"];

/** Fonctions qui produisent un filtre d'année (src/lib/domain/scoped-where.ts). */
const FONCTIONS_ANNEE = new Set(["scopedWhere", "scopedWhereAnnee"]);

/** Noms de variables reconnus (déclaration hors du fichier analysé). */
const IDENTIFIANTS_ANNEE = new Set([
  ...FONCTIONS_ANNEE,
  "anneeFilter",
  "anneeWhere",
]);

const PROFONDEUR_MAX = 8;

/** Remonte à la valeur d'initialisation d'une variable locale. */
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

/** Résout un identifiant vers la fonction locale qu'il désigne, si elle existe. */
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

/**
 * Un objet `where` porte-t-il un filtre d'année ?
 * Recherche RÉCURSIVE : `{ classe: { annee } }`, `{ AND: [{ annee }] }`,
 * `{ periode: { anneeId } }` comptent tous.
 */
function contientFiltreAnnee(node, scope, depth = 0) {
  if (!node || depth > PROFONDEUR_MAX) return false;

  // `{ … } as Prisma.XWhereInput`
  if (node.type === "TSAsExpression" || node.type === "TSTypeAssertion") {
    return contientFiltreAnnee(node.expression, scope, depth + 1);
  }

  // Appel : scopedWhere(...), mergeFilters(…, scopedWhere(...)), helper local.
  if (node.type === "CallExpression") {
    if (estAppelFiltreAnnee(node, scope, depth)) return true;
    const callee = node.callee.name || (node.callee.property && node.callee.property.name);
    if (IDENTIFIANTS_ANNEE.has(callee)) return true;
  }

  // `cond ? filtreA : filtreB` — les DEUX branches doivent filtrer.
  if (node.type === "ConditionalExpression") {
    return (
      contientFiltreAnnee(node.consequent, scope, depth + 1) &&
      contientFiltreAnnee(node.alternate, scope, depth + 1)
    );
  }

  // Variable : on suit son initialisation.
  if (node.type === "Identifier") {
    if (IDENTIFIANTS_ANNEE.has(node.name)) return true;
    const init = resolveInit(node, scope);
    return init ? contientFiltreAnnee(init, scope, depth + 1) : false;
  }

  if (node.type !== "ObjectExpression") return false;

  for (const prop of node.properties) {
    // `...anneeFilter` / `...scopedWhere(...)`
    if (prop.type === "SpreadElement") {
      if (contientFiltreAnnee(prop.argument, scope, depth + 1)) return true;
      continue;
    }
    if (!prop.key) continue;

    const cle = prop.key.name || prop.key.value;

    // 1. La clé elle-même est un filtre d'année.
    if (CLES_ANNEE.includes(cle)) return true;

    // 2. Filtre imbriqué dans une relation (`classe: { annee }`) ou un `AND`.
    if (prop.value && typeof prop.value.type === "string") {
      if (contientFiltreAnnee(prop.value, scope, depth + 1)) return true;
    }
  }

  return false;
}

/** Un appel produit-il un filtre d'année ? */
function estAppelFiltreAnnee(node, scope, depth = 0) {
  if (!node || node.type !== "CallExpression" || depth > PROFONDEUR_MAX) return false;
  const callee = node.callee.name || (node.callee.property && node.callee.property.name);

  if (FONCTIONS_ANNEE.has(callee)) return true;
  if (IDENTIFIANTS_ANNEE.has(callee) && !resolveFunction(node.callee, scope)) return true;

  // `mergeFilters(a, b, …)` propage : un seul argument filtré suffit.
  if (callee === "mergeFilters" || callee === "scopedWhere") {
    return node.arguments.some((a) => contientFiltreAnnee(a, scope, depth + 1));
  }

  // Helper local : toutes ses sorties doivent porter le filtre (fail-closed).
  const fn = resolveFunction(node.callee, scope);
  if (fn) {
    const sorties = returnExpressions(fn);
    if (sorties.length > 0) {
      return sorties.every((s) => contientFiltreAnnee(s, scope, depth + 1));
    }
  }

  return false;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Force le filtrage par année scolaire sur les requêtes Prisma (règle non négociable n°2)",
    },
    messages: {
      missingAnneeFilter:
        "Requête Prisma sur « {{model}} » sans filtre d'année scolaire — ajoutez `annee` (ou `anneeId`) dans le where, ou passez par scopedWhere/scopedWhereAnnee (src/lib/domain/scoped-where.ts).",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.object.type !== "MemberExpression"
        ) {
          return;
        }

        const racine = node.callee.object.object;
        const modele = node.callee.object.property.name;
        const methode = node.callee.property.name;

        // `scoped.eleve.findMany(...)` : le Proxy injecte le filtre.
        if (racine.type === "Identifier" && racine.name === "scoped") return;
        if (racine.type !== "Identifier" || racine.name !== "prisma") return;

        if (!METHODES_LECTURE.has(methode)) return;
        if (MODELES_EXEMPTS.has(modele)) return;
        if (!MODELES_ANNEE.has(modele)) return;

        const scope = context.sourceCode.getScope(node);
        const arg = node.arguments[0];

        if (!arg || arg.type !== "ObjectExpression") {
          context.report({ node, messageId: "missingAnneeFilter", data: { model: modele } });
          return;
        }

        const where = arg.properties.find(
          (p) => p.key && (p.key.name === "where" || p.key.value === "where")
        );

        if (!where) {
          context.report({ node, messageId: "missingAnneeFilter", data: { model: modele } });
          return;
        }

        if (!contientFiltreAnnee(where.value, scope)) {
          context.report({ node, messageId: "missingAnneeFilter", data: { model: modele } });
        }
      },
    };
  },
};

