# Étape 9 — Tests, intégration continue, discipline de livraison

**Score actuel : 6,2 / 10** (brut 6,2 — sous le plafond de 7,0 imposé par TST-H1 et TST-H2)
**Score cible : 9,7** · **Effort estimé : 5 à 7 jours-développeur**

---

## 1. Mesures réelles du 11/09/2026 (commit `4976316`, worktree propre)

| Contrôle | Commande | Résultat |
|---|---|---|
| Types | `tsc --noEmit` | **0 erreur** |
| Lint | `next lint` | **0 erreur**, 1 avertissement (`MobileLayout.tsx:192`, dépendances de `useMemo`) |
| Tests unitaires | `vitest run` | **1 806 réussis sur 1 807**, en 13 s. Le seul échec (`site-scope.model.test.ts`) vient du client Prisma partagé, régénéré depuis le schéma **non commité** de l'arbre de travail : il est absent sur HEAD pur. |
| Arbre de travail (non commité) | `tsc --noEmit` | **10 erreurs** : `facture.ts` (6), `facturation/page.tsx` (1), `handlers/evaluation-completed.ts` (3) |
| E2E | 18 specs Playwright | non exécutées ici (serveur et base de démonstration requis) |
| Isolation | `tests/rls/isolation.test.ts` | non exécuté ici (labo Docker requis) |

## 2. Ce qui est solide

- **Suite unitaire dense et rapide** : 117 fichiers, 1 826 tests dans l'arbre de travail, exécution en moins de 20 s.
- **Tests de conventions** : complétude des traductions des erreurs d'API, couverture de `SITE_PATHS` par modèle, matrice RBAC (`rbac-integration.test.ts`, `matrix-audit.test.ts`).
- **Labo d'isolation fidèle à la production** pour prouver la RLS (rôles non propriétaires, `FORCE RLS`).
- **Script `verify` complet** (lint, tsc, vitest, `prisma validate`, `pnpm audit`) et hook de pré-commit documenté.
- **Actions GitHub épinglées par empreinte** (pentest M-09 corrigé), Dependabot configuré.

## 3. Constats

### TST-H1 — Haute — La CI ne protège aucune livraison

- Dernière exécution de « CI — Test & Build » : **17/08/2026**. Les **6 dernières exécutions ont échoué** (`gh run list`).
- Le workflow « Sécurité » (`security.yml` : RLS en labo, gitleaks, Trivy, CodeQL) **n'existe pas sur `main`**. GitHub répond `workflow security.yml not found on the default branch` : il n'a **jamais tourné**.
- La branche courante (`feat/rls-isolation-et-infra`) porte **56 commits non fusionnés** dans `main`, sans aucune pull request. Les workflows ne se déclenchent que sur `push` vers `main` et sur `pull_request` vers `main`.
- Le build Docker **désactive la vérification de types** (`Dockerfile` : `ENV SKIP_TYPECHECK="true"`, honoré par `next.config.ts:18`) et renvoie au hook de pré-commit. Or l'arbre de travail actuel contient 10 erreurs `tsc` : **rien n'empêche aujourd'hui de déployer du code qui ne compile pas.**

### TST-H2 — Haute — Les tests E2E ne peuvent pas tourner en CI

`playwright.config.ts:52` lance le serveur avec `${HOME}/Library/pnpm/pnpm exec next dev`, un chemin **propre à macOS**. Sur `ubuntu-latest`, ce binaire n'existe pas : le job E2E ne peut pas démarrer. Les specs supposent en outre des comptes QA créés au préalable (`scripts/qa-comptes-demo.ts`) dans une base que la CI ne crée pas (`DATABASE_URL` pointe sur un secret, c'est-à-dire une base partagée). Deux specs de débogage sont restées dans la suite (`debug-edt.spec.ts`, `test-features.spec.ts`).

### TST-M1 — Moyenne — Le seuil de couverture ne porte que sur 8 fichiers

`vitest.config.ts` : `coverage.include` liste 8 fichiers (facture, RH, deux composants). Le seuil de 60 % ne dit donc **rien** du reste du code. `pnpm test:coverage` ne peut pas révéler que `auth.ts`, `relances-auto.ts` ou `bulletins/generer` ne sont pas testés.

### TST-M2 — Moyenne — Le code le plus risqué n'est pas testé

Sans aucun test : `src/lib/auth.ts` (callback `jwt`), `src/lib/relances-auto.ts`, `src/app/api/cron/dispatch`, `src/app/api/bulletins/generer`, `src/app/api/absences/appel`, `src/app/api/eleves/changer-classe`, `src/app/api/parametres/annees-scolaires/[id]`, 24 moteurs LEARNOS (étape 6). Seuls 26 fichiers de tests couvrent les 266 routes. **Tous les constats critiques de cet audit se trouvent dans du code sans test.**

### TST-M3 — Moyenne — Aucun test de refus systématique ni de charge

- Voir API-2 : aucune preuve automatique qu'un rôle non autorisé reçoit 403.
- Aucun test de charge : `docs/TESTS/pyramide-tests-performance.md` décrit l'intention, mais aucun script k6 ou Artillery n'existe dans le dépôt.

## 4. Angles morts

