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
 * ÉTAT DE L'APPLICATION ET HISTORIQUE DE LA MESURE (29/09/2026)
 *
 *   Premier passage .................. 380 signalements, 162 fichiers
 *   Après correction des faux positifs ..  61 signalements,  38 fichiers
 *
 * Les 319 signalements disparus n'étaient PAS des oublis : c'étaient des
 * angles morts de la règle elle-même, révélés en la confrontant au code réel.
 * Chacun a été corrigé avec sa justification :
 *
 *   1. variables du dépôt (`filtreAnneeString`, `filtreAnneeViaClasse`…) —
 *      reconnues par leur NOM, comme la règle sœur le fait pour les sites ;
 *   2. `anneeLibelle ? { annee } : {}` — l'idiome officiel « année non
 *      définie » (cf. `scopedWhere`), qui exigeait à tort les deux branches ;
 *   3. `anneeCourante && { … }` — même idiome écrit avec `&&` ;
 *   4. `periodeId` / `periode` — une période appartient à UNE année
 *      (`Periode.anneeId`) : filtrer par trimestre est équivalent et plus
 *      précis. C'est ce qui blanchissait à tort `src/lib/pdf/bulletin-generator.ts`,
 *      le fichier qui produit les bulletins remis aux familles.
 *
 * Morale, et c'est le vrai enseignement de ce chantier : une règle de lint qui
 * signale du code correct ne protège rien — elle apprend à ignorer ses
 * avertissements. La moitié du travail a consisté à la rendre digne de foi.
 *
 * PREMIER LOT DE CORRECTIONS RÉELLES (src/app/api) — 61 → 54
 * Chaque cas a été relu, et le sort réservé à chacun est instructif :
 *
 *   • CORRIGÉ — `analytics/route.ts` : `classeFilter` ne portait que le
 *     périmètre de SITES ; le graphique « élèves par classe » additionnait donc
 *     les effectifs de toutes les promotions.
 *   • CORRIGÉ — `import/eleves/route.ts` (×2) : la classe était résolue par son
 *     NOM pour réutiliser la ligne existante. Sans filtre d'année, l'import
 *     s'accrochait à la classe homonyme d'une AUTRE année et inscrivait les
 *     élèves dans la promotion précédente.
 *   • DISABLE MOTIVÉ — `structures/route.ts` : le comptage de classes est un
 *     GARDE AVANT SUPPRESSION ; il doit voir TOUTES les années, sinon on
 *     supprime une structure encore référencée.
 *   • DISABLE MOTIVÉ — `notes/[id]/route.ts` (×2) et
 *     `eleves/cartes-scolaires/route.ts` : accès par IDENTIFIANT (une entité
 *     déjà datée, choisie par l'utilisateur).
 *
 * DEUXIÈME LOT — `src/lib/learnos` (LEARNOS) : 54 → 37
 *
 * Ce lot a d'abord servi à corriger la RÈGLE, trois fois, avant de toucher au
 * code. Les requêtes signalées étaient correctes :
 *
 *   • filtre FABRIQUÉ par une fonction de tableau :
 *       const scopesAnnuels = anneesParTenant.flatMap(({ tenantId, annee }) =>
 *         annee ? [{ tenantId, classe: { tenantId, annee } }] : []);
 *       prisma.devoir.findMany({ where: { OR: scopesAnnuels } })
 *     → la règle inspecte désormais les `return` des callbacks `.map/.flatMap/
 *       .filter/.concat/.reduce` ;
 *   • appel dont le NOM porte l'année (`borneAnneeCourante(tenantId)`) : reconnu
 *     comme les variables `filtreAnnee*` ;
 *   • `const bornes = await borneAnneeCourante(...)` : `resolveInit` renvoyait un
 *     `AwaitExpression`, que la règle ne déballait pas.
 *
 * Restaient des cas légitimes, chacun EXEMPTÉ AVEC MOTIF :
 *   • handlers d'événements (`absence-recorded`, `devoir-enretard`, `edt-cree`,
 *     `evaluation-completed`, `decalage-detecte`, `boucle-cahier-journal`) :
 *     l'entité est identifiée par le payload — l'année n'est pas le
 *     discriminant, et l'exiger rendrait le handler inopérant ;
 *   • requêtes bornées par une PLAGE DE DATES déjà dérivée de l'année
 *     (`edt-cree`, `climat-bien-etre`, `pattern-absence`) ;
 *   • `trajectoires-cohortes` : l'objet du module EST la comparaison de
 *     plusieurs années — filtrer sur l'année courante le viderait de son sens ;
 *   • `recommendation-engine` : borné par un `eleveId` autorisé en amont.
 *
 * TROISIÈME LOT — messagerie et routes API : 37 → 22
 *
 * Une CORRECTION RÉELLE, de la même famille que celle d'`api/analytics` :
 * `listTargetingOptions` (sélecteur d'audience de la messagerie) listait les
 * classes SANS filtre d'année. Or `Classe` porte une colonne `annee` sans
 * contrainte unique l'incluant : le sélecteur proposait donc « 6ème A » de
 * 2024-2025 à côté de celle de l'année en cours, et l'on pouvait diffuser un
 * message à une classe qui n'existe plus.
 *
 * Les autres cas sont EXEMPTÉS AVEC MOTIF, tous de la même nature :
 *   • accès par IDENTIFIANT — `changer-classe` (classe cible, classes
 *     d'origine, historique d'un élève), `orientation` (dossier d'un élève),
 *     `messaging-audience` (portée désignée par `scope.id`) ;
 *   • `messaging-audience` : `classeIds` sortent de `classeIdsForScope`, qui
 *     applique DÉJÀ le site et l'année active ;
 *   • `teacher-delays` : borné par `fenetreDebut = annee.dateDebut` ;
 *   • `conseil-augmente` : borné par les `eleveIds` de la période et une plage
 *     de dates.
 *
 * Trois de ces fichiers portaient déjà des exemptions `require-site-filter`
 * pour la même raison : l'exemption a été ÉTENDUE plutôt que dupliquée.
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

/**
 * Clés qui déterminent l'année PAR APPARTENANCE.
 *
 * `Periode.anneeId` est une contrainte du schéma : une période (un trimestre)
 * appartient à UNE seule année scolaire. Filtrer par période est donc
 * équivalent — et souvent plus précis — que filtrer par année : les bulletins
 * d'un trimestre ne peuvent pas appartenir à deux années.
 *
 * Relevé du 29/09/2026 : sans cette clé, les 6 requêtes de
 * `src/lib/pdf/bulletin-generator.ts` — les plus sensibles du dépôt, puisqu'elles
 * produisent les bulletins remis aux familles — étaient signalées alors que
 * chacune vérifie la période ET l'année en amont.
 */
const CLES_PERIODE = ["periodeId", "periode"];

/** Fonctions qui produisent un filtre d'année (src/lib/domain/scoped-where.ts). */
const FONCTIONS_ANNEE = new Set(["scopedWhere", "scopedWhereAnnee"]);

/** Noms de variables reconnus (déclaration hors du fichier analysé). */
const IDENTIFIANTS_ANNEE = new Set([
  ...FONCTIONS_ANNEE,
  "anneeFilter",
  "anneeWhere",
]);

/**
 * Un identifiant dont le NOM contient « annee » porte un filtre d'année.
 *
 * POURQUOI UN MOTIF ET NON UNE LISTE
 * Le dépôt nomme ces variables d'après leur rôle — relevé du 29/09/2026 :
 * `filtreAnneeString`, `filtreAnneeViaClasse`, `filtreAnneeViaEleveClasse`,
 * `filtreAnneeBulletin`, `filtreAnneeClasse`, `filtreAnneeEleve`,
 * `filtreAnneeEmploi`. Une liste fermée produirait un faux positif à chaque
 * nouveau nom, et l'exigence de précision finissait par être plus coûteuse que
 * le défaut signalé.
 *
 * Compromis ASSUMÉ : un nom trompeur (une variable nommée « annee… » qui ne
 * filtre rien) laisserait passer un vrai oubli. En échange, la règle cesse de
 * signaler du code correct — et une règle qui crie à tort finit désactivée,
 * ce qui coûte bien plus cher.
 */
const IDENTIFIANT_ANNEE_RE = /annee/i;

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

  // `await borneAnneeCourante(tenantId)` : l'initialisation d'une variable est
  // souvent une PROMESSE attendue, donc un `AwaitExpression` — pas directement
  // l'appel. Sans ce déballage, `const bornes = await borneAnneeCourante(...)`
  // n'était pas reconnu, et une requête correctement bornée par l'année était
  // signalée (cas relevé dans `src/lib/learnos/climat-bien-etre.ts`).
  if (node.type === "AwaitExpression") {
    return contientFiltreAnnee(node.argument, scope, depth + 1);
  }

  // Appel : scopedWhere(...), mergeFilters(…, scopedWhere(...)), helper local.
  if (node.type === "CallExpression") {
    if (estAppelFiltreAnnee(node, scope, depth)) return true;
    const callee = node.callee.name || (node.callee.property && node.callee.property.name);
    if (callee && IDENTIFIANTS_ANNEE.has(callee)) return true;
    if (callee && IDENTIFIANT_ANNEE_RE.test(callee)) return true;
  }

  // `cond ? filtreEnAnnee : {}`
  //
  // DIVERGENCE ASSUMÉE avec `require-site-filter`, qui exige que les DEUX
  // branches filtrent. Ici, la branche vide est l'idiome OFFICIEL du dépôt :
  //
  //   const filtreAnneeViaClasse = anneeLibelle ? { eleve: { classe: { annee: anneeLibelle } } } : {};
  //
  // et `scopedWhere` documente ce cas : « Sans année (début d'année non définie)
  // → pas de filtre d'année, mais tenantId toujours présent ». Exiger les deux
  // branches signalerait donc le motif le plus courant du dépôt — relevé du
  // 29/09/2026 : 11 occurrences dans `action-counts.ts` seul.
  // Le risque n'est pas le même que pour le site : une année non définie ne
  // fait pas fuiter de données d'un autre établissement.
  if (node.type === "ConditionalExpression") {
    // Cas 1 : le filtre est DANS une branche (`annee ? { annee } : {}`).
    if (
      contientFiltreAnnee(node.consequent, scope, depth + 1) ||
      contientFiltreAnnee(node.alternate, scope, depth + 1)
    ) {
      return true;
    }
    // Cas 2 : le filtre est la CONDITION elle-même, et les branches ne portent
    // que ses bornes :
    //
    //   const bornes = await borneAnneeCourante(tenantId);
    //   where: { ...(bornes ? { date: { gte: bornes.debut, lte: bornes.fin } } : {}) }
    //
    // Restriction volontaire : on n'accepte que si la condition se résout en un
    // APPEL dont le nom désigne l'année. Une simple variable nommée « annee… »
    // ne suffirait pas à garantir que les branches soient les bornes de cette
    // année — ce serait une heuristique trop large.
    const condition = node.test;
    const viaVariable =
      condition && condition.type === "Identifier" ? resolveInit(condition, scope) : condition;
    if (
      viaVariable &&
      viaVariable.type === "CallExpression" &&
      estAppelFiltreAnnee(viaVariable, scope, depth + 1)
    ) {
      return true;
    }
  }

  // `...(anneeCourante && { eleve: { classe: { annee: anneeCourante } } })`
  // Deuxième écriture du même idiome, très répandue (relevé du 29/09/2026 :
  // 4 occurrences dans `src/app/(dashboard)/parent/page.tsx` seul).
  //   • `&&` : la GAUCHE est la condition, jamais un `where` — seule la droite
  //     peut porter le filtre ;
  //   • `||` : n'importe laquelle des deux branches peut être retenue à
  //     l'exécution, donc les deux doivent filtrer (même exigence que la règle
  //     sœur sur les sites).
  if (node.type === "LogicalExpression") {
    return node.operator === "&&"
      ? contientFiltreAnnee(node.right, scope, depth + 1)
      : contientFiltreAnnee(node.left, scope, depth + 1) &&
          contientFiltreAnnee(node.right, scope, depth + 1);
  }

  // Variable : on suit son initialisation ; à défaut, on se fie à son nom.
  if (node.type === "Identifier") {
    if (IDENTIFIANTS_ANNEE.has(node.name)) return true;
    if (IDENTIFIANT_ANNEE_RE.test(node.name)) return true;
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

    // 1. La clé elle-même est un filtre d'année (directe ou par la période).
    if (CLES_ANNEE.includes(cle)) return true;
    if (CLES_PERIODE.includes(cle)) return true;

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
  // Un appel dont le NOM contient « annee » : `borneAnneeCourante(tenantId)`,
  // `anneeFilterForModel(...)`. Même compromis que pour les variables (voir
  // IDENTIFIANT_ANNEE_RE) — et même bénéfice : `climat-bien-etre.ts` bornait
  // ses requêtes par une plage de dates dérivée de l'année et était signalé.
  if (callee && IDENTIFIANT_ANNEE_RE.test(callee)) return true;
  if (IDENTIFIANTS_ANNEE.has(callee) && !resolveFunction(node.callee, scope)) return true;

  // `mergeFilters(a, b, …)` propage : un seul argument filtré suffit.
  if (callee === "mergeFilters" || callee === "scopedWhere") {
    return node.arguments.some((a) => contientFiltreAnnee(a, scope, depth + 1));
  }

  // Filtre CONSTRUIT par une fonction de tableau : `.map`, `.flatMap`,
  // `.filter`, `.concat`. Le filtre d'année n'est pas écrit dans le `where`,
  // il est FABRIQUÉ juste avant — motif fréquent pour les tâches qui balaient
  // plusieurs tenants :
  //
  //   const scopesAnnuels = anneesParTenant.flatMap(({ tenantId, annee }) =>
  //     annee ? [{ tenantId, classe: { tenantId, annee } }] : []
  //   );
  //   prisma.devoir.findMany({ where: { OR: scopesAnnuels } })
  //
  // Relevé du 29/09/2026 : sans cette inspection, `devoirs-retard-check.ts`
  // — la tâche qui détecte les devoirs non rendus — était signalée alors
  // qu'elle filtre bien par année, tenant par tenant.
  const CONSTRUCTEURS_TABLEAU = new Set(["map", "flatMap", "filter", "concat", "reduce"]);
  if (CONSTRUCTEURS_TABLEAU.has(callee)) {
    for (const argument of node.arguments) {
      if (!argument || typeof argument.type !== "string") continue;
      if (
        argument.type !== "ArrowFunctionExpression" &&
        argument.type !== "FunctionExpression"
      ) {
        continue;
      }
      const sorties = returnExpressions(argument);
      if (sorties.length > 0 && sorties.every((s) => contientFiltreAnnee(s, scope, depth + 1))) {
        return true;
      }
    }
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

