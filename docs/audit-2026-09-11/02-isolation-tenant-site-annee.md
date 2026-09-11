# Étape 2 — Isolation multi-tenant, par site et par année

**Score actuel : 7,0 / 10** (brut 7,2 — plafonné à 7,0 par des constats hauts)
**Score cible : 9,7** · **Effort estimé : 8 à 10 jours-développeur**

---

## 1. Périmètre

| Élément | Fichier |
|---|---|
| Périmètre de site (source unique) | `src/lib/site-scope.ts` (841 lignes), `src/lib/site-filter.ts` |
| Règles ESLint maison | `eslint-rules/require-tenant-id.js`, `eslint-rules/require-site-filter.js`, `.eslintrc.json` |
| RLS PostgreSQL | `scripts/rls/generate-policies.cjs`, `prisma/rls_setup.sql`, `prisma/baseline/rls-enable-all.sql` |
| Contexte RLS applicatif | `src/lib/prisma-rls.ts`, `src/lib/rls-session.ts`, `src/lib/rls-context.ts` |
| Tests d'isolation | `src/lib/site-scope*.test.ts`, `tests/rls/isolation.test.ts`, `vitest.rls.config.ts` |
| Garde-fou de base cible | `scripts/guard-target-db.cjs`, `.project-identity.json`, `GARDE-FOUS.md` |

## 2. Ce qui est solide

- **Fermé par défaut, réellement.** `resolveSiteScope` renvoie `NONE` (donc `DENY_ALL`) pour un membre du personnel sans site (`site-scope.ts:130-138`), et `siteFilterForModel` renvoie `DENY_ALL` pour un modèle inconnu (`:579-583`). Un test vérifie que chaque modèle Prisma a un chemin de site déclaré (`site-scope.model.test.ts`).
- **Site sélectionné revérifié** contre les sites autorisés (`:141-146`) : un jeton manipulé ou périmé ne peut pas choisir un site hors de son rattachement.
- **Politiques RLS générées depuis le schéma**, avec un contrôle `pnpm rls:check` qui échoue si une table n'est pas couverte, et un **labo PostgreSQL fidèle à la production** (rôles `ecolpro_app` / `ecolpro_owner`, `FORCE ROW LEVEL SECURITY`) sur lequel `tests/rls/isolation.test.ts` prouve l'étanchéité.
- **Garde-fou de base cible** fondé sur l'empreinte du schéma, et pas seulement sur l'hôte (`GARDE-FOUS.md`) : il résiste au tunnel SSH oublié.
- **Deux règles ESLint maison** (`require-tenant-id`, `require-site-filter`) en erreur sur `src/lib`, `src/app/api` et `src/app/(dashboard)`.

La conception est de très bon niveau. Les constats portent sur **l'écart entre cette conception et ce qui s'exécute réellement**.

## 3. Constats

### ISO-H1 — Haute — La RLS n'est pas active en production

**Preuve.** `.env.production.example:161` et `.env.example:153` : `RLS_MODE=off`. Dans ce mode, `withRlsExtension` renvoie le client Prisma tel quel (`src/lib/prisma-rls.ts:70`). Toute l'isolation repose donc sur les `where` écrits à la main dans environ 300 fichiers. La défense en profondeur promise par `docs/` et par la CI n'existe pas à l'exécution.

**Pourquoi c'est bloquant pour basculer.** En mode `enforce` :
- les **9 tâches du cron** (`src/app/api/cron/dispatch/route.ts`), le drainage LEARNOS, les webhooks et les scripts n'ont pas de session. Ils lèveraient une exception, car aucun n'utilise `withSystemContext` (0 appel dans `src/`, hors définition) ;
- les **23 transactions interactives** (`prisma.$transaction(async (tx) => …)`) ne reçoivent pas le contexte. Seul `applyRlsContext` le poserait, et il n'est appelé nulle part.

### ISO-H2 — Haute — Pour les familles, le filtre de site est « ouvert » par construction

