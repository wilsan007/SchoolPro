# Migration Next 15 → 16

**Date** : 29/09/2026 · **Branche** : `chore/next-16` · **Base** : `7363b6e`

| | Avant | Après |
|---|---|---|
| `next` | 15.5.24 | **16.3.6** |
| `eslint-config-next` | 15.5.20 | **16.3.6** |
| `next-intl` | 4.14.4 | **4.14.7** |
| `react` | 19.2.7 | 19.2.7 (inchangé) |
| Node | 22 (`engines: >=22`) | 22 (Next 16 exige ≥ 20.9) |

## Pourquoi 16.3.6 et non 16.3.7

`16.3.7` **est** la dernière version publiée, mais elle est sortie le jour même
(29/09 à 09:04 UTC) et `next-intl@4.14.8` (11:11 UTC) tire `@eloqnt/*@0.1.1`,
publié le même jour à 10:04. Le dépôt applique une **politique de chaîne
d'approvisionnement** qui écarte les versions trop fraîches : `pnpm add
next@latest` résout donc naturellement en 16.3.6.

Forcer 16.3.7 a un coût visible : pnpm écrit alors une **dérogation**
(`minimumReleaseAgeExclude`) dans `pnpm-workspace.yaml` pour contourner la
politique — y compris pour `@eloqnt/*`, qui est une dépendance transitive. Une
telle dérogation est un **choix de sécurité**, pas un effet de bord
d'installation : elle se décide, ne s'hérite pas. `16.3.6` est publié depuis le
22/09 (7 jours de recul), passe la politique **sans aucune dérogation**, et
`pnpm install --frozen-lockfile` reste vert.

Pour monter en 16.3.7 plus tard : `pnpm add next@16.3.7
eslint-config-next@16.3.7 next-intl@4.14.8`, puis **relire** le bloc
`minimumReleaseAgeExclude` ajouté et le committer sciemment.

## Ruptures rencontrées et traitement

### 1. `middleware.ts` → `proxy.ts` (v16.0.0)

« Middleware » devient « Proxy ». Le codemod officiel
(`npx @next/codemod@canary middleware-to-proxy .`) fait deux choses : renommer
le fichier **et** renommer l'export `middleware` → `proxy`. Les deux ont été
faites. Le build confirme la reconnaissance : la sortie affiche
`ƒ Proxy (Middleware)`.

**Point de vigilance** : en v16 le proxy s'exécute par défaut dans le runtime
**Node.js**, alors que le middleware tournait en **Edge**. Ce fichier n'utilise
que `NextResponse`, `getToken` et du rate limiting en mémoire — le changement
est neutre ici. En revanche l'ancien commentaire « `auth()` ne remonte pas
`role` dans le runtime Edge » décrivait une limite du Edge : elle **mérite d'être
réévaluée séparément**, pas pendant une montée de version.

### 2. `revalidateTag` exige désormais 2 arguments — 85 appels, 26 fichiers

```ts
// v15
revalidateTag("dashboard-data");
// v16 — le second argument est OBLIGATOIRE
revalidateTag("dashboard-data", { expire: 0 });
```

La forme à un argument est dépréciée : elle ne compile plus. Choix retenu :
**`{ expire: 0 }` partout** (expiration immédiate), et non `'max'` ni `updateTag` :

- `'max'` (stale-while-revalidate) est la recommandation générale de la doc,
  mais elle **accepte de servir des données périmées** au premier affichage.
  Pour un logiciel de gestion scolaire, où l'on vient d'enregistrer une note ou
  une absence avant de regarder un tableau de bord, c'est une régression
  visible : la valeur affichée ne serait pas la valeur enregistrée.
- `updateTag(tag)` est l'API recommandée **dans une Server Action** (lecture de
  ses propres écritures). Elle **lève une exception hors de ce contexte**, et
  des modules d'action sont importés ailleurs dans le projet
  (`src/app/api/parametres/classes/export/route.ts` importe
  `@/lib/actions/parametres`). Introduire une contrainte d'exécution invisible
  pendant une montée de version, c'est créer une panne de production.
- `{ expire: 0 }` est documenté pour « expirer immédiatement », **valide dans
  les deux contextes**, et reproduit exactement le comportement précédent.

Adopter `updateTag` (lecture de ses propres écritures) reste une **amélioration**
souhaitable : elle mérite son propre changement, avec ses propres tests.

### 3. L'option `eslint` de `next.config` a disparu

`next lint` étant retiré en 16, la clé `eslint: { ignoreDuringBuilds: true }`
n'existe plus. Elle est supprimée. Sans conséquence : le lint est déjà lancé
explicitement (`pnpm lint` → ESLint 9 en flat config), en local comme en CI.

### 4. `eslint-config-next@16` ne publie plus de config « eslintrc »

Ses fichiers `dist/` sont désormais des **flat configs**. Les passer par
`FlatCompat.extends("next/core-web-vitals")` — c'est-à-dire les traiter comme de
l'eslintrc — faisait échouer ESLint sur
`TypeError: Converting circular structure to JSON`. On importe donc le flat
config directement, et le plugin `react-hooks` est ré-enregistré dans l'objet
qui redéfinit ses règles (règle du flat config).

### 5. Les règles React Compiler arrivent en « error » : 81 motifs préexistants

`eslint-config-next@16` embarque la nouvelle génération de règles `react-hooks`
(React Compiler), **activées en « error »**, et signale 81 motifs qui existaient
**avant** la montée — aucun n'a été introduit par elle :

| Règle | Occurrences |
|---|---|
| `react-hooks/set-state-in-effect` | 64 |
| `react-hooks/static-components` | 11 |
| `react-hooks/immutability` | 2 |
| `set-state-in-render`, `refs`, `error-boundaries`, `preserve-manual-memoization` | 1 chacun |

Les corriger impose de **restructurer** des effets et des composants : c'est un
changement de **comportement**, qui ne doit pas voyager en passager clandestin
d'une montée de version. Elles sont donc passées en **`warn`**, chacune nommée
explicitement (aucun joker, pour qu'une règle future se manifeste en `error`).
Objectif : 0, puis retour en `error` — le chemin déjà parcouru par
`ecolpro/require-annee-filter` (380 → 0).

### 6. `tsconfig.json` modifié automatiquement par Next 16

Next a appliqué deux changements, dont un **obligatoire** :

- `jsx` passe de `preserve` à **`react-jsx`** (runtime React automatique) ;
- `.next/dev/types/**/*.ts` rejoint `include`.

Le premier était exigé par le build (« The following mandatory changes were
made ») : ce sont des modifications subies et non choisies, conservées telles
quelles.

## Vérifications

| Contrôle | Résultat |
|---|---|
| `pnpm tsc --noEmit` | ✅ 0 erreur |
| `pnpm lint` | ✅ 0 erreur, 84 avertissements (dont 81 nommés ci-dessus) |
| `pnpm test` | ✅ **142 fichiers / 2063 tests** — identique à la v15 |
| `pnpm build` | ✅ `Compiled successfully in 35.5s`, **301/301 pages**, `ƒ Proxy (Middleware)` |
| `pnpm install --frozen-lockfile` | ✅ EXIT=0, « Lockfile passes supply-chain policies » |
| `pnpm check:secrets` / `audit:annee` | ✅ inchangés (0 et 0) |

Le build passe par **Turbopack** (défaut en v16) : `output: "standalone"` et
`serverExternalPackages` (`tesseract.js`, `@napi-rs/canvas`, `sharp`) restent
honorés sans configuration supplémentaire.

## Suites à donner — assumées, non faites ici

1. **Dette React Compiler** : 81 avertissements à traiter un par un, puis la
   règle revient en `error`.
2. **Proxy en runtime Node.js** : réévaluer le commentaire sur `auth()` et, le
   cas échéant, simplifier le décodage JWT manuel.
3. **`updateTag`** dans les 9 fichiers de Server Actions : gain réel de
   cohérence (lecture de ses propres écritures), à faire avec des tests.
4. **3 avertissements `@next/next/no-location-assign-relative-destination`** :
   `window.location.href` utilisé pour une navigation interne
   (`LanguageSwitcher`, `SuperAdminHealth`, un troisième site).
5. **16.3.7** : ne monter qu'après relecture de la dérogation de politique.

## Déploiement et retour arrière

Aucun déploiement n'a été effectué depuis cette branche.

```bash
pnpm verify                       # lint + tsc + tests + prisma validate
git checkout main && git merge chore/next-16
fly deploy -a schoolpro           # production (Fly.io)
curl https://schoolpro.fly.dev/api/health
```

**Retour arrière** : la montée ne touche **aucune migration de base** ni aucun
format de données. Le rollback est donc purement applicatif — redéployer l'image
précédente (`fly releases`, puis l'image d'avant), ou `git revert` du merge.
C'est le point à surveiller en premier si le proxy en runtime Node.js change un
comportement d'authentification : c'est le seul endroit où la montée modifie un
chemin d'exécution.