1. **Aucun test de migration** : les migrations (19 dossiers, plus des fichiers `migration_*.sql` à la racine) ne sont pas rejouées en CI sur une base vide.
2. **Aucun test de restauration de sauvegarde** automatisé pour la cible Fly.io + Supabase (le RUNBOOK VPS en prévoit un pour pgBackRest).
3. **Aucun test de contrat mobile** : l'application Expo consomme 22 routes `mobile/*` dont le format n'est figé nulle part.
4. **Tests mutationnels** : aucune mesure de la capacité des tests à détecter une régression (Stryker), alors que 1 800 tests peuvent donner une fausse assurance, comme l'a montré AUTH-C1.

## 5. Notation

| Axe (poids) | Actuel | Justification | Cible |
|---|---:|---|---:|
| Sécurité (25 %) | 5 | Garde-fous de CI inactifs | 10 |
| Exactitude (25 %) | 8 | HEAD vert ; suite dense | 9,5 |
| Robustesse (15 %) | 5 | E2E impossibles en CI | 9,5 |
| Tests (15 %) | 6 | Zones critiques non testées | 9,5 |
| Traçabilité (10 %) | 6 | Aucun rapport de couverture global | 9,5 |
| Maintenabilité (10 %) | 7 | Conventions testées | 9,5 |
| **Brut** | **6,2** | | |

---

## 6. Cahier des charges

### TST-1 — Remettre la CI dans la boucle de livraison *(P0, 1 j)*

1. **Décision d'organisation** : toute livraison passe par une pull request vers `main`, et `main` est la seule source de déploiement.
2. Ouvrir une PR de `feat/rls-isolation-et-infra` vers `main` pour que `security.yml` existe sur la branche par défaut. Si la PR est trop grosse pour être relue, fusionner d'abord **seulement** `.github/workflows/security.yml` et ce qu'il appelle (`Makefile`, `docker-compose.test.yml`, `scripts/rls/*`, `tests/rls/*`), dans une PR séparée.
3. Ajouter aux deux workflows le déclencheur `push: branches: ["**"]`, pour qu'ils tournent aussi sur les branches de travail (sauf les jobs lourds `isolation` et `codeql`, gardés sur PR et `main`).
4. **Protection de branche** sur `main` (réglage GitHub, **à faire par le propriétaire du dépôt**) : PR obligatoire, jobs `test`, `isolation`, `secrets` et `vulnerabilites` requis, et fusion interdite si un job est rouge.
5. Supprimer `SKIP_TYPECHECK` du `Dockerfile` **ou** exiger que l'image ne soit construite qu'à partir d'un commit dont la CI est verte : job de déploiement déclenché par `workflow_run` après le succès de « CI », qui lance `flyctl deploy`. La seconde option est recommandée, car elle garde un build Docker léger.

**Critère.** Une PR de test introduisant une erreur de type est bloquée, et le déploiement ne part pas.

### TST-2 — E2E exécutables en CI *(P1, 2 j)*

1. `playwright.config.ts` : `command: process.env.CI ? "pnpm exec next start -p ${port}" : "pnpm exec next dev -p ${port}"`, avec un build préalable dans le job CI. Supprimer le chemin absolu macOS : pnpm est présent dans le PATH de GitHub Actions grâce à `pnpm/action-setup`.
2. Base éphémère : service `postgres:16` dans le job, puis `prisma migrate deploy`, puis `pnpm db:seed` et `tsx scripts/qa-comptes-demo.ts`. **Plus jamais** de `DATABASE_URL` partagée pour les E2E.
3. `retries: 1` en CI, `trace: "retain-on-failure"`, artefacts conservés 7 jours.
4. Supprimer ou déplacer `debug-edt.spec.ts` et `test-features.spec.ts`.

**Critère.** Le job E2E est vert trois fois de suite sur `main`.

### TST-3 — Couverture qui dit la vérité *(P1, 0,5 j)*

`coverage.include: ["src/lib/**/*.ts", "src/app/api/**/*.ts"]`, `exclude` pour les fichiers de test et les types. Seuils **par dossier** : `src/lib/domain/**` ≥ 95 %, `src/lib/auth.ts` et `src/lib/site-scope.ts` ≥ 90 %, `src/lib/learnos/**` ≥ 80 %, `src/app/api/**` ≥ 60 % au départ, puis +5 points par mois. Rapport publié en artefact de CI.

### TST-4 — Tester les zones critiques *(P1, inclus dans les tâches des étapes 1 à 6)*

Chaque tâche de correction (AUTH-1, API-1, MET-2, MET-4, MET-5, MET-6, AUT-1, IA-1) **commence** par un test rouge qui reproduit le défaut. Les deux preuves du dossier `C-preuves/` sont les premiers de ces tests.

### TST-5 — Tests de migration, de charge et de mutation *(P2, 2 j)*

1. Job CI « migrations » : base vide → `prisma migrate deploy` → `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code` (dérive = échec). Décider du sort des 20 fichiers `migration_*.sql` à la racine : les intégrer à `prisma/migrations` ou les archiver dans `prisma/sql/historique/`.
2. Scénario k6 (`tests/charge/`) : 50 utilisateurs simultanés sur 10 minutes (connexion, tableau de bord, saisie de notes, appel). Seuils : p95 < 1,5 s, 0 % d'erreur 5xx. Exécuté chaque semaine sur la préproduction.
3. Stryker sur `src/lib/domain` et `src/lib/site-scope.ts` : score de mutation ≥ 80 %.

## 7. Définition de « terminé »

- [ ] `main` protégée ; CI et Sécurité vertes ; aucun déploiement hors CI.
- [ ] E2E verts en CI sur base éphémère.
- [ ] Couverture globale publiée, seuils par dossier respectés.
- [ ] Chaque constat critique ou haut de l'audit a son test de régression.