**Preuve.** Pour PARENT et STUDENT, `resolveSiteScope` renvoie `{ kind: "RELATION" }`, et `siteFilterForModel` renvoie alors `{}` (`site-scope.ts:588-590`). Le commentaire l'assume : *« c'est le lien personnel qui tranche, et il est vérifié séparément par l'appelant »*. Toute route qui oublie `personalScopeFilter` expose donc **l'établissement entier** aux familles. C'est l'inverse de la règle n°6 d'`AGENTS.md` (fermé par défaut).

**Conséquence observée.** Voir API-C2 (étape 3) : `POST /api/eleves/changer-classe` permet à un compte PARENT de déplacer n'importe quel élève du tenant.

### ISO-H3 — Haute — Les règles ESLint ne voient pas les transactions

**Preuve.** `eslint-rules/require-tenant-id.js:90-95` et `:138-141` ne détectent que les appels dont l'objet racine est l'identifiant `prisma`. `tx.historiqueClasse.updateMany({ where: { eleveId: { in: eleveIds } } })` (`src/app/api/eleves/changer-classe/route.ts`, dans le `$transaction`) passe donc le lint **sans `tenantId`**, sur des identifiants fournis par le client. Il en va de même de tout alias (`db`, `client`, `getPrismaBackground()`).

**Impact.** Écriture inter-tenant possible sur `historique_classes` : clôture de l'historique d'élèves d'un autre établissement, et création de lignes d'historique rattachées au tenant de l'appelant pour des élèves étrangers.

### ISO-M1 — Moyenne — Les exemptions de lint dérivent

`grep -rn "eslint-disable" src` compte **392** occurrences, contre 185 annoncées dans `docs/learnos-etat.md` et 131 au départ du chantier. Parmi elles, **87** exemptions `require-site-filter` et **33** `require-tenant-id` n'ont pas de justification après `--`. La règle du document (« tout ajout porte sa raison ») n'est contrôlée par aucun outil.

### ISO-M2 — Moyenne — La règle n°2 (filtre par année) n'est vérifiée par rien

`AGENTS.md` en fait une règle non négociable, née d'un bug qui a touché 42 fichiers. Aucune règle ESLint ni aucun test ne la contrôle. L'extension `demo-horizon` borne les **dates**, pas l'**année scolaire**. Mesure indicative : 102 routes sur 266 mentionnent une année. Il n'existe aucune liste des modèles « annualisés » qui l'exigent.

### ISO-M3 — Moyenne — Aucune PR n'a jamais exécuté les preuves d'isolation

Le workflow `.github/workflows/security.yml` (RLS en labo, `rls:check`) n'existe que sur la branche `feat/rls-isolation-et-infra`. GitHub répond `workflow security.yml not found on the default branch`. Il n'a donc **jamais tourné**. Détails à l'étape 9.

## 4. Angles morts

