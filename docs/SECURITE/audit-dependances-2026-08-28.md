# Audit de dépendances — SchoolPro / LEARNOS

**Date :** 28 août 2026
**Outil :** `pnpm audit` + `pnpm outdated`
**Gestionnaire :** pnpm 11.21.0
**Total dépendances :** 1 013 (432 prod + 482 dev + 152 optional)

---

## 1. Vulnérabilités connues (CVE / GHSA)

### Synthèse

| Sévérité | Count |
|----------|-------|
| Critical | 0 |
| High     | 4     |
| Moderate | 1     |
| Low      | 0     |
| Info     | 0 |
| **Total** | **5** |

### Détail par vulnérabilité

#### 1.1 `brace-expansion` — DoS par expansion non bornée (HIGH ×2)

| Champ | Valeur |
|-------|--------|
| GHSA | GHSA-mh99-v99m-4gvg + GHSA-rgw5-rvv9-x895 |
| CVE | CVE-2026-14257 + contournement du fix |
| Sévérité | **High** |
| Version affectée | ≥4.0.0 <5.0.9 |
| Version corrigée | ≥5.0.9 |
| Version installée | 5.0.7 |
| CWE | CWE-400, CWE-770 (DoS) |

**Chemins d'accès :**
- `archiver > readdir-glob > minimatch > brace-expansion` (prod)
- `eslint-config-next > @typescript-eslint/* > minimatch > brace-expansion` (dev, 10+ chemins)

**Impact :** Un attaquant peut provoquer un épuisement de mémoire (OOM) via des patterns de glob malveillants, causant un crash du processus Node.js.

**Recommandation :**
- `archiver` est utilisé pour la génération d'archives ZIP (exports). Mettre à jour `archiver` vers une version qui pin `brace-expansion@≥5.0.9`.
- Les chemins via `eslint-config-next` sont en dev-only : risque nul en production mais mettre à jour ESLint à la prochaine montée de version.

#### 1.2 `js-yaml` — Consommation CPU quadratique (HIGH, dev-only)

| Champ | Valeur |
|-------|--------|
| GHSA | GHSA-5p4m-2wfm-xmqj |
| Sévérité | **High** |
| Version affectée | ≥4.0.0 <4.3.1 |
| Version corrigée | ≥4.3.1 |
| Version installée | 4.3.0 |
| CWE | CWE-407 (Algorithme inefficace) |

**Chemins :** Exclusivement via `eslint` et `eslint-config-next` (devDependencies). 46 chemins transittes.

