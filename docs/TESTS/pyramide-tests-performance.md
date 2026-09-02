# SchoolPro — Pyramide de tests et seuils de performance

**Inspiré de GOSE 2.0 (MENFOP Djibouti) — Spécification §13 Tests et recette.**

Le TDR de GOSE définit quatre axes de recette par lot : fonctionnelle,
performance, sécurité, documentation. Aucun lot n'est réceptionné si un
seul axe échoue. SchoolPro adopte la même rigueur.

---

## 1. Pyramide de tests

| Niveau | Volume cible | Portée | Durée cible | Outil |
|--------|-------------|--------|-------------|-------|
| Unitaires | ~70% | Domaine pur, sans base | < 30s | Vitest |
| Intégration | ~25% | Routes API avec Prisma mocké | < 3 min | Vitest |
| Fonctionnels | ~5% | Parcours complets HTTP | < 8 min | Vitest + jsdom |
| E2E | ~10 scénarios | Parcours critiques, navigateur réel | < 15 min | Playwright |

### 1.1 Tests unitaires (domaine pur)

Les tests unitaires valident la logique métier **sans aucune dépendance
infrastructure**. Ils vivent dans `src/lib/domain/*.test.ts` et ne mockent
rien (pas de Prisma, pas de Next.js, pas de Supabase).

```bash
pnpm vitest run --testsuite unit  # ou par fichier
```

**Conventions :**
- Un fichier `*.test.ts` à côté de chaque module du domaine
- Pas de `vi.mock()` — le domaine est pur
- Durée cible : < 1ms par test
- Couverture cible : 95% sur `src/lib/domain/`

### 1.2 Tests d'intégration (API + Prisma mocké)

Les tests d'intégration valident les routes API avec Prisma mocké.
Ils vivent dans `src/app/api/**/*.test.ts`.

```bash
pnpm vitest run src/app/api
```

**Conventions :**
- `vi.mock("@/lib/prisma")` avant `await import()`
- Helpers `req()` et `params()` pour construire les requêtes
- `vi.hoisted()` pour les mocks complexes
- Durée cible : < 100ms par test

### 1.3 Tests E2E (Playwright)

Les parcours E2E couvrent exclusivement les scénarios critiques qui, s'ils
échouent, arrêtent un établissement :

1. **Connexion** → tableau de bord → déconnexion
2. **Saisie de notes** → génération de bulletin → PDF
3. **Création d'absence** → justification parent → validation
4. **Inscription d'un élève** → génération de facture → paiement
5. **Réinscription** → promotion → activation nouvelle année
6. **Cahier-journal** → création de séance → validation
7. **Emploi du temps** → génération automatique → export
8. **Communication** → envoi de message → réception
9. **Multi-tenant** : un utilisateur du tenant A ne voit pas le tenant B
10. **Time Machine** : les données respectent la date simulée

```bash
pnpm test:e2e           # tous les scénarios
pnpm test:e2e:ui        # mode interactif
```

---

## 2. Seuils de performance

Seuils contractuels pour les opérations critiques. Au-delà, c'est un bug.

| Opération | Seuil p95 | Charge simultanée | Test |
|-----------|-----------|-------------------|------|
| Connexion | < 800 ms | 200 utilisateurs | E2E |
| Tableau de bord | < 1,5 s | 50 utilisateurs | E2E |
| Liste de 50 élèves | < 600 ms | 200 | API |
| Saisie d'une note | < 400 ms | 300 | API |
| Génération d'un bulletin PDF | < 5 s | 40 en parallèle | API |
| Lot de 100 bulletins | < 10 min | — | Script |
| Page cahier-journal | < 1 s | 50 | E2E |
| Page direction | < 2 s | 20 | E2E |
| Synchronisation mobile (100 opérations) | < 6 s | 100 appareils | API |
| Import de population | < 2 min | — | Script |

### Scénario de charge de référence : conseil de classe

Le pire moment de l'année est la fin du trimestre, quand des dizaines
d'établissements publient simultanément leurs bulletins. Le test de charge
simule 50 établissements publiant chacun 10 classes dans la même heure.

---

## 3. Couverture de code

| Module | Couverture cible | Actuelle |
|--------|-----------------|----------|
| `src/lib/domain/` | 95% | À mesurer |
| `src/lib/permissions.ts` | 90% | À mesurer |
| `src/lib/site-scope.ts` | 85% | À mesurer |
| `src/lib/actions/` | 70% | À mesurer |
| `src/app/api/` | 60% | À mesurer |

```bash
pnpm test:coverage
```

---

## 4. Vérification continue

### 4.1 Pre-commit (rapide)

```bash
# Installé par : node scripts/install-hooks.mjs
# Exécute : tsc --noEmit + next lint
```

### 4.2 Vérification complète (CI)

```bash
pnpm verify
# = lint + tsc --noEmit + vitest run + prisma validate + pnpm audit
```

### 4.3 Batterie de tests ordonnée (inspirée de GOSE)

| Étape | Contrôle | Commande | Attendu |
|-------|----------|----------|---------|
| A.1 | Intégrité du dépôt | `git grep "process.env.SECRET" -- src/ \| grep -v test` | 0 résultat |
| A.2 | Tests unitaires | `pnpm vitest run src/lib/domain` | 100% OK |
| A.3 | Tests d'intégration | `pnpm vitest run src/app/api` | 100% OK |
| A.4 | Cohérence schéma | `pnpm prisma validate` | OK |
| A.5 | Analyse statique | `pnpm tsc --noEmit` | 0 erreur |
| A.6 | Style de code | `pnpm lint` | 0 erreur |
| A.7 | Vulnérabilités | `pnpm audit --prod` | 0 CVE |
| A.8 | Tests E2E | `pnpm test:e2e` | 100% OK |
| A.9 | Couverture | `pnpm test:coverage` | ≥ seuils |
| A.10 | Build production | `pnpm build` | Succès |

---

## 5. Dette technique gelée

Inspiré de GOSE 2.0 / PHPStan :

> La dette technique doit RÉTRÉCIR à chaque sprint, jamais grandir.
> Aucune nouvelle entrée sans justification écrite.

- Le nombre d'erreurs TypeScript doit diminuer à chaque sprint
- Le nombre de `any` et `@ts-ignore` doit diminuer
- Le nombre de `console.log` en production doit diminuer
- Aucun `any` sans commentaire justificatif
- Aucun `@ts-ignore` sans commentaire justificatif