1. **Aucun test « matrice rôle × modèle »** qui, pour chaque rôle, appelle chaque route de lecture et vérifie qu'aucune ligne d'un autre tenant, d'un autre site ou d'une autre famille n'est renvoyée. `tests/rls/isolation.test.ts` prouve la base, pas l'application.
2. **Relations imbriquées** : les `include` Prisma n'héritent pas du filtre de premier niveau (limite documentée dans `demo-horizon.ts`). Aucun outil ne liste les `include` sans `where`.
3. **Modèles sans `tenantId`** (30 sur 124, dont `Paiement`, `Message`, `Sanction`, `EleveParent`, `EcheancePaiement`) : leur isolation passe par une jointure. Les politiques RLS en tiennent compte, mais une requête applicative directe (`prisma.paiement.findMany({ where: { factureId } })`) n'est protégée que si `factureId` a été vérifié en amont.
4. **Exports et fichiers** : les exports Excel/PDF et les fichiers téléversés (photos, pièces d'inscription) ne sont pas couverts par la RLS. Leur isolation n'est testée nulle part.

## 5. Notation détaillée

| Axe (poids) | Actuel | Justification | Cible |
|---|---:|---|---:|
| Sécurité et isolation (25 %) | 6 | Excellente conception ; RLS éteinte, filtre familles ouvert, lint aveugle aux transactions | 10 |
| Exactitude (25 %) | 8 | `site-scope` correct et testé | 9,5 |
| Robustesse (15 %) | 7 | Mode `enforce` inutilisable en l'état | 9,5 |
| Tests (15 %) | 8 | Tests unitaires, intégration, labo RLS ; aucune matrice applicative | 9,5 |
| Traçabilité (10 %) | 6 | Mode `warn` prévu mais jamais activé | 9,5 |
| Maintenabilité (10 %) | 8 | Source unique, commentaires exemplaires ; dérive des exemptions | 9,5 |
| **Brut** | **7,2** | | |
| **Plafond** | **7,0** | Constats hauts ouverts | |

---

## 6. Cahier des charges

### ISO-1 — Fermer le filtre « RELATION » par défaut *(P0, 2 j)*

**Objectif.** Pour PARENT et STUDENT, `siteFilterForModel` ne doit plus jamais renvoyer `{}`.

**Étapes.**
1. Dans `src/lib/site-scope.ts`, case `"RELATION"` de `siteFilterForModel` : renvoyer `DENY_ALL` **sauf** si le modèle figure dans une nouvelle table `RELATION_PATHS: Record<string, (claims) => Where>`, qui décrit le lien personnel. Exemples : `eleve` → `{ parents: { some: { parent: { userId: claims.id } } } }` pour PARENT et `{ userId: claims.id }` pour STUDENT ; `note`, `absence`, `bulletin` et `facture` → `{ eleve: <même filtre> }`.
2. Faire migrer `personalScopeFilter` vers cette table : une seule source.
3. Étendre `site-scope.model.test.ts` : tout modèle lisible par une famille (liste tirée de `permissions.ts`) doit avoir une entrée dans `RELATION_PATHS`. Pour les autres, vérifier que `siteFilterForModel(modèle, parent)` renvoie `DENY_ALL`.
4. Passer en revue les appelants actuels de `personalScopeFilter` : le filtre étant désormais appliqué par `siteFilterForModel`, supprimer les doublons, **sans** retirer un filtre avant d'avoir vérifié que le nouveau le couvre.

**Tests.** Pour chaque modèle de `RELATION_PATHS` : un parent de l'élève A ne voit ni l'élève B du même site, ni celui d'un autre site. Un élève ne voit que lui-même. Un modèle hors table donne un résultat vide.

**Critère.** Sans aucune correction de route, `POST /api/eleves/changer-classe` appelé par un PARENT ne modifie plus aucun élève (le `updateMany` filtré ne trouve rien). La correction de rôle d'API-C2 reste nécessaire en plus.

### ISO-2 — Rendre les règles ESLint sensibles aux transactions et aux alias *(P0, 1,5 j)*

1. Dans `require-tenant-id.js` et `require-site-filter.js`, remplacer le test `object.name === "prisma"` par : l'identifiant racine vaut `prisma`, `tx`, `db` ou `client`, **ou** il est un paramètre de la fonction passée à `*.$transaction(...)`. Le second cas se détecte en remontant l'arbre syntaxique jusqu'au `CallExpression` dont la propriété vaut `$transaction`.
2. Ajouter les tests de la règle (`eslint-rules/__tests__/…` avec `RuleTester`) : `tx.eleve.updateMany({ where: { id } })` doit produire une erreur, tandis que `tx.eleve.updateMany({ where: { id, tenantId } })` est accepté.
3. Lancer `pnpm lint`, puis corriger **chaque** nouvelle erreur : soit ajouter le filtre, soit poser une exemption **justifiée**. La première cible est `changer-classe` (ajouter `tenantId` au `historiqueClasse.updateMany` et vérifier que chaque `eleveId` appartient au tenant avant `createMany`).

### ISO-3 — Justification obligatoire des exemptions *(P1, 0,5 j + revue)*

1. Ajouter à `.eslintrc.json` la règle `eslint-comments/require-description` (paquet `eslint-plugin-eslint-comments`), limitée aux règles `ecolpro/*`.
2. Créer un test `scripts/count-eslint-disable.mjs --max <N>` qui échoue si le total augmente. Fixer `N` à la valeur courante, puis la faire baisser à chaque lot.
3. Traiter les 120 exemptions muettes (87 site, 33 tenant). Pour chacune : ajouter le filtre, ou écrire la raison. Faire un lot par dossier (`api/orientation`, `api/bulletins`, `api/mobile`…), chaque lot relu par une seconde personne.

### ISO-4 — Préparer puis activer la RLS *(P1, 4 j, en trois paliers)*

**Palier 1 — rendre le mode `enforce` possible.**
1. Envelopper chaque tâche de `TACHES` (`cron/dispatch`), `dispatch-scheduled`, `purge-*`, les webhooks et `drainEvents` dans `withSystemContext("<nom de la tâche>", async () => …)`. Pour les traitements par tenant, utiliser `withRlsContext({ tenantId: t.id, siteId: null, siteIds: [], superAdmin: false }, …)` à l'intérieur de la boucle.
2. Ajouter `await applyRlsContext(tx)` en **première instruction** des 23 transactions interactives (liste obtenue par `grep -rnF '$transaction(async' src`). Une règle ESLint simple (première instruction d'un callback `$transaction` = `applyRlsContext`) empêche l'oubli à l'avenir.

**Palier 2 — `RLS_MODE=warn` en préproduction pendant 7 jours.** Collecter les avertissements `[rls] … exécuté sans session ni contexte` (voir INF-3 pour la journalisation structurée) et corriger jusqu'à obtenir **zéro** avertissement sur 72 h d'usage réel (démonstration Ambouli + scénarios E2E).

**Palier 3 — `RLS_MODE=enforce` en production**, avec retour arrière documenté (`fly secrets set RLS_MODE=warn`). Vérifier au préalable que l'utilisateur de connexion de production **n'est pas** propriétaire des tables et n'a pas `BYPASSRLS`. Le script `docker/scripts/security-audit-db.sh` le contrôle déjà sur le VPS ; sur Supabase, vérifier le rôle de `DATABASE_URL`.

**Critère.** Les tests `tests/rls/*` et une nouvelle suite E2E, lancée avec `RLS_MODE=enforce` contre le labo, passent au vert.

### ISO-5 — Matrice d'isolation applicative *(P1, 2 j)*

Créer `tests/rls/matrice-routes.test.ts` (sur le labo) :
1. Jeu de données : 2 tenants, 2 sites par tenant, 2 familles par site.
2. Pour chaque route GET listée dans l'annexe A et pour chaque rôle (TENANT_ADMIN avec et sans site sélectionné, TEACHER, SECRETARY, ACCOUNTANT, PARENT, STUDENT) : appeler le handler avec une session simulée, puis vérifier que chaque identifiant renvoyé appartient au périmètre attendu (même tenant, site autorisé, enfant du parent).
3. Faire de même pour les routes `[id]` avec l'identifiant d'un autre tenant ou d'une autre famille : attendre 403 ou 404, jamais 200.

### ISO-6 — Contrôle automatique de la règle « année courante » *(P2, 1,5 j)*

1. Déclarer dans `src/lib/annee-scope.ts` la liste `MODELES_ANNUALISES` (`note`, `evaluation`, `absence`, `devoir`, `emploiTemps`, `seancePedagogique`, `bulletin`, `facture`…), en la validant avec le métier.
2. Créer une règle ESLint `ecolpro/require-annee-filter` : un `findMany` ou `count` sur ces modèles doit contenir `annee`, `anneeId` ou `periode`, ou porter une exemption justifiée.
3. Corriger les violations, ou les justifier une par une.

## 7. Définition de « terminé »

- [ ] ISO-1 à ISO-5 livrés ; `RLS_MODE=enforce` en production depuis 14 jours sans incident.
- [ ] 0 exemption de lint muette ; le compteur baisse d'un sprint à l'autre.
- [ ] Workflow « Sécurité » exécuté et vert sur `main` (voir étape 9).
- [ ] Matrice d'isolation applicative au vert en CI.