**Impact :** Parsing YAML avec complexité quadratique sur `!!omap`. Un fichier YAML malformé peut saturer le CPU. **Non exploitable en production** (ESLint n'est pas bundlé).

**Recommandation :** Mettre à jour `eslint` vers v9+ qui embarque `js-yaml@≥4.3.1`. Priorité basse (dev-only).

#### 1.3 `deepmerge-ts` — Épuisement de pile (HIGH)

| Champ | Valeur |
|-------|--------|
| GHSA | GHSA-ggr8-5vv4-36mx |
| Sévérité | **High** |
| Version affectée | <8.0.0 |
| Version corrigée | ≥8.0.0 |
| Version installée | 7.1.5 |
| CWE | CWE-674 (Récursion non contrôlée) |

**Chemins :**
- `@prisma/client > prisma > @prisma/config > deepmerge-ts` (prod)
- `prisma > @prisma/config > deepmerge-ts` (dev)

**Impact :** Un objet récursif passé à `deepmerge` provoque un stack overflow. En pratique, les données fusionnées par Prisma sont internes et contrôlées : le risque d'exploitation est faible mais théorique.

**Recommandation :** Mettre à jour `prisma` et `@prisma/client` vers v7+ qui embarque `deepmerge-ts@≥8.0.0`. Voir section 3.

#### 1.4 `uuid` — Dépassement de buffer (MODERATE)

| Champ | Valeur |
|-------|--------|
| GHSA | GHSA-w5hq-g745-h8pq |
| Sévérité | **Moderate** |
| Version affectée | <11.1.1 |
| Version corrigée | ≥11.1.1 |
| Version installée | 8.3.2 |
| CWE | CWE-787, CWE-1285 |

**Chemin :** `exceljs > uuid` (prod)

**Impact :** Lors de la génération d'UUID v3/v5/v6 avec un buffer fourni, une vérification de bornes manquante peut causer un dépassement. `exceljs` utilise `uuid` pour générer des identifiants de cellules : le buffer est interne, le risque est faible.

**Recommandation :** Mettre à jour `exceljs` vers une version qui pin `uuid@≥11.1.1`. En attendant, le risque est limité car les UUID générés sont internes au fichier Excel.

---

## 2. Paquets obsolètes (pnpm outdated)

### 2.1 Mises à jour majeures — Production (risque de breaking change)

| Paquet | Actuel | Dernier | Risque | Priorité |
|--------|--------|---------|--------|----------|
| `next` | 15.5.22 | 16.3.3 | Breaking (App Router, middleware) | **Haute** |
| `@prisma/client` | 6.19.3 | 7.10.0 | Breaking (API client, types) | **Haute** |
| `prisma` | 6.19.3 | 8.0.0-rc.12 | RC — ne pas utiliser en prod | Attendre stable |
| `zod` | 3.25.76 | 4.4.3 | Breaking (API, schémas) | **Haute** |
| `bcryptjs` | 2.4.3 | 3.0.3 | Breaking (API async) | **Haute** (sécurité) |
| `jose` | 5.10.0 | 6.2.10 | Breaking (JWT API) | Moyenne |
| `recharts` | 2.15.4 | 3.10.1 | Breaking (composants) | Basse (UI) |
| `resend` | 4.8.0 | 6.24.0 | Breaking (API email) | Moyenne |
| `stripe` | 22.3.0 | 22.6.0 | Mineure | Basse |
| `@hookform/resolvers` | 3.10.0 | 5.9.1 | Breaking (zod adapter) | Moyenne |
| `lucide-react` | 0.469.0 | 1.34.0 | Renommages d'icônes | Basse (UI) |
| `sonner` | 1.7.4 | 2.0.8 | Breaking (API toast) | Basse (UI) |
| `tailwind-merge` | 2.6.1 | 3.6.0 | Breaking (API merge) | Basse (UI) |
| `@capacitor/*` | 6.x | 8.x | Breaking (mobile native) | Moyenne (mobile) |

### 2.2 Mises à jour majeures — Développement

| Paquet | Actuel | Dernier | Risque |
|--------|--------|---------|--------|
| `eslint` | 8.57.1 | 10.9.1 | Flat config, breaking |
| `eslint-config-next` | 15.5.20 | 16.3.3 | Suit Next.js |
| `typescript` | 5.9.3 | 7.0.2 | Breaking (types stricts) |
| `tailwindcss` | 3.4.19 | 4.3.3 | Engine rewrite, breaking |
| `@types/node` | 20.x | 26.x | Types Node 26 |

### 2.3 Mises à jour mineures / patchs (sûres)

| Paquet | Actuel | Dernier | Action |
|--------|--------|---------|--------|
| `react` / `react-dom` | 19.2.7 | 19.2.8 | Patch — mettre à jour |
| `@supabase/supabase-js` | 2.112.3 | 2.112.4 | Patch — mettre à jour |
| `@radix-ui/*` (14 paquets) | divers | divers | Patches — mettre à jour |
| `papaparse` | 5.5.4 | 5.7.0 | Mineure — mettre à jour |
| `next-intl` | 4.13.2 | 4.14.0 | Mineure — mettre à jour |
| `sharp` | 0.35.3 | 0.35.4 | Patch — mettre à jour |
| `unpdf` | 1.8.0 | 1.8.1 | Patch — mettre à jour |
| `tsx` | 4.23.0 | 4.23.12 | Patch — mettre à jour |
| `vitest` | 4.1.10 | 4.1.11 | Patch — mettre à jour |

### 2.4 Paquets dépréciés

| Paquet | Statut | Remplacement |
|--------|--------|--------------|
| `@otplib/preset-default` | Déprécié | `@otplib/preset-default` → utiliser `otpauth` (déjà présent) |
| `@types/bcryptjs` | Déprécié (3.0.0) | `bcryptjs@3` inclut ses propres types |

---

## 3. Plan de remédiation

### Phase 1 — Immédiat (patches sûrs, 0 risque)

```bash
pnpm update react react-dom @supabase/supabase-js sharp unpdf tsx vitest \
  @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-popover \
  @radix-ui/react-progress @radix-ui/react-scroll-area @radix-ui/react-select \
  @radix-ui/react-separator @radix-ui/react-slot @radix-ui/react-switch \
  @radix-ui/react-tabs @radix-ui/react-tooltip
```

### Phase 2 — Court terme (vulnérabilités HIGH)

1. **`deepmerge-ts`** : Mettre à jour `prisma` + `@prisma/client` vers v7.10.0
   - Tester `pnpm prisma generate` + `pnpm tsc --noEmit`
   - Vérifier les breaking changes de l'API client
2. **`brace-expansion`** : Vérifier si `archiver@≥8.0.1` pin la version corrigée
3. **`uuid`** : Vérifier si `exceljs@≥4.4.1` pin `uuid@≥11`

### Phase 3 — Moyen terme (mises à jour majeures sécurisées)

1. **`bcryptjs@3`** : Migration de l'API (async par défaut). Audit de tous les `bcrypt.compare` / `bcrypt.hash`
2. **`zod@4`** : Migration des schémas (`.parse` API change). 50+ fichiers concernés
3. **`next@16`** : Migration App Router + middleware. Tester CSP, headers, server actions

### Phase 4 — Long terme (refontes)

1. **`tailwindcss@4`** : Engine rewrite, configuration CSS-first
2. **`eslint@9+`** : Flat config, résout `js-yaml` et `brace-expansion` dev
3. **`typescript@7`** : Stricter type checking
4. **`@capacitor@8`** : Migration mobile native (Android/iOS)

---

## 4. Configuration CSP et headers de sécurité

L'audit confirme que la configuration de sécurité est **solide** :

| Header | Valeur | Statut |
|--------|--------|--------|
| Content-Security-Policy | default-src 'self'; script-src sans unsafe-eval en prod | ✅ |
| X-Frame-Options | DENY | ⚠️ Conflit avec frame-ancestors 'self' (workspace iframes) |
| X-Content-Type-Options | nosniff | ✅ |
| Referrer-Policy | strict-origin-when-cross-origin | ✅ |
| Strict-Transport-Security | max-age=31536000; includeSubDomains; preload | ✅ (prod) |
| Permissions-Policy | camera, microphone, geolocation, payment désactivés | ✅ |

**Point d'attention :** `X-Frame-Options: DENY` entre en conflit avec `frame-ancestors 'self'` utilisé pour les iframes du workspace. Les navigateurs modernes ignorent `X-Frame-Options` quand `frame-ancestors` est présent dans la CSP, mais il faut vérifier la compatibilité avec les navigateurs plus anciens.

---

## 5. Recommandations transverses

1. **Activer Dependabot / Renovate** sur le dépôt pour les alertes automatiques
2. **Scanner SCA régulier** : Intégrer `pnpm audit --prod` dans le CI (échec sur HIGH/CRITICAL)
3. **Pin les versions** : Utiliser `pnpm-lock.yaml` comme source de vérité, jamais `^` en production
4. **Audit des licences** : `pnpm licenses list` pour vérifier la conformité (GPL, MIT, Apache)
5. **Surveiller les advisories** : S'abonner aux GHSA pour `next`, `next-auth`, `prisma`, `zod`
