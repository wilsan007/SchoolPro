# Plan de contrôle total — SchoolPro / LEARNOS

> **Objet** : vérifier, de façon exhaustive et opposable, que **tout ce qui a été
> réalisé et mis en place fonctionne réellement**, que **chaque workflow s'exécute
> de bout en bout** (et pas seulement son premier écran), et que **les résultats
> métier attendus sont effectivement atteints** — pas seulement « la page
> s'affiche sans erreur ».
>
> **Branche auditée** : `feat/rls-isolation-et-infra`
> **Base de comparaison** : `main`
> **Date de rédaction** : 2026-09-03
> **Statut** : plan d'exécution — aucun contrôle n'a encore été exécuté au titre
> de ce document.

---

## Sommaire

- [0. Résumé exécutif](#0-résumé-exécutif)
- [1. Principes non négociables du contrôle](#1-principes-non-négociables-du-contrôle)
- [2. Périmètre et inventaire de l'existant](#2-périmètre-et-inventaire-de-lexistant)
- [3. Organisation, preuves, sévérités](#3-organisation-preuves-sévérités)
- [Phase 0 — Gel et reproductibilité](#phase-0--gel-et-reproductibilité)
- [Phase 1 — Contrôles statiques](#phase-1--contrôles-statiques)
- [Phase 2 — Tests automatisés](#phase-2--tests-automatisés)
- [Phase 3 — Intégrité de la base et du jeu de démonstration](#phase-3--intégrité-de-la-base-et-du-jeu-de-démonstration)
- [Phase 4 — Isolation : tenant, site, année (RLS)](#phase-4--isolation--tenant-site-année-rls)
- [Phase 5 — Authentification, RBAC, sécurité applicative](#phase-5--authentification-rbac-sécurité-applicative)
- [Phase 6 — Workflows métier de bout en bout](#phase-6--workflows-métier-de-bout-en-bout)
- [Phase 7 — Time Machine et horizon de démonstration](#phase-7--time-machine-et-horizon-de-démonstration)
- [Phase 8 — Matrice rôles × écrans](#phase-8--matrice-rôles--écrans)
- [Phase 9 — Internationalisation](#phase-9--internationalisation)
- [Phase 10 — Conformité au design](#phase-10--conformité-au-design)
- [Phase 11 — Performance et robustesse](#phase-11--performance-et-robustesse)
- [Phase 12 — Build, conteneur, déploiement, reprise](#phase-12--build-conteneur-déploiement-reprise)
- [Phase 13 — Intégration continue et gardes](#phase-13--intégration-continue-et-gardes)
- [Phase 14 — Clôture : Go / No-Go](#phase-14--clôture--go--no-go)
- [Annexes](#annexes)

---

## 0. Résumé exécutif

Le contrôle se déroule en **15 phases**, dans un ordre imposé par les
dépendances : on ne teste pas un workflow métier sur une base dont l'intégrité
n'est pas prouvée, et on ne teste pas l'intégrité d'une base sur un code qui ne
compile pas.

| Phase | Nature | Bloquante pour la suite | Durée estimée |
|---|---|---|---|
| 0 | Gel, reproductibilité | oui | 30 min |
| 1 | Statique (types, lint, règles maison, dépendances) | oui | 1 h |
| 2 | Tests automatisés unitaires + couverture | oui | 1 h |
| 3 | Intégrité base + jeu de démonstration | oui | 2 h |
| 4 | Isolation tenant/site/année + RLS PostgreSQL | oui | 2 h |
| 5 | Auth, RBAC, sécurité applicative | oui | 3 h |
| 6 | **Workflows métier bout en bout** (cœur du contrôle) | — | 12 h |
| 7 | Time Machine / horizon | — | 2 h |
| 8 | Matrice rôles × écrans (16 rôles × 84 pages) | — | 6 h |
| 9 | i18n fr/en/so | — | 1 h |
| 10 | Conformité DESIGN.md | — | 2 h |
| 11 | Performance et robustesse | — | 2 h |
| 12 | Build, Docker, déploiement, sauvegarde/restauration | oui (avant prod) | 3 h |
| 13 | CI et gardes automatisées | oui (avant fusion) | 1 h |
| 14 | Clôture, rapport, Go/No-Go | — | 1 h |

**Total estimé** : ~39 h d'exécution effective, hors correction des anomalies.

Trois points d'attention connus **avant même de commencer** :

1. **L'arbre de travail n'est pas propre** : 19 fichiers modifiés et 1 fichier
   non suivi (`src/lib/learnos/alerte-decalage.test.ts`), dont une réécriture
   massive de `prisma/sql/generate-sql.mjs` (−1 821 / +1 037 lignes cumulées sur
   l'ensemble). Auditer un arbre non commité rend le résultat non reproductible.
   → **Phase 0, contrôle 0.1**, bloquant.
2. **La base de démonstration a dérivé du schéma Prisma** (construite par dumps
   SQL, pas par migrations) : des migrations de rattrapage manuelles
   (`MANUAL-05`, `MANUAL-06`) ont été appliquées. Le contrôle doit **mesurer**
   la dérive résiduelle, pas la supposer nulle. → **Phase 3, contrôle 3.4**.
3. **Dette d'exemptions ESLint** : 185 `eslint-disable` dans `src/` (référence
   131 en début de chantier), dont **76 exemptions muettes** de la règle
   `ecolpro/require-site-filter`. Chacune est une fuite d'isolation potentielle
   non prouvée. → **Phase 1, contrôle 1.5**.

---

## 1. Principes non négociables du contrôle

1. **Aucune affirmation sans preuve archivée.** Chaque contrôle produit un
   artefact (sortie de commande, capture, export SQL) rangé sous
   `docs/CONTROLE/preuves/<ID>/`. « Ça marche » n'est pas un résultat.
2. **Un contrôle prouve un résultat métier, pas une absence d'erreur.** Un écran
   qui s'affiche vide sans planter est un **échec**, pas un succès. Chaque fiche
   porte donc un *résultat attendu chiffré* (« 44 classes », « bulletin T1
   publié pour 1 232 élèves », « 51 factures en retard en fin d'année »).
3. **Fail-closed.** Conformément à la règle 6 d'`AGENTS.md`, un contrôle dont le
   résultat est indéterminé est compté **en échec**, jamais en succès.
4. **Le contrôle ne corrige pas.** Toute anomalie va au registre (annexe B) avec
   sévérité. La correction est un chantier distinct, ré-audité ensuite.
5. **Reproductibilité.** Tout contrôle est décrit par une commande exécutable ou
   une suite de clics numérotée. Si un contrôle ne peut pas être rejoué par un
   tiers, il est réécrit.
6. **Périmètre strict SchoolPro.** Aucune sortie du dossier
   `/Users/awalehosman/Projects/SchoolPro` — ni lecture ni écriture dans
   EcolPro/ecolemiriam (cf. `GARDE-FOUS.md`).
7. **`pnpm` uniquement**, jamais `npm` (cf. `AGENTS.md`).

---

## 2. Périmètre et inventaire de l'existant

Inventaire relevé sur la branche auditée — il sert de **base de comptage** :
tout écart entre cet inventaire et le résultat du contrôle est une anomalie.

| Élément | Quantité |
|---|---|
| Routes API (`src/app/api/**/route.ts`) | 264 |
| Pages du tableau de bord (`src/app/(dashboard)/**/page.tsx`) | 84 |
| Modules LEARNOS (`src/lib/learnos/`) | 79 fichiers |
| Fichiers de test unitaire (`src/**/*.test.ts*`) | 94 |
| Suites E2E Playwright (`tests/e2e/`) | 18 |
| Tests d'isolation RLS (`tests/rls/`) | 1 suite, 259 lignes |
| Rôles applicatifs (`enum Role`) | 16 |
| Locales | 3 (`fr`, `en`, `so`) |
| Migrations Prisma | 14 répertoires + `rls-enable-all.sql` |
| Fichiers SQL du jeu de démonstration | ~700 (`prisma/sql/`) |
| Services de la stack de production | db, pgbouncer, migrate, app, caddy, cloudflared, socket-proxy, ofelia, uptime-kuma |
| Cibles Make | ~40 (déploiement, secrets, sauvegardes, RLS, audit) |

### Domaines fonctionnels à couvrir

1. **Scolarité** — élèves, classes, structures, inscriptions, transferts, alumni
2. **Admissions & réinscription** — candidature → dossier → facture → inscription
3. **Évaluation** — évaluations, notes, rubriques, bulletins T1/T2/T3, bulletin
   annuel décisionnel, examens, copies papier
4. **Vie scolaire** — appel, absences, retards, incidents, convocations,
   exclusions, infirmerie
5. **Finance** — tarifs, facturation, paiements, caisse/remises, relances
   graduées, recouvrement, comptabilité
6. **RH** — personnel, absences, congés, remplacements
7. **Emploi du temps** — grille dynamique, import Excel/CSV/Word, indisponibilités
8. **Pédagogie / LEARNOS** — curriculum, planification, cahier-journal, evidence
   engine, learning twin, recommandations, plans de progression, entraînement,
   banque d'exercices IA, alertes de décalage
9. **Intelligence direction** — KPI, chatbot direction, trajectoires de cohortes,
   risque de décrochage, équité, climat
10. **Communication** — messagerie, notifications, bot parent (WhatsApp/Telegram)
11. **Mobile** — routes `api/mobile/*`, Capacitor iOS/Android
12. **Plateforme** — auth/2FA, RBAC, RLS, Time Machine, i18n, audit, exports

---

## 3. Organisation, preuves, sévérités

### 3.1 Arborescence des artefacts

```
docs/CONTROLE/
├── RAPPORT.md              # rapport final (rédigé en phase 14)
├── SUIVI.md                # tableau d'avancement, un état par contrôle
├── REGISTRE-ANOMALIES.md   # annexe B
└── preuves/
    ├── 1.2-tsc/            # sorties brutes
    ├── 4.3-rls-test/
    ├── 6.2-bulletins/      # captures d'écran horodatées
    └── …
```

### 3.2 États possibles d'un contrôle

`OK` · `ÉCHEC` · `PARTIEL` (résultat obtenu mais dégradé — à documenter) ·
`BLOQUÉ` (prérequis absent) · `NON APPLICABLE` (justifié par écrit).

Rappel du principe 3 : un contrôle **non exécuté** ou **indéterminé** compte
comme `ÉCHEC` dans le calcul du Go/No-Go.

### 3.3 Échelle de sévérité

| Niveau | Définition | Effet sur la livraison |
|---|---|---|
| **S1 — Critique** | Fuite de données entre tenants/sites/années, perte de données, calcul de note ou de facture faux, authentification contournable, sauvegarde non restaurable | Bloque toute mise en production |
| **S2 — Majeure** | Un workflow ne va pas à son terme, un résultat métier attendu n'est pas atteint, un rôle voit un écran vide ou inutilisable | Bloque la livraison du lot concerné |
| **S3 — Mineure** | Écart d'affichage, libellé non traduit, écart au DESIGN.md, lenteur non bloquante | Corrigé au fil de l'eau, ne bloque pas |
| **S4 — Observation** | Dette, redondance, code mort, documentation à jour à faire | Backlog |

---

## Phase 0 — Gel et reproductibilité

**Objectif** : figer un état auditable. Sans cela, aucun résultat n'est opposable.

| ID | Contrôle | Commande / action | Attendu | Sév. si échec |
|---|---|---|---|---|
| 0.1 | Arbre de travail propre | `git status --short` | Aucune sortie. Les 19 fichiers modifiés + `alerte-decalage.test.ts` sont **commités** (ou remisés) avant tout contrôle | S2 |
| 0.2 | Empreinte de l'état audité | `git rev-parse HEAD > docs/CONTROLE/preuves/0.2-head.txt` | SHA archivé, cité dans le rapport | S3 |
| 0.3 | Écart avec `main` mesuré | `git diff --stat main...HEAD` | Diffstat archivé ; les fichiers générés (SQL de seed) isolés du décompte pour lisibilité | S3 |
| 0.4 | Dépendances reproductibles | `pnpm install --frozen-lockfile` | Installation sans modification du lockfile | S2 |
| 0.5 | Client Prisma à jour | `pnpm exec prisma generate` | Généré sans erreur ; `binaryTargets` inclut `debian-openssl-3.0.x` (cf. commit `892a9a0`) | S2 |
| 0.6 | Environnements identifiés | Lister les cibles : base locale, base de démo Ambouli, labo RLS, VPS | Tableau des `DATABASE_URL`/`DIRECT_URL` par cible, **sans secret en clair** dans le rapport | S2 |
| 0.7 | Garde base de données active | `pnpm guard:db` | Le script confirme la cible attendue ; aucun contrôle destructif ne pointe la production | S1 |
| 0.8 | Sauvegarde préalable | Dump de la base de démo avant toute phase écrivant en base | Fichier de dump horodaté, restauration testée en 3.9 | S1 |

> **Point de vigilance** : la phase 3 et la phase 6 écrivent en base (création de
> factures, de notes, de bulletins). Elles doivent tourner sur une **copie** du
> jeu Ambouli, jamais sur la base servant aux démonstrations commerciales.

---

## Phase 1 — Contrôles statiques

**Objectif** : prouver que le code compile, respecte les règles maison, et ne
porte pas de dette d'isolation invisible.

| ID | Contrôle | Commande | Attendu | Sév. |
|---|---|---|---|---|
| 1.1 | Chaîne de vérification complète | `pnpm verify` | lint + `tsc --noEmit` + vitest + `prisma validate` + `pnpm audit --prod` : **tout au vert** | S2 |
| 1.2 | Types seuls (détail des erreurs) | `pnpm exec tsc --noEmit` | 0 erreur. Sortie archivée | S2 |
| 1.3 | Lint | `pnpm lint` | 0 erreur, warnings inventoriés | S3 |
| 1.4 | Règle maison `require-site-filter` | `pnpm exec eslint src --rulesdir eslint-rules` (ou via `pnpm lint`) | 0 violation non exemptée | S1 |
| 1.5 | **Exemptions muettes** | `grep -rn "eslint-disable.*require-site-filter" src --include="*.ts*" \| grep -vc -- "--"` | **0** pour toute ligne ajoutée ; le stock historique (76 attendu) est recompté et **la variation depuis `main` doit être ≤ 0** | S1 si en hausse |
| 1.6 | Compteur global d'exemptions | `grep -rc "eslint-disable" src --include="*.ts*" \| ...` | ≤ 185 (référence `docs/learnos-etat.md`). Toute hausse doit être justifiée par écrit | S3 |
| 1.7 | Dette `any` / `@ts-ignore` | `grep -rn ": any\|@ts-ignore\|@ts-expect-error" src --include="*.ts*"` | Chaque occurrence porte un commentaire de justification (règle 4 `AGENTS.md`) | S3 |
| 1.8 | Pureté du domaine | `grep -rn "@prisma/client\|prisma" src/lib/domain/` | **Aucune** occurrence (règle 7) | S2 |
| 1.9 | Calculs de notes en entiers | Revue de `src/lib/domain/note.ts` + `grep -rn "moyenne" src/lib --include="*.ts" \| grep -v domain` | Aucun calcul de moyenne en flottant hors affichage (règle 3) | S1 |
| 1.10 | Schéma Prisma valide | `pnpm exec prisma validate` | Valide | S2 |
| 1.11 | Politiques RLS synchronisées avec le schéma | `pnpm rls:check` | Aucun écart : toute table tenant-scopée ajoutée a sa politique | S1 |
| 1.12 | Vulnérabilités de dépendances | `pnpm audit --prod` | 0 critique / 0 haute. Moyennes inventoriées avec date de traitement | S1 (critique/haute) |
| 1.13 | Absence de secret commité | `git log -p --all -- .env .env.local secrets/ \| grep -iE "key\|token\|password"` + revue `.gitignore` | Aucun secret dans l'historique ; `.env*` et `secrets/` ignorés | S1 |
| 1.14 | Cohérence des périmètres projet | `AUDIT-PERIMETRE.json` régénéré et comparé | Aucun chemin hors SchoolPro | S1 |
| 1.15 | Code mort / fichiers temporaires | Revue de `.tmp-reset-site.ts`, `tmp-fix-seances.mjs`, `prisma/sql/generate-sql.mjs.bak`, `scripts/_tmp-audit.ts` | Statut décidé pour chacun : conservé et documenté, ou supprimé | S4 |

---

## Phase 2 — Tests automatisés

**Objectif** : la suite existante passe **intégralement**, et couvre réellement
ce qui a changé.

| ID | Contrôle | Commande | Attendu | Sév. |
|---|---|---|---|---|
| 2.1 | Suite unitaire complète | `pnpm test` | 94 fichiers de test, **0 échec, 0 test ignoré non justifié** | S2 |
| 2.2 | Couverture | `pnpm test:coverage` | Seuils 60 % (lines/functions/branches/statements) tenus sur le périmètre configuré | S3 |
| 2.3 | **Périmètre de couverture trop étroit** | Revue de `vitest.config.ts` | Le bloc `coverage.include` ne liste que 8 fichiers : la couverture affichée **ne dit rien du reste**. Anomalie à consigner, avec proposition d'élargissement progressif | S3 |
| 2.4 | Tests des modules modifiés dans ce lot | `pnpm exec vitest run src/lib/demo-horizon.test.ts src/lib/learnos/alerte-decalage.test.ts src/lib/learnos/direction-intelligence.test.ts` | Tous verts ; le nouveau fichier `alerte-decalage.test.ts` couvre les 144 lignes modifiées du module | S2 |
| 2.5 | Tests d'intégration RBAC / site-scope | `pnpm exec vitest run src/lib/rbac-integration.test.ts src/lib/site-scope-integration.test.ts src/lib/permissions.test.ts` | Verts ; matrice de rôles complète (16 rôles) | S1 |
| 2.6 | Tests sécurité | `pnpm exec vitest run src/lib/security/ src/lib/password-validation.test.ts src/lib/two-factor-policy.test.ts` | Verts | S1 |
| 2.7 | Tests moteur de tâches | `pnpm exec vitest run src/lib/tache-engine.test.ts src/lib/tache-buckets.test.ts src/lib/tache-rappels.test.ts` | Verts | S2 |
| 2.8 | Déterminisme | Relancer `pnpm test` 3 fois | Résultat identique ; aucun test dépendant de l'heure réelle ou d'un ordre d'exécution | S2 |
| 2.9 | Vitesse | Mesurer la durée de `pnpm test` | Suite unitaire < 2 min (sinon elle cessera d'être lancée — cf. `docs/TESTS/pyramide-tests-performance.md`) | S3 |

---

## Phase 3 — Intégrité de la base et du jeu de démonstration

**Objectif** : prouver que les données sur lesquelles s'exécutent les workflows
sont cohérentes, complètes et conformes au schéma.

| ID | Contrôle | Commande | Attendu | Sév. |
|---|---|---|---|---|
| 3.1 | Génération + validation du jeu SQL | `pnpm seed:check` | `generate-sql.mjs` régénère sans erreur, `validate.mjs` ne signale aucune incohérence référentielle | S1 |
| 3.2 | **Non-régression de `generate-sql.mjs`** | Comparer la sortie générée avant/après la réécriture en cours (`git stash` + diff des SQL produits) | Aucune perte de volume ni de table par rapport à la version de `main` ; tout écart volontaire documenté | S1 |
| 3.3 | Validation du curriculum | `node prisma/sql/validate-curriculum.mjs` | Chapitres, compétences, prérequis : graphe acyclique, aucun orphelin | S2 |
| 3.4 | **Dérive de schéma** | `pnpm exec prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script` | Écart limité aux **17 diffs cosmétiques connus** (actions `ON UPDATE/DELETE` de clés étrangères). Toute colonne ou table manquante est S1 | S1 |
| 3.5 | Migrations de rattrapage appliquées | Vérifier en base la présence de `periodeId`, `indisponibilites_enseignants`, `campagne_reinscription`, `invitation_reinscription` | Toutes présentes (MANUAL-05, MANUAL-06) | S1 |
| 3.6 | Idempotence des migrations | Rejouer `prisma/migrations/*` sur une base neuve | Aucune erreur ; aucune migration destructive (règle 5) | S2 |
| 3.7 | Audit du jeu Ambouli | `pnpm exec tsx scripts/audit-demo-ambouli.ts` | Les 3 volets passent : répartition entre `site-ambouli` / `site-arhiba` équilibrée, cohérence métier (dates dans les bornes, factures soldées, EDT sans collision), Time Machine croissante | S1 |
| 3.8 | Isolation par site en base | `pnpm audit:sites` | 0 violation (référence P0 : 103 → 0) | S1 |
| 3.9 | Cohérence des années | `pnpm exec tsx scripts/audit-annee.ts` | 2024-2025 clôturée, **2025-2026 courante et ouverte**, 2026-2027 ouverte mais quasi vide ; une seule année `isCurrent=true` | S1 |
| 3.10 | Diagnostic des sites | `pnpm exec tsx scripts/diagnostic-sites.ts` | Aucun site orphelin, aucune classe sans `siteId` | S2 |
| 3.11 | Volumes de référence | Requêtes de comptage | 44 classes, 1 232 élèves actifs, 48 048 notes, 2 464 bulletins, 1 920 questions `q-ia-*`, 6 160 feuilles d'entraînement, 134 redoublants | S2 si écart non expliqué |
| 3.12 | Liaison des cohortes | Vérifier `parcours_scolaires.eleveId` sur années consécutives + `identiteKey` (`idk-<matricule>`) | Chaque élève actif 2025-2026 a un parcours 2024-2025 lié ; analyses longitudinales non vides | S2 |
| 3.13 | Doublons | `pnpm exec tsx scripts/dedup-eleves.ts --dry-run` | Aucun doublon d'élève détecté | S2 |
| 3.14 | Restauration du dump de la phase 0 | Restaurer sur une base scratch et recompter | Comptages identiques à 3.11 — prouve que la sauvegarde est exploitable | S1 |

---

## Phase 4 — Isolation : tenant, site, année (RLS)

**Objectif** : prouver les trois cloisonnements, **en base** et pas seulement
dans le code. C'est le contrôle le plus important du document.

| ID | Contrôle | Commande | Attendu | Sév. |
|---|---|---|---|---|
| 4.1 | Labo PostgreSQL fidèle à la production | `make test-db-up` | Conteneur `ecolpro-test-db` sain (`healthy`) | S1 |
| 4.2 | Application des fonctions + politiques RLS | `make rls-apply-test` | `docker/postgres/init/03-rls-functions.sql` et `prisma/sql/rls/02-policies.sql` appliqués sans erreur | S1 |
| 4.3 | **Preuve d'isolation** | `make rls-test` (⇔ `RLS_MODE=enforce pnpm test:rls`) | `tests/rls/isolation.test.ts` : 100 % vert. Un tenant A ne lit **aucune** ligne d'un tenant B, y compris en écriture et en jointure | S1 |
| 4.4 | Chaîne complète d'un trait | `make rls-full` | Enchaîne 4.1 → 4.3 sans intervention | S1 |
| 4.5 | Le rôle applicatif n'est pas superutilisateur | `make test-db-psql` puis `SELECT current_user, usesuper FROM pg_user WHERE usename = current_user;` | `ecolpro_app`, `usesuper = false` — sinon la RLS est contournée et **tous les tests de 4.3 ne prouvent rien** | S1 |
| 4.6 | Couverture des politiques | Comparer la liste des tables tenant-scopées du schéma avec `pg_policies` | Aucune table tenant-scopée sans politique | S1 |
| 4.7 | Contexte RLS transporté | Revue de `src/lib/rls-context.ts`, `rls-session.ts`, `prisma-rls.ts` | `AsyncLocalStorage` alimenté à chaque requête authentifiée ; aucune variable de module partagée entre requêtes | S1 |
| 4.8 | Exceptions super-admin recensées | `grep -rn "withSystemContext\|superAdmin: true" src/` | Chaque usage est justifié en commentaire et correspond à un cas documenté (SUPER_ADMIN authentifié, ou opération d'avant-authentification) | S1 |
| 4.9 | Fail-closed par défaut | Test : requête sans contexte (`tenantId = null`) | Renvoie **0 ligne** (`DENY_ALL` de `src/lib/site-scope.ts`), jamais « toutes » | S1 |
| 4.10 | Isolation par site | Session d'un utilisateur rattaché à `site-ambouli` | Ne voit aucune donnée de `site-arhiba` sur les 84 pages échantillonnées (échantillon de 15 pages sensibles minimum) | S1 |
| 4.11 | Isolation par année | Session positionnée sur 2025-2026 | Aucune donnée 2024-2025 ni 2026-2027 dans les listes pédagogiques (règle 2 `AGENTS.md`) | S1 |
| 4.12 | Contournement par les routes mobiles | Appels directs à `api/mobile/*` avec un jeton d'un autre tenant | 403/404, jamais de donnée | S1 |
| 4.13 | Nettoyage | `make test-db-down` | Labo arrêté, données effacées | S3 |

---

## Phase 5 — Authentification, RBAC, sécurité applicative

| ID | Contrôle | Méthode | Attendu | Sév. |
|---|---|---|---|---|
| 5.1 | Connexion nominale | UI, compte `admin@cite-ambouli.dj` | Accès au tableau de bord du bon tenant/site | S1 |
| 5.2 | Second facteur réellement exigé | Activer 2FA sur un compte, se reconnecter | Le mot de passe seul ne suffit pas ; code TOTP exigé, codes de secours utilisables une seule fois | S1 |
| 5.3 | Politique de 2FA par rôle | `src/lib/two-factor-policy.ts` + essai par rôle | Les rôles soumis à obligation ne peuvent pas la contourner | S1 |
| 5.4 | Complexité des mots de passe | Formulaire d'inscription / changement | Refus des mots de passe faibles, message traduit dans les 3 locales | S2 |
| 5.5 | Réinitialisation de mot de passe | `src/lib/password-reset.ts` | Jeton à usage unique, expirant ; l'ancien mot de passe cesse de fonctionner | S1 |
| 5.6 | Limitation de débit | `src/lib/security/edge-rate-limit.ts` — 20 tentatives de connexion | Blocage effectif, message clair, pas de déni de service sur les autres utilisateurs | S2 |
| 5.7 | Turnstile | `src/lib/security/turnstile.ts` | Vérification côté serveur effective ; échec = refus | S2 |
| 5.8 | Contrôle des fichiers déposés | `src/lib/security/magic-bytes.ts` — déposer un `.exe` renommé `.pdf` | Refusé sur le contenu, pas sur l'extension | S1 |
| 5.9 | Middleware de protection des routes | `src/middleware.ts` + `tests/e2e/family-routes-blocked.spec.ts` | Aucune page du tableau de bord accessible sans session | S1 |
| 5.10 | Redirection par rôle | `tests/e2e/role-redirection.spec.ts` | Chaque rôle atterrit sur son espace | S2 |
| 5.11 | Matrice de permissions | `tests/e2e/role-permissions.spec.ts` + `src/lib/permissions.ts` | 16 rôles × actions sensibles : aucune permission accordée par défaut | S1 |
| 5.12 | Multi-rôle | `pnpm exec tsx scripts/qa-multi-roles.ts` puis parcours des 5 scénarios | Un enseignant-parent voit les deux espaces sans fuite croisée (ne voit que **ses** enfants) | S1 |
| 5.13 | Blocage financier | `pnpm exec tsx scripts/test-financial-block.ts` | Les écrans financiers refusent l'accès aux rôles non habilités | S1 |
| 5.14 | Journal d'audit | Page `parametres/audit` après 10 actions sensibles | Les 10 actions sont tracées (qui, quoi, quand, sur quel tenant/site) | S2 |
| 5.15 | En-têtes de sécurité | `curl -I` sur l'application déployée | CSP, HSTS, X-Content-Type-Options, Referrer-Policy conformes à `next.config.ts` | S2 |
| 5.16 | Reprise du pentest | Rejouer les 27 findings de `docs/SECURITE/rapport-pentest-2026-08-28.md` | Les 6 critiques/hautes et les 15 moyennes/basses corrigées sont **vérifiées closes**, pas seulement marquées closes | S1 |
| 5.17 | Audit dépendances | `docs/SECURITE/audit-dependances-2026-08-28.md` rejoué | Aucune régression ; `overrides` de `package.json` toujours effectifs | S2 |
| 5.18 | Secrets chiffrés | `make secrets-check` | Complétude et permissions correctes ; clé age présente et sauvegardée hors machine | S1 |

---

## Phase 6 — Workflows métier de bout en bout

**C'est le cœur du contrôle.** Chaque workflow est parcouru **jusqu'à son
résultat final observable**, avec un jeu de données identifié, et une preuve
(capture + requête SQL de vérification). Un workflow qui « s'ouvre » mais dont la
dernière étape ne produit pas l'effet attendu est en **échec (S2)**.

Format de chaque fiche : **W-n° · Nom · Rôle(s) · Étapes · Résultat attendu ·
Preuve · Vérification en base.**

### W-1 · Admissions → inscription (SECRETARY, TENANT_ADMIN)

1. Créer une candidature depuis `/admissions`
2. Constituer le dossier (pièces, contrôle de complétude)
3. Décision d'admission
4. Génération de la facture de candidature/inscription
5. Encaissement
6. Bascule en élève inscrit, affectation à une classe

**Résultat attendu** : l'élève apparaît dans `/eleves`, rattaché à la bonne
classe et au bon site ; la facture existe et est soldée ; le dossier
d'inscription est historisé (`inscription_dossier_historique`).
**Automatisé** : `tests/e2e/admissions-workflow.spec.ts`.
**Vérification SQL** : `SELECT` sur `eleve`, `facture`, `inscription` pour l'ID créé.

### W-2 · Réinscription de campagne (TENANT_ADMIN, PARENT)

1. Créer une campagne (`parametres/reinscription`)
2. Émettre les invitations
3. Côté parent : `/parent/reinscription` → réponse
4. Consolidation côté établissement

**Résultat attendu** : compteurs de campagne exacts (invités / répondus /
confirmés / refusés) ; l'élève confirmé bascule sur l'année suivante.
**Automatisé** : `tests/e2e/reinscription-workflow.spec.ts`.

### W-3 · Facturation → paiement → relance → recouvrement (ACCOUNTANT, CAISSIER)

1. Émettre une facture (`/facturation/nouvelle`)
2. Encaisser partiellement en caisse, produire une remise de caisse
3. Laisser une facture échoir → relance 1, 2, 3 (`src/lib/relances-auto.ts`)
4. Escalade : recouvré / contentieux / exclusion pour non-paiement

**Résultat attendu** : le solde décroît correctement (calcul en entiers), la
remise de caisse équilibre, les relances sont **graduées et idempotentes** (pas
de double envoi), le parcours de recouvrement atteint chaque état.
**Chiffre de référence** : 1 183 factures en retard en début d'exercice → **51**
en fin d'année, 295 élèves concernés.
**Vérification** : requête d'agrégation sur `facture` par statut et par date.

### W-4 · Évaluation → notes → bulletins → décision annuelle (TEACHER, PRINCIPAL)

1. Créer une évaluation (`/evaluations`), y rattacher une compétence
2. Saisir les notes (`/notes`), y compris copies papier
3. Calculer moyennes, rangs, appréciations
4. Générer les bulletins T1, T2, T3 (`/notes/bulletins`)
5. Publier / verrouiller (`bulletin_verrouillage_historique`)
6. Bulletin annuel décisionnel (`src/lib/bulletin-decision.ts`) : décision +
   mention
7. Export PDF (`src/lib/pdf/bulletin-generator.ts`)

**Résultat attendu** : moyennes justes **au centième entier** (règle 3) ; T1
publié, T2 en brouillon à valider, T3 publié + décision ; PDF conforme au
DESIGN.md, sans donnée d'un autre élève.
**Automatisé** : `tests/e2e/bulletins-workflow.spec.ts`.
**Contrôle croisé S1** : recalculer 20 moyennes à la main (ou par requête SQL) et
comparer au bulletin — tout écart, même de 0,01, est S1.

### W-5 · Appel → absences → veille assiduité → alerte parent (SUPERVISOR, PARENT)

1. Faire l'appel (`/absences/appel`)
2. Justifier / ne pas justifier
3. Seuils de veille (`/veille-assiduite`)
4. Alerte parent (`src/lib/learnos/alertes-parent.ts`, `alerte-parent-pedagogique.ts`)
5. Convocation, puis exclusion si le seuil est franchi

**Résultat attendu** : l'absence saisie remonte dans les KPI de direction le jour
même ; l'alerte part **une seule fois** (idempotence sur 3 passages) et dans la
langue de la famille.
**Automatisé** : `tests/e2e/absences.spec.ts`.

### W-6 · Cahier-journal → couverture du programme → alerte de décalage (TEACHER, PRINCIPAL)

1. Planifier l'année (`PlanificationChapitre` / `PlanificationCompetence`)
2. Saisir les séances (`/cahier-journal`)
3. Suivi de couverture (`/couverture`, `src/lib/learnos/suivi-programme.ts`)
4. **Alerte de décalage** (`src/lib/learnos/alerte-decalage.ts` — module modifié
   dans ce lot, 144 lignes)

**Résultat attendu** : le retard est détecté et chiffré (en semaines) ;
l'alerte remonte au chef d'établissement ; le calcul respecte les événements
calendaires (vacances, examens, fériés) et ne compte pas les semaines non
travaillées.
**Contrôle S2 dédié** : ce module a changé — reconstituer 3 cas manuels
(en avance, à l'heure, en retard de 3 semaines) et vérifier chaque sortie.

### W-7 · Emploi du temps : construction et import (SITE_MANAGER, TENANT_ADMIN)

1. Grille horaire dynamique (`/emploi-du-temps`)
2. Import multi-format Excel / CSV / Word
3. Indisponibilités enseignants, périodes
4. Détection de collisions (salle, enseignant, classe)
5. Remplacements (`couverture-remplacements.ts`)

**Résultat attendu** : import sans perte, **aucune collision non signalée**, un
remplacement se propage à l'emploi du temps de l'enseignant et de la classe.
**Automatisé** : `tests/e2e/emploi-du-temps-workflow.spec.ts`.

### W-8 · Moteur de tâches automatiques (tous rôles)

1. Déclencheurs (`src/lib/tache-engine.ts`, 800 lignes ; `tache_source_auto`)
2. Répartition en seaux (`tache-buckets.ts`)
3. Rappels (`tache-rappels.ts`)
4. Écrans `/taches`, `/ma-journee`, `api/mobile/taches`

**Résultat attendu** : chaque événement métier (facture échue, bulletin à
valider, absence non justifiée, séance non saisie) crée **une** tâche pour le
bon rôle, avec la bonne échéance ; la tâche disparaît quand l'action est faite.
**Automatisé** : `tests/e2e/taches-workflow.spec.ts` + tests unitaires 2.7.
**Attention** : `/taches`, `/ma-journee` et `api/mobile/taches` font partie des
fichiers modifiés non commités — à re-tester en priorité.

### W-9 · Chaîne LEARNOS complète (TEACHER, STUDENT, PARENT, PRINCIPAL)

1. Curriculum : chapitres → compétences → prérequis (`/curriculum`)
2. Rattachement des évaluations aux compétences
3. Event Bus → outbox `LearnosEvent` → **Evidence Engine**
4. **Learning Twin** : maîtrise, confiance, tendance
5. **Recommandations** (5 bandes) et plans de progression
6. Entraînement élève (`/entrainement`) sur la banque d'exercices (1 920
   questions IA, 6 160 feuilles)
7. Retour dans le twin (boucle fermée)

**Résultat attendu** : une note saisie en W-4 produit une évidence, met à jour la
maîtrise de la compétence, change la bande de recommandation si le seuil est
franchi, et modifie la feuille d'entraînement proposée. **La boucle doit se
fermer sur un cas suivi de bout en bout, élève identifié, captures à chaque
étape.**
**Automatisé** : `pnpm exec tsx scripts/demo-learnos.ts` (validation bout en
bout sur données réelles) + `tests/e2e/entrainement.spec.ts`.
**Contrôle S1** : le moteur de recommandation doit rester **déterministe** —
aucun appel LLM dans la décision (`AGENTS.md`, conventions LEARNOS). Rejouer
deux fois : sortie identique.

### W-10 · Bot parent (PARENT)

1. Identification par numéro de téléphone
2. Désambiguïsation d'une fratrie
3. Les 7 intentions
4. Alertes proactives, préférences de langue

**Résultat attendu** : réponses justes, **jamais** de donnée d'un enfant qui
n'est pas le sien ; idempotence des alertes sur 3 passages.
**Automatisé** : `pnpm exec tsx scripts/demo-bot-parent.ts --alertes`.

### W-11 · Intelligence direction (TENANT_ADMIN, PRINCIPAL)

1. `/direction` — KPI consolidés (`src/lib/learnos/kpi.ts`, modifié)
2. `/intelligence`, `/chatbot-direction`
3. Trajectoires de cohortes : efficacité du redoublement (7,03 → 10,50, +3,48,
   87 % améliorés), diplomation, écart de genre, boursiers
4. Risque de décrochage, équité/inclusion, climat

**Résultat attendu** : les chiffres affichés sont **reproductibles par requête
SQL** ; le chatbot ne répond que sur des données du tenant ; aucun écran vide.
**Note** : `direction-intelligence.ts` et `kpi.ts` sont modifiés dans ce lot →
re-vérifier chaque KPI contre une requête témoin.

### W-12 · Communication et notifications

Messagerie interne, notifications de direction
(`notify-direction.ts`, `cible_notification_direction`), WhatsApp/Telegram.
**Résultat attendu** : un message atteint le bon destinataire et **lui seul** ;
aucune notification transverse à un autre tenant.

### W-13 · RH (TENANT_ADMIN)

Personnel → absences → congés → remplacements → impact sur l'emploi du temps.
**Résultat attendu** : un congé validé libère les créneaux et déclenche la
proposition de remplacement.

### W-14 · Vie scolaire et santé (SUPERVISOR, NURSE)

Incidents → traçabilité de résolution (`incident_resolution_traceability`) →
convocations → exclusions ; passages à l'infirmerie.
**Résultat attendu** : confidentialité médicale — les données de l'infirmerie ne
sont visibles que des rôles habilités (contrôle croisé avec 5.11).

### W-15 · Mobile

Les routes `api/mobile/*` sous session mobile réelle (Capacitor), mode hors
ligne (`/offline`), synchronisation (`src/lib/sync-export.ts`).
**Résultat attendu** : parité fonctionnelle avec le web sur le périmètre annoncé
dans `MOBILE_DEPLOIEMENT.md` ; aucune route mobile sans filtre de tenant.

### Exécution automatisée de la phase

```bash
pnpm exec playwright install --with-deps    # une fois
PLAYWRIGHT_BASE_URL=http://localhost:3001 pnpm test:e2e
```

**Attendu** : les 18 suites au vert. `retries: 0` et `workers: 1` dans
`playwright.config.ts` : un échec est un vrai échec, pas un aléa.

---

## Phase 7 — Time Machine et horizon de démonstration

**Objectif** : prouver que déplacer l'horloge change réellement ce que
l'application montre — c'était précisément le défaut corrigé par
`src/lib/demo-horizon.ts` (modifié dans ce lot).

| ID | Contrôle | Méthode | Attendu | Sév. |
|---|---|---|---|---|
| 7.1 | Les 6 presets | Pour chaque date (Oct 25, Jan 26, Mar 26, Juin 26, Août 26, Oct 26) | Chargement sans erreur sur les écrans clés | S2 |
| 7.2 | **Croissance monotone** | `pnpm exec tsx scripts/audit-demo-ambouli.ts` (volet Time Machine) | Le volume de faits constatés (notes, absences, incidents, factures) **croît strictement** avec la date | S1 |
| 7.3 | **Invariance du structurel** | Idem | Élèves, classes, matières, périodes, années : **inchangés** quelle que soit la date | S1 |
| 7.4 | Planifié vs constaté | Revue de la liste des modèles bornés dans `demo-horizon.ts` | `Examen`, `SessionExamen`, `Evenement`, `EvenementCalendaire`, `Reunion`, `SeanceMentorat`, `EntretienConseiller`, `RemplacementCours`, `CongePersonnel` **non bornés** ; `Evaluation` bornée seulement à l'état `TERMINE` | S1 |
| 7.5 | Relations imbriquées | Identifier les `include` de premier niveau qui contournent l'extension Prisma | Chaque page concernée pose son propre `where` d'horizon — liste exhaustive à produire (~146 filtres de date sur ~85 fichiers) | S2 |
| 7.6 | Cohérence des bulletins par date | En Jan/Mars 26 | T1 publié visible, T2 en brouillon à valider ; en Juin 26, T3 publié + décision | S2 |
| 7.7 | Année 2026-2027 | Pin sur Oct 26 | Écrans quasi vides — **normal**, à ne pas confondre avec une anomalie ; message explicite attendu plutôt qu'un vide muet | S3 |
| 7.8 | Réservé au rôle | Time Machine visible/actionnable | Uniquement pour `TENANT_ADMIN` ; jamais en production réelle | S1 |

---

## Phase 8 — Matrice rôles × écrans

**Objectif** : aucun rôle ne doit rencontrer un écran vide, une erreur, ou une
donnée qui ne le regarde pas. 16 rôles × 84 pages = 1 344 cases : on **échantillonne
intelligemment** plutôt que de tout parcourir à l'aveugle.

### Méthode

1. Construire la matrice complète en tableur (`docs/CONTROLE/matrice-roles.csv`)
   à partir de `src/lib/permissions.ts` : pour chaque couple (rôle, page),
   marquer *attendu* = `Accessible` / `Refusé` / `Non listé au menu`.
2. **Contrôle intégral** (obligatoire) sur les pages sensibles : `/direction`,
   `/notes`, `/notes/bulletins`, `/facturation`, `/caisse`, `/comptabilite`,
   `/rh`, `/infirmerie`, `/eleves`, `/parent`, `/eleve`, `/super-admin`,
   `/parametres/audit`, `/gouvernance`, `/inspection` → 15 pages × 16 rôles.
3. **Échantillon** (au moins 3 rôles représentatifs) sur les 69 pages restantes :
   `TENANT_ADMIN`, `TEACHER`, `PARENT`.
4. Comptes de test : `pnpm exec tsx scripts/qa-comptes-demo.ts` puis
   `scripts/qa-multi-roles.ts` ; mot de passe démo Ambouli documenté hors du
   rapport.

### Critères par case

| Critère | Attendu |
|---|---|
| Accès | Conforme à la matrice ; un refus renvoie `/acces-bloque`, pas une erreur 500 |
| Contenu | **Non vide** quand des données existent pour ce rôle à cette date |
| Périmètre | Uniquement le tenant / site / année de la session |
| Erreurs console | 0 erreur JS, 0 requête réseau en 4xx/5xx non intentionnelle |
| i18n | Aucun libellé brut ni clé technique visible |
| Design | Conforme à `DESIGN.md` (phase 10) |

### Rôles à ne pas oublier

`SUPER_ADMIN`, `TENANT_ADMIN`, `PRINCIPAL`, `SECRETARY`, `TEACHER`,
`CLASS_TEACHER`, `COUNSELOR`, `NURSE`, `ACCOUNTANT`, `CAISSIER`, `SUPERVISOR`,
`SUBJECT_LEAD`, `SITE_MANAGER`, `INSPECTOR`, `PARENT`, `STUDENT`.

> `INSPECTOR` mérite une attention particulière : lecture seule **et** pas de
> données nominatives inutiles. Toute donnée nominative superflue visible par ce
> rôle est **S1**.

---

## Phase 9 — Internationalisation

| ID | Contrôle | Commande | Attendu | Sév. |
|---|---|---|---|---|
| 9.1 | Parité des clés | Comparer les jeux de clés de `src/i18n/fr.json`, `en.json`, `so.json` | Aucune clé manquante ; les replis français de `so.json` sont **inventoriés** (dette connue) | S3 |
| 9.2 | Codes d'erreur d'API traduits | `pnpm exec vitest run src/**/erreurs-api.test.ts` | Aucun code sans traduction dans les 3 langues | S2 |
| 9.3 | Erreurs hors LEARNOS | `grep -rn "message: \"[A-ZÀ-Ü]" src/app/api/` | Inventaire des routes encore en français figé (`api/eleves`, `api/facturation`, `api/rh`…) — dette connue, à chiffrer | S3 |
| 9.4 | Rendu par locale | Parcourir 10 écrans clés dans les 3 langues | Aucun texte tronqué, aucune clé technique affichée | S3 |
| 9.5 | Textes générés | Bulletins, alertes, bot parent | Traduits via clé + paramètres, pas par concaténation | S2 |

---

## Phase 10 — Conformité au design

Référence : `DESIGN.md` (obligation du `CLAUDE.md` projet — aucune décision
visuelle hors de ce document).

| ID | Contrôle | Attendu | Sév. |
|---|---|---|---|
| 10.1 | Typographie | Polices, tailles, graisses conformes à `DESIGN.md` sur 15 écrans | S3 |
| 10.2 | Couleurs | Palette conforme ; aucune couleur codée en dur hors des jetons Tailwind | S3 |
| 10.3 | Espacements et grille | Conformes | S3 |
| 10.4 | Mode sombre | Cohérent sur les 15 écrans (`next-themes`) | S3 |
| 10.5 | Responsive | 375 px / 768 px / 1440 px : aucun débordement horizontal | S3 |
| 10.6 | Documents PDF | Bulletins, attestations, factures : conformes à la charte | S3 |
| 10.7 | Écarts relevés | Liste consolidée avec capture avant/après proposée | S4 |

---

## Phase 11 — Performance et robustesse

| ID | Contrôle | Méthode | Attendu | Sév. |
|---|---|---|---|---|
| 11.1 | **`/direction` et le pool de connexions** | Charger la page 10 fois de suite | Aucune erreur `EMAXCONNSESSION`. **Limite dev connue** : ~24 requêtes concurrentes contre 15 connexions sur `DIRECT_URL` (port 5432). En production (pooler transaction, port 6543) le plafond disparaît → contrôle à refaire **en configuration production** avant de conclure | S2 (S1 si reproduit en prod) |
| 11.2 | Requêtes N+1 | Journal Prisma sur les 10 pages les plus lourdes | Aucun schéma N+1 non justifié | S3 |
| 11.3 | Temps de réponse | Mesure sur les 15 pages sensibles, données Ambouli complètes | < 2 s en local, < 3 s via le tunnel | S3 |
| 11.4 | Génération de masse | 100 bulletins PDF d'affilée | Aboutit sans fuite mémoire ni timeout | S2 |
| 11.5 | Imports volumineux | Import EDT et import de programme sur les plus gros fichiers disponibles | Aboutit ou échoue proprement avec message explicite — jamais de demi-import | S2 |
| 11.6 | Taille du bundle | Sortie de `pnpm build` | Aucune régression notable ; **aucun Prisma dans un bundle client** | S2 |
| 11.7 | Résilience | Couper la base pendant une requête | Message d'erreur propre, pas de page blanche | S3 |

---

## Phase 12 — Build, conteneur, déploiement, reprise

| ID | Contrôle | Commande | Attendu | Sév. |
|---|---|---|---|---|
| 12.1 | Build Next.js | `pnpm build` | Réussit. **Obligatoire** dès qu'une route ou un composant a changé : il attrape ce que `tsc` et ESLint laissent passer (`docs/learnos-etat.md`) | S1 |
| 12.2 | Build Docker | `make docker-build` | Image construite. Vérifier que le **typecheck reste sauté uniquement dans Docker** (commit `249610f`) et qu'il est bien exécuté ailleurs (12.1 / CI) — sinon le filet est troué | S1 |
| 12.3 | Client Prisma dans l'image | Inspecter l'image | Client généré présent, `binaryTargets` `debian-openssl-3.0.x` (commit `892a9a0`) | S1 |
| 12.4 | Mémoire de build | Rejouer le build complet | Pas d'OOM (commits `36f4f19`, `6065532`) ; noter la limite de heap retenue | S2 |
| 12.5 | Configuration compose | `make compose-validate` | Valide ; les 9 services attendus présents | S2 |
| 12.6 | Démarrage de la stack | `make up` puis `make status` | Tous les conteneurs `healthy` | S1 |
| 12.7 | Étape de migration | Service `migrate` du compose | S'exécute avant `app`, idempotent, et échoue **bruyamment** si une migration casse | S1 |
| 12.8 | Vérification post-déploiement | Section dédiée du `RUNBOOK.md` | Tous les points passent | S1 |
| 12.9 | Rollback applicatif | `make rollback` sur un environnement de test | Retour à `ecolpro/app:previous` en < 5 min, application fonctionnelle | S1 |
| 12.10 | Sauvegarde | `make backup` | Sauvegarde pgBackRest créée, listée par `make backup-list` | S1 |
| 12.11 | **Restauration testée** | `make backup-verify` | Restauration sur base scratch réussie, comptages conformes à 3.11. *Une sauvegarde jamais restaurée n'est pas une sauvegarde* | S1 |
| 12.12 | Reprise après sinistre | Exercice complet du `RUNBOOK.md` (VPS neuf, dépôt hors site R2) | RTO mesuré et comparé à l'objectif ; **point de rupture identifié : la clé age** — vérifier qu'elle est sauvegardée hors de la machine | S1 |
| 12.13 | Audit du VPS | `make audit`, `make audit-db`, `make trivy` | Score d'audit relevé, rôles/RLS/pgaudit conformes, aucune CVE critique dans les images | S1 |
| 12.14 | Tunnel Cloudflare | Procédure du RUNBOOK | Tunnel `Healthy`, hostname correctement routé | S2 |
| 12.15 | Fly.io | `fly.toml` + `Dockerfile` | Le déploiement `schoolpro-djib` aboutit et répond ; cohérence avec la cible VPS documentée (deux cibles = deux procédures à maintenir — décision à acter) | S2 |
| 12.16 | Mobile | `pnpm cap:sync` + build iOS/Android | Applications construites, `CAP_SERVER_URL` correct | S3 |

---

## Phase 13 — Intégration continue et gardes

| ID | Contrôle | Attendu | Sév. |
|---|---|---|---|
| 13.1 | `ci.yml` vert sur la branche | Lint + typecheck + tests unitaires passent en CI, pas seulement en local | S1 |
| 13.2 | `security.yml` — job `isolation` | Le labo PostgreSQL monte en CI et les tests RLS **bloquent** la fusion en cas d'échec | S1 |
| 13.3 | Détection de secrets | Job actif et bloquant | S1 |
| 13.4 | CVE | Critiques bloquantes, moyennes informatives — comportement conforme à l'intention documentée dans le workflow | S2 |
| 13.5 | CodeQL | S'exécute, résultats revus | S3 |
| 13.6 | Exécution planifiée | Le cron du lundi 05:00 UTC a bien tourné les 4 dernières semaines | S3 |
| 13.7 | Hook de pré-commit | `node scripts/install-hooks.mjs` puis commit test | `tsc --noEmit` + lint exécutés avant chaque commit | S2 |
| 13.8 | **Écart CI / contrôle manuel** | Comparer ce que la CI vérifie avec les phases 1 à 5 | Tout contrôle S1 non couvert par la CI doit soit y entrer, soit être inscrit au rituel documenté | S2 |

---

## Phase 14 — Clôture : Go / No-Go

### 14.1 Livrables

1. `docs/CONTROLE/RAPPORT.md` — synthèse par phase, avec taux de réussite
2. `docs/CONTROLE/REGISTRE-ANOMALIES.md` — registre complet, trié par sévérité
3. `docs/CONTROLE/matrice-roles.csv` — matrice rôles × écrans renseignée
4. `docs/CONTROLE/preuves/` — l'ensemble des preuves
5. Mise à jour de `docs/learnos-etat.md` (section « Reste ») et de `QA_REPORT.md`

### 14.2 Critères de sortie

| Décision | Condition |
|---|---|
| **GO production** | 0 anomalie S1 ouverte · 0 S2 sur les workflows W-1 à W-9 · phases 0-5, 12, 13 intégralement `OK` · restauration de sauvegarde prouvée (12.11) |
| **GO démonstration commerciale** | 0 S1 · 0 S2 sur W-1, W-3, W-4, W-9, W-11 · phase 7 (Time Machine) intégralement `OK` |
| **NO-GO** | Toute S1 ouverte, ou un workflow qui n'atteint pas son résultat métier |

### 14.3 Ce qui est explicitement hors périmètre

À déclarer dans le rapport pour qu'aucun lecteur ne croie ces points couverts :

- Tests de charge multi-utilisateurs réalistes (aucun outil en place)
- Accessibilité (WCAG) — non traitée à ce jour
- OCR des PDF scannés — fonctionnalité connue comme absente
   (`docs/learnos-etat.md`, point 1 du « Reste »)
- Locales somali complète et arabe/RTL — dette connue
- Apprentissage statistique des prérequis — bloqué faute d'une année de données

---

## Annexes

### Annexe A — Fiche de contrôle (gabarit)

```markdown
### [ID] — [Titre]

- **Phase** :
- **Objectif métier** : (le résultat attendu, pas l'absence d'erreur)
- **Prérequis** : (état de la base, rôle, date Time Machine)
- **Procédure** :
  1.
  2.
- **Résultat attendu (chiffré)** :
- **Résultat obtenu** :
- **Preuve** : `docs/CONTROLE/preuves/<ID>/…`
- **État** : OK / ÉCHEC / PARTIEL / BLOQUÉ / NON APPLICABLE
- **Anomalie** : (référence au registre, ou « aucune »)
- **Exécuté par / le** :
```

### Annexe B — Registre d'anomalies (gabarit)

| N° | Sév. | Phase / ID | Titre | Description | Impact métier | Reproduction | Correctif proposé | État |
|---|---|---|---|---|---|---|---|---|
| A-001 | S1 | 4.3 | … | … | … | … | … | Ouverte |

### Annexe C — Ordre d'exécution et dépendances

```
Phase 0 (gel)
   └─> Phase 1 (statique) ──> Phase 2 (tests)
                                   └─> Phase 3 (base) ──> Phase 4 (isolation)
                                                              └─> Phase 5 (sécurité)
                                                                     ├─> Phase 6 (workflows) ─┬─> Phase 7 (Time Machine)
                                                                     │                        ├─> Phase 8 (rôles × écrans)
                                                                     │                        ├─> Phase 9 (i18n)
                                                                     │                        ├─> Phase 10 (design)
                                                                     │                        └─> Phase 11 (perf)
                                                                     └─> Phase 12 (déploiement) ──> Phase 13 (CI)
                                                                                                        └─> Phase 14 (clôture)
```

Les phases 7 à 11 sont parallélisables entre elles une fois la phase 6 engagée.

### Annexe D — Commandes de contrôle, en un bloc

```bash
# Phase 0-2 — statique et tests
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm verify                 # lint + tsc + vitest + prisma validate + audit
pnpm test:coverage
pnpm rls:check

# Phase 3 — base et jeu de démonstration
pnpm seed:check
pnpm audit:sites
pnpm exec tsx scripts/audit-demo-ambouli.ts
pnpm exec tsx scripts/audit-annee.ts
pnpm exec tsx scripts/diagnostic-sites.ts

# Phase 4 — isolation prouvée en base
make rls-full               # test-db-up + rls-apply-test + rls-test
make test-db-down

# Phase 6 — workflows
pnpm exec tsx scripts/demo-learnos.ts
pnpm exec tsx scripts/demo-bot-parent.ts --alertes
PLAYWRIGHT_BASE_URL=http://localhost:3001 pnpm test:e2e

# Phase 12 — build et exploitation
pnpm build
make compose-validate
make docker-build
make backup && make backup-verify
make audit && make audit-db && make trivy
make secrets-check
```

### Annexe E — Risques d'exécution du contrôle lui-même

| Risque | Conséquence | Parade |
|---|---|---|
| Contrôle exécuté sur la base de démonstration commerciale | Données de démo abîmées avant un rendez-vous | Phase 0.7 (`pnpm guard:db`) + 0.8 (dump préalable) ; travailler sur une copie |
| Saturation du pool en développement | Faux échecs interprétés comme des bugs | Ne lancer aucun script d'analyse pendant les phases 6-8 ; refaire le contrôle en configuration production |
| Arbre de travail non commité | Résultats non reproductibles, anomalies non attribuables | Phase 0.1, bloquante |
| Tests E2E lancés contre un serveur résiduel sur le port 3001 | Échecs fantômes (« Application error ») | Vérifier qu'aucun `next dev` ne tourne avant de démarrer ; `reuseExistingServer` est actif |
| Fatigue de contrôle (1 344 cases de matrice) | Cases cochées sans vérification réelle | Échantillonnage assumé de la phase 8 : contrôle intégral sur 15 pages sensibles, échantillon documenté ailleurs |
| Confusion « écran vide » vs « année vide » | Fausses anomalies en Oct 2026 | Contrôle 7.7 : le vide attendu est documenté |
